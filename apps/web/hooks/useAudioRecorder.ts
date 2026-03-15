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
  const { onChunk, processAudio, onTranscript, chunkIntervalMs = 3000 } = options;

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

  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const avg = data.reduce((s, v) => s + v, 0) / data.length;
    setAudioLevel(Math.min(100, (avg / 128) * 100));
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
    const recorder = new MediaRecorder(stream, { mimeType: detectedMimeType });
    mediaRecorderRef.current = recorder;

    recorder.ondataavailable = async (event) => {
      console.log('[Recorder] ondataavailable size:', event.data.size);
      if (event.data.size > 0) {
        setChunkCount((c) => c + 1);
        const buffer = await event.data.arrayBuffer();
        onChunk?.(buffer);
      }
    };

    recorder.start(chunkIntervalMs);
    setRecordingState('recording');
    updateAudioLevel();
    return detectedMimeType;
  }, [onChunk, chunkIntervalMs, updateAudioLevel]);

  const start = useCallback(async (): Promise<string | undefined> => {
    try {
      setError(null);
      isPausedRef.current = false;
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
    cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);
    isPausedRef.current = false;

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
