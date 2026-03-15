'use client';

import { useRef, useState, useCallback } from 'react';

export type RecordingState = 'idle' | 'recording' | 'paused';

export interface UseAudioRecorderReturn {
  recordingState: RecordingState;
  audioLevel: number;
  mimeType: string;
  chunkCount: number;
  start: () => Promise<string | undefined>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  error: string | null;
}

interface AudioRecorderOptions {
  // Legacy mode: sends raw audio chunks to server
  onChunk?: (data: ArrayBuffer) => void;
  // Sherpa mode: processAudio runs WASM inference; onTranscript receives text
  processAudio?: (samples: Float32Array) => string[];
  onTranscript?: (text: string) => void;
  chunkIntervalMs?: number;
}

const TARGET_SAMPLE_RATE = 16000;
// VAD: minimum RMS energy to consider a chunk as containing speech
// Set very low to avoid false-negative in noisy environments (car, office)
const SILENCE_RMS_THRESHOLD = 0.001;

function downsample(buffer: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate) return buffer;
  const ratio = fromRate / toRate;
  const newLength = Math.round(buffer.length / ratio);
  const result = new Float32Array(newLength);
  for (let i = 0; i < newLength; i++) {
    result[i] = buffer[Math.round(i * ratio)];
  }
  return result;
}

export function useAudioRecorder(options: AudioRecorderOptions): UseAudioRecorderReturn {
  const { onChunk, processAudio, onTranscript, chunkIntervalMs = 5000 } = options;

  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('audio/webm');
  const [chunkCount, setChunkCount] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const isPausedRef = useRef(false);
  const chunkTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectedMimeRef = useRef<string>('audio/webm');
  const isStoppingRef = useRef(false);
  // VAD: track RMS energy during each chunk interval
  const maxRmsRef = useRef(0);

  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const avg = data.reduce((s, v) => s + v, 0) / data.length;
    setAudioLevel(Math.min(100, (avg / 128) * 100));

    // VAD: compute RMS from time-domain data for silence detection
    const timeDomain = new Float32Array(analyserRef.current.fftSize);
    analyserRef.current.getFloatTimeDomainData(timeDomain);
    let sum = 0;
    for (let i = 0; i < timeDomain.length; i++) sum += timeDomain[i] * timeDomain[i];
    const rms = Math.sqrt(sum / timeDomain.length);
    if (rms > maxRmsRef.current) maxRmsRef.current = rms;

    animFrameRef.current = requestAnimationFrame(updateAudioLevel);
  }, []);

  const startSherpaMode = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: { ideal: 1 },
        sampleRate: { ideal: TARGET_SAMPLE_RATE },
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    streamRef.current = stream;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    // ScriptProcessor: deprecated but works on Safari; AudioWorklet requires extra thread/message overhead
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    const scriptProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
    source.connect(scriptProcessor);
    scriptProcessor.connect(audioCtx.destination);
    scriptProcessorRef.current = scriptProcessor;

    scriptProcessor.onaudioprocess = (e) => {
      if (isPausedRef.current) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const samples = downsample(
        new Float32Array(inputData),
        audioCtx.sampleRate,
        TARGET_SAMPLE_RATE
      );

      const texts = processAudio!(samples);
      texts.forEach((text) => {
        setChunkCount((c) => c + 1);
        onTranscript!(text);
      });
    };

    setMimeType('sherpa-onnx');
    setRecordingState('recording');
    updateAudioLevel();
  }, [processAudio, onTranscript, updateAudioLevel]);

  // Start a new MediaRecorder instance on the existing stream
  const startNewRecorder = useCallback((stream: MediaStream, mime: string) => {
    const recorder = new MediaRecorder(stream, { mimeType: mime });
    mediaRecorderRef.current = recorder;

    // Capture maxRms at the moment stop() is called (before reset)
    recorder.ondataavailable = async (event) => {
      const chunkRms = maxRmsRef.current;
      maxRmsRef.current = 0; // reset for next chunk AFTER capturing
      console.log('[Recorder] ondataavailable size:', event.data.size, 'maxRms:', chunkRms.toFixed(4));
      if (event.data.size > 0) {
        // VAD: skip chunks that were mostly silence
        if (chunkRms < SILENCE_RMS_THRESHOLD) {
          console.log('[Recorder] Skipping silent chunk (RMS below threshold)');
          return;
        }
        setChunkCount((c) => c + 1);
        const buffer = await event.data.arrayBuffer();
        onChunk?.(buffer);
      }
    };

    console.log('[Recorder] Starting new MediaRecorder');
    recorder.start(); // No timeslice — we manually stop/restart for clean chunks
  }, [onChunk]);

  const startMediaRecorderMode = useCallback(async () => {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        channelCount: { ideal: 1 },
        sampleRate: { ideal: 16000 },
        echoCancellation: true,
        noiseSuppression: true,
      },
    });
    streamRef.current = stream;

    const audioCtx = new AudioContext();
    audioCtxRef.current = audioCtx;
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    analyserRef.current = analyser;

    const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent);
    const detectedMimeType = isIOS
      ? 'audio/mp4'
      : MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
      ? 'audio/webm;codecs=opus'
      : MediaRecorder.isTypeSupported('audio/webm')
      ? 'audio/webm'
      : MediaRecorder.isTypeSupported('audio/mp4')
      ? 'audio/mp4'
      : 'audio/ogg';

    setMimeType(detectedMimeType);
    detectedMimeRef.current = detectedMimeType;

    // Streaming mode (short interval ≤1s): use timeslice for continuous streaming (Deepgram)
    // Chunked mode (long interval >1s): use stop/restart for complete files (Whisper)
    const isStreamingMode = chunkIntervalMs <= 1000;

    if (isStreamingMode) {
      // Streaming: use timeslice, each ondataavailable sends a small chunk
      const recorder = new MediaRecorder(stream, { mimeType: detectedMimeType });
      mediaRecorderRef.current = recorder;
      recorder.ondataavailable = async (event) => {
        if (event.data.size > 0) {
          setChunkCount((c) => c + 1);
          const buffer = await event.data.arrayBuffer();
          onChunk?.(buffer);
        }
      };
      console.log(`[Recorder] Starting streaming mode (${chunkIntervalMs}ms timeslice)`);
      recorder.start(chunkIntervalMs);
    } else {
      // Chunked: stop/restart to produce complete, self-contained audio files
      startNewRecorder(stream, detectedMimeType);
      chunkTimerRef.current = setInterval(() => {
        if (isPausedRef.current || isStoppingRef.current) return;
        const rec = mediaRecorderRef.current;
        if (rec && rec.state === 'recording') {
          rec.stop();
          if (streamRef.current?.active) {
            startNewRecorder(stream, detectedMimeType);
          }
        }
      }, chunkIntervalMs);
    }

    setRecordingState('recording');
    updateAudioLevel();
    return detectedMimeType;
  }, [onChunk, chunkIntervalMs, updateAudioLevel, startNewRecorder]);

  const start = useCallback(async (): Promise<string | undefined> => {
    try {
      setError(null);
      isPausedRef.current = false;
      isStoppingRef.current = false;
      if (processAudio && onTranscript) {
        await startSherpaMode();
        return 'sherpa-onnx';
      } else {
        const detectedMime = await startMediaRecorderMode();
        return detectedMime;
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setError(msg);
      console.error('[Recorder]', err);
      return undefined;
    }
  }, [processAudio, onTranscript, startSherpaMode, startMediaRecorderMode]);

  const stop = useCallback(() => {
    isStoppingRef.current = true;
    cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
    isPausedRef.current = false;

    if (chunkTimerRef.current) {
      clearInterval(chunkTimerRef.current);
      chunkTimerRef.current = null;
    }

    if (scriptProcessorRef.current) {
      scriptProcessorRef.current.disconnect();
      scriptProcessorRef.current.onaudioprocess = null;
      scriptProcessorRef.current = null;
    }

    if (mediaRecorderRef.current?.state !== 'inactive') {
      mediaRecorderRef.current?.stop();
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    mediaRecorderRef.current = null;
    analyserRef.current = null;
    audioCtxRef.current?.close();
    audioCtxRef.current = null;
    setRecordingState('idle');
  }, []);

  const pause = useCallback(() => {
    if (recordingState !== 'recording') return;
    isPausedRef.current = true;
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
    }
    cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
    setRecordingState('paused');
  }, [recordingState]);

  const resume = useCallback(() => {
    if (recordingState !== 'paused') return;
    isPausedRef.current = false;
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
    }
    updateAudioLevel();
    setRecordingState('recording');
  }, [recordingState, updateAudioLevel]);

  return { recordingState, audioLevel, mimeType, chunkCount, start, stop, pause, resume, error };
}
