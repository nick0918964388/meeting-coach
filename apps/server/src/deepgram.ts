import WebSocket from 'ws';

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

  // Raw PCM audio from client (linear16, 16kHz, mono)
  const params = new URLSearchParams({
    model: 'nova-2',
    language: 'zh',
    detect_language: 'true',
    smart_format: 'true',
    interim_results: 'true',
    utterance_end_ms: '1500',
    vad_events: 'true',
    endpointing: '500',
    encoding: 'linear16',
    sample_rate: '16000',
    channels: '1',
  });

  const url = `wss://api.deepgram.com/v1/listen?${params.toString()}`;
  console.log('[Deepgram] Connecting...');

  const ws = new WebSocket(url, {
    headers: {
      Authorization: `Token ${DEEPGRAM_API_KEY}`,
    },
  });

  let isOpen = false;
  let keepAliveTimer: ReturnType<typeof setInterval> | null = null;

  ws.on('open', () => {
    console.log('[Deepgram] Connected');
    isOpen = true;
    // Keep alive every 8 seconds
    keepAliveTimer = setInterval(() => {
      if (isOpen && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'KeepAlive' }));
      }
    }, 8000);
  });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());

      if (msg.type === 'Results') {
        const alt = msg.channel?.alternatives?.[0];
        if (!alt || !alt.transcript) return;

        const isFinal = msg.is_final === true;
        console.log(`[Deepgram] ${isFinal ? 'Final' : 'Interim'}: "${alt.transcript}"`);
        callbacks.onTranscript(alt.transcript, isFinal);
      }
    } catch (err) {
      // ignore parse errors
    }
  });

  ws.on('error', (error) => {
    console.error('[Deepgram] WebSocket error:', error.message);
    callbacks.onError(error);
  });

  ws.on('close', (code, reason) => {
    console.log(`[Deepgram] Disconnected: ${code} ${reason.toString()}`);
    isOpen = false;
    if (keepAliveTimer) {
      clearInterval(keepAliveTimer);
      keepAliveTimer = null;
    }
    callbacks.onClose();
  });

  return {
    send(audioChunk: Buffer) {
      if (isOpen && ws.readyState === WebSocket.OPEN) {
        ws.send(audioChunk);
      }
    },
    close() {
      isOpen = false;
      if (keepAliveTimer) {
        clearInterval(keepAliveTimer);
        keepAliveTimer = null;
      }
      try {
        // Send CloseStream message for graceful shutdown
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'CloseStream' }));
        }
        ws.close();
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
