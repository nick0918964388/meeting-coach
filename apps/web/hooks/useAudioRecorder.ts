'use client';

import { useRef, useState, useCallback } from 'react';

export type RecordingState = 'idle' | 'recording' | 'paused';

export interface UseAudioRecorderReturn {
  recordingState: RecordingState;
  audioLevel: number;
  mimeType: string;
  start: () => Promise<void>;
  stop: () => void;
  pause: () => void;
  resume: () => void;
  error: string | null;
}

interface AudioRecorderOptions {
  onChunk: (data: ArrayBuffer) => void;
  chunkIntervalMs?: number;
  sampleRate?: number;
}

export function useAudioRecorder(options: AudioRecorderOptions): UseAudioRecorderReturn {
  const { onChunk, chunkIntervalMs = 3000 } = options;

  const [recordingState, setRecordingState] = useState<RecordingState>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string>('audio/webm');

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const updateAudioLevel = useCallback(() => {
    if (!analyserRef.current) return;
    const data = new Uint8Array(analyserRef.current.frequencyBinCount);
    analyserRef.current.getByteFrequencyData(data);
    const avg = data.reduce((s, v) => s + v, 0) / data.length;
    setAudioLevel(Math.min(100, (avg / 128) * 100));
    animFrameRef.current = requestAnimationFrame(updateAudioLevel);
  }, []);

  const start = useCallback(async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: { ideal: 1 },
          sampleRate: { ideal: 16000 },
          echoCancellation: true,
          noiseSuppression: true,
        },
      });
      streamRef.current = stream;

      // Set up audio level analyser
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;

      // Set up MediaRecorder for chunked recording
      // Priority: webm/opus > webm > mp4 (iOS Safari) > ogg
      const detectedMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
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
        if (event.data.size > 0) {
          const buffer = await event.data.arrayBuffer();
          onChunk(buffer);
        }
      };

      recorder.start(chunkIntervalMs);
      setRecordingState('recording');
      updateAudioLevel();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Microphone access denied';
      setError(msg);
      console.error('[Recorder]', err);
    }
  }, [onChunk, chunkIntervalMs, updateAudioLevel]);

  const stop = useCallback(() => {
    cancelAnimationFrame(animFrameRef.current);
    setAudioLevel(0);

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
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.pause();
      cancelAnimationFrame(animFrameRef.current);
      setAudioLevel(0);
      setRecordingState('paused');
    }
  }, []);

  const resume = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'paused') {
      mediaRecorderRef.current.resume();
      updateAudioLevel();
      setRecordingState('recording');
    }
  }, [updateAudioLevel]);

  return { recordingState, audioLevel, mimeType, start, stop, pause, resume, error };
}
