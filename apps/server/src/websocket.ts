import type { WebSocket } from 'ws';
import type { SessionState } from './types.js';
import { transcribeAudio } from './whisper.js';
import { analyzeWithClaude, cleanTranscript } from './claude.js';
import { createDeepgramStream, isDeepgramEnabled } from './deepgram.js';
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
const AUDIO_CHUNK_DURATION_MS = 5000; // 5 seconds — fallback Whisper mode
const CLEAN_WORD_THRESHOLD = 80; // 累積 80 字以上才觸發修正

const USE_DEEPGRAM = isDeepgramEnabled();
console.log(`[STT] Provider: ${USE_DEEPGRAM ? 'Deepgram (streaming)' : 'Whisper (chunked)'}`);

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

// ── Whisper chunk-based processing (fallback) ──────────────────────────────

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
      handleTranscriptText(ws, session, text.trim(), true);
    }

    sendStatus(ws, 'recording');
  } catch (err) {
    console.error('Audio processing error:', err);
    sendStatus(ws, 'error', String(err));
    sendStatus(ws, 'recording');
  }
}

// ── Shared transcript handling ─────────────────────────────────────────────

function handleTranscriptText(
  ws: WebSocket,
  session: SessionState,
  text: string,
  isFinal: boolean,
  speaker?: number
): void {
  if (isFinal) {
    session.transcriptBuffer += ' ' + text;
    session.fullTranscript += ' ' + text;
    session.lastTranscript = text;
    session.chunkCount = (session.chunkCount || 0) + 1;
  }

  const transcriptMsg: TranscriptMessage = {
    type: 'transcript',
    text,
    isFinal,
    ...(speaker !== undefined && { speaker }),
  };
  send(ws, transcriptMsg);

  if (isFinal) {
    // 累積足夠字數才觸發語意修正（避免 Deepgram 高頻 final 造成過多請求）
    if (countWords(session.fullTranscript) % CLEAN_WORD_THRESHOLD < countWords(text)) {
      triggerCleanTranscript(ws, session);
    }

    // Check if we should trigger Claude analysis
    if (shouldAnalyze(session)) {
      triggerAnalysis(ws, session);
    }
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

// ── Main WebSocket handler ─────────────────────────────────────────────────

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

  // Whisper fallback state
  let audioAccumulator: Buffer[] = [];
  let audioAccumulatorDuration = 0;
  let flushTimer: NodeJS.Timeout | null = null;

  // Deepgram streaming state
  let dgStream: ReturnType<typeof createDeepgramStream> | null = null;

  console.log(`[WS] Client connected: ${session.id}`);
  sendStatus(ws, 'idle');

  // ── Whisper fallback functions ──

  async function flushAudio() {
    if (audioAccumulator.length === 0) return;
    const combined = Buffer.concat(audioAccumulator);
    audioAccumulator = [];
    audioAccumulatorDuration = 0;

    await processAudioChunk(ws, session, combined);
  }

  function scheduleFlush() {
    if (flushTimer) return;
    flushTimer = setTimeout(async () => {
      flushTimer = null;
      await flushAudio();
    }, AUDIO_CHUNK_DURATION_MS);
  }

  // ── Deepgram streaming functions ──

  function startDeepgram() {
    if (dgStream) {
      dgStream.close();
      dgStream = null;
    }
    try {
      dgStream = createDeepgramStream({
        onTranscript: (text, isFinal, speaker) => {
          if (session.isRecording) {
            handleTranscriptText(ws, session, text, isFinal, speaker);
          }
        },
        onError: (error) => {
          console.error(`[WS] ${session.id}: Deepgram error:`, error.message);
          sendStatus(ws, 'error', error.message);
        },
        onClose: () => {
          console.log(`[WS] ${session.id}: Deepgram stream closed`);
        },
      });
    } catch (err) {
      console.error(`[WS] ${session.id}: Failed to start Deepgram:`, err);
    }
  }

  function stopDeepgram() {
    if (dgStream) {
      dgStream.close();
      dgStream = null;
    }
  }

  // ── Message handler ──

  ws.on('message', async (raw) => {
    // Try to parse as JSON first (binaryType='arraybuffer' makes all messages arrive as Buffer)
    try {
      const text = raw.toString();
      const msg: ClientMessage = JSON.parse(text);
      if (msg && msg.type) {
        switch (msg.type) {
          case 'start':
            session.isRecording = true;
            session.language = msg.config?.language || 'zh';
            session.meetingId = msg.config?.meetingId || 'global';
            session.mimeType = msg.config?.mimeType || 'audio/webm';
            console.log(`[WS] ${session.id}: Start recording (${USE_DEEPGRAM ? 'Deepgram' : 'Whisper'}), mimeType: ${session.mimeType}`);
            session.transcriptBuffer = '';
            session.fullTranscript = '';
            session.lastAnalysisTime = Date.now();
            session.lastTranscript = '';
            session.chunkCount = 0;

            if (USE_DEEPGRAM) {
              startDeepgram();
            } else {
              audioAccumulator = [];
            }
            sendStatus(ws, 'recording');
            break;

          case 'audio':
            if (session.isRecording) {
              const data = typeof msg.data === 'string'
                ? Buffer.from(msg.data, 'base64')
                : Buffer.from(msg.data as ArrayBuffer);
              if (USE_DEEPGRAM && dgStream) {
                dgStream.send(data);
              } else {
                audioAccumulator.push(data);
                scheduleFlush();
              }
            }
            break;

          case 'stop':
            session.isRecording = false;
            if (USE_DEEPGRAM) {
              stopDeepgram();
            } else {
              if (flushTimer) {
                clearTimeout(flushTimer);
                flushTimer = null;
              }
              await flushAudio();
            }
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
                handleTranscriptText(ws, session, text, true);
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
        if (USE_DEEPGRAM && dgStream) {
          console.log(`[WS] Sending ${buf.length} bytes to Deepgram`);
          dgStream.send(buf);
        } else {
          audioAccumulator.push(buf);
          scheduleFlush();
        }
      }
    } catch (err) {
      console.error('[WS] Message handling error:', err);
    }
  });

  ws.on('close', () => {
    session.isRecording = false;
    stopDeepgram();
    if (flushTimer) clearTimeout(flushTimer);
    console.log(`[WS] Client disconnected: ${session.id}`);
  });

  ws.on('error', (err) => {
    console.error(`[WS] Error for ${session.id}:`, err);
  });
}
