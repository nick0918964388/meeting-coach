'use client';

import { useEffect, useRef, useState, useCallback } from 'react';

export type SherpaStatus = 'unavailable' | 'loading' | 'ready' | 'error';

export interface LoadingProgress {
  loaded: number; // bytes
  total: number;  // bytes (0 if unknown)
}

const WASM_BASE = '/wasm';

// Large binary files to pre-fetch with progress tracking
// Approximate sizes used as fallback when Content-Length is unavailable
const PREFETCH_FILES: { name: string; fallbackBytes: number }[] = [
  { name: 'sherpa-onnx-wasm-main-vad-asr.data', fallbackBytes: 79 * 1024 * 1024 },
  { name: 'sherpa-onnx-wasm-main-vad-asr.wasm', fallbackBytes: 11 * 1024 * 1024 },
];

async function fetchWithProgress(
  url: string,
  onChunk: (bytes: number) => void
): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
  if (!res.body) throw new Error('ReadableStream not supported');

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    onChunk(value.length);
  }

  const totalLen = chunks.reduce((s, c) => s + c.length, 0);
  const buf = new Uint8Array(totalLen);
  let off = 0;
  for (const chunk of chunks) { buf.set(chunk, off); off += chunk.length; }

  const blobUrl = URL.createObjectURL(new Blob([buf]));
  return blobUrl;
}

const TARGET_SAMPLE_RATE = 16000;

interface Vad {
  acceptWaveform(samples: Float32Array): void;
  isEmpty(): boolean;
  front(): { samples: Float32Array; start: number };
  pop(): void;
  flush(): void;
  reset(): void;
  config: { sileroVad: { windowSize: number } };
}

interface RecognizeStream {
  acceptWaveform(sampleRate: number, samples: Float32Array): void;
  free(): void;
}

interface Recognizer {
  createStream(): RecognizeStream;
  decode(stream: RecognizeStream): void;
  getResult(stream: RecognizeStream): { text: string };
}

const VAD_CONFIG = {
  sileroVad: {
    model: './silero_vad.onnx',
    threshold: 0.5,
    minSpeechDuration: 0.25,
    minSilenceDuration: 0.5,
    maxSpeechDuration: 20.0,
    windowSize: 512,
  },
  sampleRate: TARGET_SAMPLE_RATE,
  numThreads: 1,
  provider: 'cpu',
  debug: 0,
  bufferSizeInSeconds: 30,
};

const ASR_CONFIG = {
  modelConfig: {
    paraformer: {
      model: './paraformer.onnx',
    },
    tokens: './tokens.txt',
    numThreads: 2,
    provider: 'cpu',
    debug: 0,
  },
  decodingMethod: 'greedy_search',
};

export function useSherpaOnnx() {
  const [status, setStatus] = useState<SherpaStatus>('unavailable');
  const [loadingProgress, setLoadingProgress] = useState<LoadingProgress | null>(null);
  const vadRef = useRef<Vad | null>(null);
  const recognizerRef = useRef<Recognizer | null>(null);
  const initAttemptedRef = useRef(false);
  const blobUrlsRef = useRef<string[]>([]);

  useEffect(() => {
    if (initAttemptedRef.current) return;
    initAttemptedRef.current = true;

    // Check if WASM files are available before attempting to load
    fetch(`${WASM_BASE}/sherpa-onnx-wasm-main-vad-asr.js`, { method: 'HEAD' })
      .then((res) => {
        if (!res.ok) {
          console.log('[SherpaOnnx] WASM files not found, using fallback mode');
          setStatus('unavailable');
          return;
        }
        loadWasm();
      })
      .catch(() => {
        console.log('[SherpaOnnx] WASM files not accessible, using fallback mode');
        setStatus('unavailable');
      });
  }, []);

  async function loadWasm() {
    setStatus('loading');

    // --- Step 1: pre-fetch large binary files with progress tracking ---
    const totalExpected = PREFETCH_FILES.reduce((s, f) => s + f.fallbackBytes, 0);
    let totalLoaded = 0;
    setLoadingProgress({ loaded: 0, total: totalExpected });

    const fileMap = new Map<string, string>();

    try {
      await Promise.all(
        PREFETCH_FILES.map(async ({ name }) => {
          const blobUrl = await fetchWithProgress(
            `${WASM_BASE}/${name}`,
            (bytes) => {
              totalLoaded += bytes;
              setLoadingProgress({ loaded: totalLoaded, total: totalExpected });
            }
          );
          fileMap.set(name, blobUrl);
          blobUrlsRef.current.push(blobUrl);
        })
      );
    } catch (err) {
      console.error('[SherpaOnnx] Download error:', err);
      setStatus('error');
      return;
    }

    // --- Step 2: set up Emscripten module and load JS ---
    const module: Record<string, unknown> = {
      locateFile: (path: string) => fileMap.get(path) ?? `${WASM_BASE}/${path}`,
      onRuntimeInitialized: () => {
        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const win = window as any;
          const createVad = win.createVad;
          const OfflineRecognizer = win.OfflineRecognizer;

          if (typeof createVad !== 'function' || typeof OfflineRecognizer !== 'function') {
            throw new Error('sherpa-onnx API not found after WASM init');
          }

          vadRef.current = createVad(module, VAD_CONFIG) as Vad;
          recognizerRef.current = new OfflineRecognizer(ASR_CONFIG, module) as Recognizer;
          setLoadingProgress(null);
          setStatus('ready');
          console.log('[SherpaOnnx] Ready!');
        } catch (err) {
          console.error('[SherpaOnnx] Init error:', err);
          setStatus('error');
        }
      },
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).Module = module;

    const scripts = [
      `${WASM_BASE}/sherpa-onnx-asr.js`,
      `${WASM_BASE}/sherpa-onnx-vad.js`,
      `${WASM_BASE}/sherpa-onnx-wasm-main-vad-asr.js`,
    ];

    function loadNext(index: number) {
      if (index >= scripts.length) return;
      const script = document.createElement('script');
      script.src = scripts[index];
      script.onload = () => loadNext(index + 1);
      script.onerror = () => {
        console.error(`[SherpaOnnx] Failed to load ${scripts[index]}`);
        setStatus('error');
      };
      document.head.appendChild(script);
    }

    loadNext(0);
  }

  const processAudio = useCallback((samples: Float32Array): string[] => {
    if (!vadRef.current || !recognizerRef.current) return [];

    const results: string[] = [];
    const vad = vadRef.current;
    const recognizer = recognizerRef.current;
    const windowSize = vad.config.sileroVad.windowSize;

    // Feed samples to VAD window-by-window (512 samples at a time)
    let offset = 0;
    while (offset + windowSize <= samples.length) {
      const chunk = samples.subarray(offset, offset + windowSize);
      vad.acceptWaveform(chunk);
      offset += windowSize;
    }

    // Process any completed speech segments from VAD
    while (!vad.isEmpty()) {
      const segment = vad.front();
      vad.pop();

      const stream = recognizer.createStream();
      stream.acceptWaveform(TARGET_SAMPLE_RATE, segment.samples);
      recognizer.decode(stream);
      const result = recognizer.getResult(stream);
      stream.free();

      if (result.text.trim()) {
        results.push(result.text.trim());
      }
    }

    return results;
  }, []);

  const flush = useCallback((): string[] => {
    if (!vadRef.current || !recognizerRef.current) return [];

    const vad = vadRef.current;
    const recognizer = recognizerRef.current;
    const results: string[] = [];

    vad.flush();

    while (!vad.isEmpty()) {
      const segment = vad.front();
      vad.pop();

      const stream = recognizer.createStream();
      stream.acceptWaveform(TARGET_SAMPLE_RATE, segment.samples);
      recognizer.decode(stream);
      const result = recognizer.getResult(stream);
      stream.free();

      if (result.text.trim()) {
        results.push(result.text.trim());
      }
    }

    return results;
  }, []);

  return { status, loadingProgress, processAudio, flush };
}
