import { createClient, LiveTranscriptionEvents } from '@deepgram/sdk';
import type { LiveSchema } from '@deepgram/sdk';

const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY || '';

export interface DeepgramStreamCallbacks {
  onTranscript: (text: string, isFinal: boolean) => void;
  onError: (error: Error) => void;
  onClose: () => void;
}

export function createDeepgramStream(callbacks: DeepgramStreamCallbacks) {
  if (!DEEPGRAM_API_KEY) {
    throw new Error('Missing DEEPGRAM_API_KEY environment variable');
  }

  const deepgram = createClient(DEEPGRAM_API_KEY);

  const options: LiveSchema = {
    model: 'nova-2',
    language: 'zh',
    smart_format: true,
    interim_results: true,
    utterance_end_ms: 1500,
    vad_events: true,
    endpointing: 500,
    encoding: 'opus',
    sample_rate: 48000,
  };

  console.log('[Deepgram] Creating live connection with options:', JSON.stringify(options));
  const connection = deepgram.listen.live(options);

  let isOpen = false;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  connection.on(LiveTranscriptionEvents.Open, () => {
    console.log('[Deepgram] Connection opened');
    isOpen = true;
    // Keep alive every 8 seconds
    keepAliveTimer = setInterval(() => {
      if (isOpen) connection.keepAlive();
    }, 8000);
  });

  connection.on(LiveTranscriptionEvents.Transcript, (data: any) => {
    const alt = data.channel?.alternatives?.[0];
    if (!alt) return;
    const transcript = alt.transcript;
    if (!transcript) return;

    const isFinal = data.is_final === true;
    console.log(`[Deepgram] ${isFinal ? 'Final' : 'Interim'}: "${transcript}"`);
    callbacks.onTranscript(transcript, isFinal);
  });

  connection.on(LiveTranscriptionEvents.Error, (error: any) => {
    console.error('[Deepgram] Error:', error);
    callbacks.onError(new Error(String(error)));
  });

  connection.on(LiveTranscriptionEvents.Close, () => {
    console.log('[Deepgram] Connection closed');
    isOpen = false;
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    callbacks.onClose();
  });

  return {
    send(audioChunk: Buffer) {
      if (isOpen) {
        connection.send(audioChunk);
      }
    },
    close() {
      isOpen = false;
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      try {
        connection.requestClose();
      } catch {
        // ignore close errors
      }
    },
    get connected() {
      return isOpen;
    },
  };
}

export function isDeepgramEnabled(): boolean {
  return !!DEEPGRAM_API_KEY;
}
