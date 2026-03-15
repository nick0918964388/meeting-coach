import type { WebSocket } from 'ws';
import type { SessionState } from './types.js';
import { transcribeAudio } from './whisper.js';
import { analyzeWithClaude, cleanTranscript } from './claude.js';
import type {
  ClientMessage,
  ServerMessage,
  TranscriptMessage,
  CleanedTranscriptMessage,
  CoachMessage,
  StatusMessage,
} from '@meeting-coach/shared';

const ANALYSIS_INTERVAL_MS = 30 * 1000; // 30 seconds
const ANALYSIS_WORD_THRESHOLD = 200;
const AUDIO_CHUNK_DURATION_MS = 10000; // 10 seconds — short chunks hurt Whisper accuracy for Chinese
const CLEAN_CHUNK_INTERVAL = 3; // 每 3 個 chunk 觸發一次修正

function send(ws: WebSocket, msg: ServerMessage) {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function sendStatus(ws: WebSocket, status: StatusMessage['status'], message?: string) {
  send(ws, { type: 'status', status, message });
}

function countWords(text: string): number {
  // For CJK, count characters; for Latin, count spaces
  const cjk = (text.match(/[\u4e00-\u9fff\u3040-\u30ff]/g) || []).length;
  const latin = (text.trim().split(/\s+/).filter(Boolean)).length;
  return cjk + latin;
}

function shouldAnalyze(session: SessionState): boolean {
  const now = Date.now();
  const timeSinceLast = now - session.lastAnalysisTime;
  const newWords = countWords(session.transcriptBuffer);
  return (
    timeSinceLast >= ANALYSIS_INTERVAL_MS ||
    newWords >= ANALYSIS_WORD_THRESHOLD
  );
}

const MIN_AUDIO_BYTES = 1000; // skip tiny/empty chunks

async function processAudioChunk(
  ws: WebSocket,
  session: SessionState,
  chunk: Buffer
): Promise<void> {
  if (chunk.length < MIN_AUDIO_BYTES) {
    console.log(`[WS] Skipping tiny audio chunk: ${chunk.length} bytes`);
    return;
  }
  try {
    sendStatus(ws, 'processing');
    console.log(`[WS] transcribeAudio start: ${chunk.length} bytes, mimeType: ${session.mimeType}, lang: ${session.language}`);
    const text = await transcribeAudio(chunk, session.language, session.mimeType, session.lastTranscript);
    console.log(`[WS] transcribeAudio result: "${text}"`);

    if (text && text.trim()) {
      session.transcriptBuffer += ' ' + text.trim();
      session.fullTranscript += ' ' + text.trim();
      session.lastTranscript = text.trim();
      session.chunkCount = (session.chunkCount || 0) + 1;

      const transcriptMsg: TranscriptMessage = {
        type: 'transcript',
        text: text.trim(),
        isFinal: true,
      };
      send(ws, transcriptMsg);

      // 每 N 個 chunk 觸發語意修正
      if (session.chunkCount % CLEAN_CHUNK_INTERVAL === 0) {
        triggerCleanTranscript(ws, session);
      }

      // Check if we should trigger Claude analysis
      if (shouldAnalyze(session)) {
        await triggerAnalysis(ws, session);
      }
    }

    sendStatus(ws, 'recording');
  } catch (err) {
    console.error('Audio processing error:', err);
    sendStatus(ws, 'error', String(err));
    sendStatus(ws, 'recording');
  }
}

// 異步修正文字，不阻塞主流程
function triggerCleanTranscript(ws: WebSocket, session: SessionState): void {
  const textToClean = session.fullTranscript.trim();
  if (!textToClean || textToClean.length < 20) return;

  cleanTranscript(textToClean)
    .then((cleaned) => {
      const cleanedMsg: CleanedTranscriptMessage = {
        type: 'cleaned',
        text: cleaned,
      };
      send(ws, cleanedMsg);
      console.log(`[WS] ${session.id}: Sent cleaned transcript (${cleaned.length} chars)`);
    })
    .catch((err) => {
      console.error(`[WS] ${session.id}: Clean transcript error:`, err);
    });
}

async function triggerAnalysis(ws: WebSocket, session: SessionState): Promise<void> {
  const textToAnalyze = session.transcriptBuffer.trim();
  if (!textToAnalyze || textToAnalyze.length < 20) return;

  try {
    console.log(`[Claude] Analyzing ${countWords(textToAnalyze)} words...`);
    const coaching = await analyzeWithClaude(textToAnalyze, session.meetingId);
    send(ws, coaching);

    // Reset buffer after analysis, keep full transcript
    session.transcriptBuffer = '';
    session.lastAnalysisTime = Date.now();
  } catch (err) {
    console.error('Claude analysis error:', err);
  }
}

export function handleWebSocket(ws: WebSocket): void {
  const session: SessionState = {
    id: Math.random().toString(36).slice(2),
    isRecording: false,
    language: 'zh',
    meetingId: 'global',
    mimeType: 'audio/webm',
    transcriptBuffer: '',
    fullTranscript: '',
    lastAnalysisTime: Date.now(),
    wordCount: 0,
    audioBuffer: [],
    chunkCount: 0,
    lastTranscript: '',
  };

  let audioAccumulator: Buffer[] = [];
  let audioAccumulatorDuration = 0;
  let flushTimer: NodeJS.Timeout | null = null;
  // For fragmented MP4 (iOS Safari): first chunk contains the init segment (moov box).
  // Subsequent chunks are fragments and cannot be decoded without it.
  let mp4InitSegment: Buffer | null = null;

  console.log(`[WS] Client connected: ${session.id}`);
  sendStatus(ws, 'idle');

  async function flushAudio() {
    if (audioAccumulator.length === 0 || !session.isRecording) return;
    let combined = Buffer.concat(audioAccumulator);
    audioAccumulator = [];
    audioAccumulatorDuration = 0;

    // Fragmented MP4 fix: prepend init segment to every batch after the first
    if (session.mimeType.startsWith('audio/mp4')) {
      if (!mp4InitSegment) {
        // First flush — this IS the init segment (+ first audio data)
        mp4InitSegment = combined;
      } else {
        // Subsequent flushes — prepend init segment so Whisper can decode
        combined = Buffer.concat([mp4InitSegment, combined]);
      }
    }

    await processAudioChunk(ws, session, combined);
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      await flushAudio();
    }, AUDIO_CHUNK_DURATION_MS);
  }

  ws.on('message', async (raw) => {
    console.log('[WS] Received message type:', typeof raw, 'isBuffer:', raw instanceof Buffer, 'length:', (raw as any).length ?? (raw as any).byteLength ?? 0);

    // Try to parse as JSON first (binaryType='arraybuffer' makes all messages arrive as Buffer)
    try {
      const text = raw.toString();
      const msg: ClientMessage = JSON.parse(text);
      if (msg && msg.type) {
        console.log('[WS] JSON message:', JSON.stringify(msg));
        switch (msg.type) {
          case 'start':
            session.isRecording = true;
            session.language = msg.config?.language || 'zh';
            session.meetingId = msg.config?.meetingId || 'global';
            session.mimeType = msg.config?.mimeType || 'audio/webm';
            console.log('[WS] Start recording, mimeType:', msg.config?.mimeType);
            session.transcriptBuffer = '';
            session.fullTranscript = '';
            session.lastAnalysisTime = Date.now();
            audioAccumulator = [];
            mp4InitSegment = null;
            session.lastTranscript = '';
            sendStatus(ws, 'recording');
            console.log(`[WS] ${session.id}: Recording started (lang: ${session.language})`);
            break;

          case 'audio':
            if (session.isRecording) {
              // Handle base64 encoded audio
              const data = typeof msg.data === 'string'
                ? Buffer.from(msg.data, 'base64')
                : Buffer.from(msg.data as ArrayBuffer);
              audioAccumulator.push(data);
              scheduleFlush();
            }
            break;

          case 'stop':
            session.isRecording = false;
            if (flushTimer) {
              clearTimeout(flushTimer);
              flushTimer = null;
            }
            await flushAudio();
            // Final analysis
            if (session.transcriptBuffer.trim()) {
              await triggerAnalysis(ws, session);
            }
            sendStatus(ws, 'idle');
            console.log(`[WS] ${session.id}: Recording stopped`);
            break;

          case 'transcript_text':
            if (session.isRecording && (msg as { type: 'transcript_text'; text: string }).text) {
              const text = (msg as { type: 'transcript_text'; text: string }).text.trim();
              if (text) {
                session.transcriptBuffer += ' ' + text;
                session.fullTranscript += ' ' + text;
                session.chunkCount = (session.chunkCount || 0) + 1;

                const transcriptMsg: TranscriptMessage = {
                  type: 'transcript',
                  text,
                  isFinal: true,
                };
                send(ws, transcriptMsg);

                if (session.chunkCount % CLEAN_CHUNK_INTERVAL === 0) {
                  triggerCleanTranscript(ws, session);
                }

                if (shouldAnalyze(session)) {
                  await triggerAnalysis(ws, session);
                }
              }
            }
            break;

          case 'ping':
            send(ws, { type: 'pong' } as ServerMessage);
            break;
        }
        return;
      }
    } catch {
      // Not JSON — treat as binary audio data
    }

    // Binary audio data
    try {
      const buf = raw instanceof Buffer ? raw : Buffer.from(raw as ArrayBuffer);
      if (session.isRecording) {
        audioAccumulator.push(buf);
        scheduleFlush();
      }
    } catch (err) {
      console.error('[WS] Message handling error:', err);
    }
  });

  ws.on('close', () => {
    session.isRecording = false;
    if (flushTimer) clearTimeout(flushTimer);
    console.log(`[WS] Client disconnected: ${session.id}`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for ${session.id}:`, err);
  });
}
