'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Transcript } from '@/components/Transcript';
import { CoachPanel } from '@/components/CoachPanel';
import { Header } from '@/components/Header';
import { ContextPanel } from '@/components/ContextPanel';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useSherpaOnnx } from '@/hooks/useSherpaOnnx';
import { useMeetings } from '@/hooks/useMeetings';

type MobileTab = 'context' | 'transcript' | 'coach';

const MOBILE_TABS: { id: MobileTab; icon: string; label: string }[] = [
  { id: 'context', icon: '🗂', label: '會議' },
  { id: 'transcript', icon: '📝', label: '逐字稿' },
  { id: 'coach', icon: '🤖', label: 'Coach' },
];

export default function Home() {
  const { status, transcripts, cleanedTranscript, coaching, connect, disconnect, send, sendJson } = useWebSocket();
  const {
    meetings,
    activeMeeting,
    activeMeetingId,
    setActiveMeetingId,
    createMeeting,
    saveMeeting,
    removeMeeting,
    loading: meetingsLoading,
  } = useMeetings();

  const { status: sherpaStatus, loadingProgress, processAudio, flush } = useSherpaOnnx();
  
  // STT mode: 'auto' uses Sherpa if ready, 'wasm' forces Sherpa, 'api' forces backend Groq/Whisper
  const [sttMode, setSttMode] = useState<'auto' | 'wasm' | 'api'>('api'); // Default to API (Groq) for speed
  const isSherpaReady = sherpaStatus === 'ready' && sttMode !== 'api';

  const [mobileTab, setMobileTab] = useState<MobileTab>('transcript');

  // Recording timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sherpa mode: send transcript text to server
  const handleTranscript = useCallback(
    (text: string) => {
      if (status === 'connected') {
        sendJson({ type: 'transcript_text', text });
      }
    },
    [status, sendJson]
  );

  // Legacy mode: send raw audio binary to server
  const handleChunk = useCallback(
    (data: ArrayBuffer) => {
      if (status === 'connected') send(data);
    },
    [status, send]
  );

  const recorder = useAudioRecorder(
    isSherpaReady
      ? { processAudio, onTranscript: handleTranscript }
      : { onChunk: handleChunk, chunkIntervalMs: 250 }
  );

  // Track elapsed time
  useEffect(() => {
    if (recorder.recordingState === 'recording') {
      timerRef.current = setInterval(() => setElapsed((t) => t + 1), 1000);
    } else if (recorder.recordingState === 'paused') {
      if (timerRef.current) clearInterval(timerRef.current);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
      setElapsed(0);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [recorder.recordingState]);

  // Auto-connect on mount
  useEffect(() => {
    connect();
    return () => disconnect();
  }, [connect, disconnect]);

  const handleStart = useCallback(async () => {
    try {
      const detectedMime = await recorder.start();
      sendJson({
        type: 'start',
        config: {
          language: 'zh',
          mimeType: detectedMime || 'audio/webm',
        },
      });
    } catch (err) {
      console.error('[Start]', err);
    }
  }, [recorder, sendJson]);

  const handleStop = useCallback(() => {
    // Flush any remaining audio in VAD buffer before stopping
    if (isSherpaReady) {
      const remaining = flush();
      remaining.forEach((text) => handleTranscript(text));
    }
    recorder.stop();
    sendJson({ type: 'stop' });
    if (activeMeetingId && transcripts.length > 0) {
      saveMeeting(activeMeetingId, {
        transcript: transcripts,
        coaching: coaching ?? undefined,
      });
    }
  }, [recorder, sendJson, activeMeetingId, transcripts, coaching, saveMeeting, isSherpaReady, flush, handleTranscript]);

  const handlePause = useCallback(() => recorder.pause(), [recorder]);
  const handleResume = useCallback(() => recorder.resume(), [recorder]);

  const isRecording = recorder.recordingState === 'recording';

  return (
    <div
      className="flex flex-col overflow-hidden"
      style={{ background: '#1a1a1a', height: '100dvh' }}
    >
      {/* Top header bar */}
      <Header
        elapsed={elapsed}
        recordingState={recorder.recordingState}
        audioLevel={recorder.audioLevel}
        wsStatus={status}
        onStart={handleStart}
        onStop={handleStop}
        onPause={handlePause}
        onResume={handleResume}
        onReconnect={connect}
      />

      {/* Debug bar */}
      <div style={{ background: '#1e293b', color: '#94a3b8', fontSize: '11px', padding: '4px 12px', fontFamily: 'monospace', flexShrink: 0, display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          stt:
          <select
            value={sttMode}
            onChange={(e) => setSttMode(e.target.value as 'auto' | 'wasm' | 'api')}
            disabled={recorder.recordingState !== 'idle'}
            style={{
              background: '#0f172a',
              color: '#38bdf8',
              border: '1px solid #334155',
              borderRadius: '4px',
              padding: '2px 4px',
              fontSize: '11px',
              cursor: recorder.recordingState !== 'idle' ? 'not-allowed' : 'pointer',
            }}
          >
            <option value="api">☁️ API (快)</option>
            <option value="wasm">🖥 WASM 本地</option>
            <option value="auto">⚡ 自動</option>
          </select>
        </span>
        <span>asr: <span style={{ color: isSherpaReady ? '#4ade80' : '#facc15' }}>
          {sttMode === 'api' ? 'cloud-api' : sherpaStatus === 'loading' && loadingProgress
            ? (() => {
                const pct = loadingProgress.total > 0
                  ? Math.round((loadingProgress.loaded / loadingProgress.total) * 100)
                  : 0;
                const loadedMB = (loadingProgress.loaded / 1024 / 1024).toFixed(0);
                const totalMB = (loadingProgress.total / 1024 / 1024).toFixed(0);
                return `載入中 ${pct}% (${loadedMB}/${totalMB} MB)`;
              })()
            : sherpaStatus}
        </span></span>
        <span>mime: <span style={{ color: '#38bdf8' }}>{recorder.mimeType}</span></span>
        <span>state: <span style={{ color: '#4ade80' }}>{recorder.recordingState}</span></span>
        <span>chunks: <span style={{ color: '#facc15' }}>{recorder.chunkCount}</span></span>
        <span>error: <span style={{ color: recorder.error ? '#f87171' : '#64748b' }}>{recorder.error || 'none'}</span></span>
      </div>

      {/* Main content: 3-col on desktop, single-panel on mobile */}
      <div className="flex-1 flex overflow-hidden min-h-0">
        {/* Left: Context / Playbook */}
        <div
          className={`overflow-hidden flex-shrink-0 ${
            mobileTab === 'context'
              ? 'flex flex-col flex-1 md:flex-none md:w-60'
              : 'hidden md:flex md:flex-col md:w-60'
          }`}
        >
          <ContextPanel
            meetings={meetings}
            activeMeeting={activeMeeting}
            onSelectMeeting={setActiveMeetingId}
            onCreateMeeting={createMeeting}
            onDeleteMeeting={removeMeeting}
            loading={meetingsLoading}
          />
        </div>

        {/* Middle: Transcript */}
        <div
          className={`overflow-hidden flex-1 ${
            mobileTab === 'transcript' ? 'flex flex-col' : 'hidden md:flex md:flex-col'
          }`}
        >
          <Transcript lines={transcripts} cleanedText={cleanedTranscript} isRecording={isRecording} />
        </div>

        {/* Right: Coach Panel */}
        <div
          className={`overflow-hidden flex-shrink-0 ${
            mobileTab === 'coach'
              ? 'flex flex-col flex-1 md:flex-none md:w-72'
              : 'hidden md:flex md:flex-col md:w-72'
          }`}
        >
          <CoachPanel coaching={coaching} />
        </div>
      </div>

      {/* Mobile tab bar — hidden on md+ */}
      <div className="md:hidden flex border-t border-gray-200 bg-white flex-shrink-0">
        {MOBILE_TABS.map(({ id, icon, label }) => (
          <button
            key={id}
            onClick={() => setMobileTab(id)}
            style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '8px 0 6px',
              gap: '2px',
              border: 'none',
              cursor: 'pointer',
              fontSize: '11px',
              fontWeight: 600,
              transition: 'background 0.15s',
              background: mobileTab === id ? '#eff6ff' : '#ffffff',
              color: mobileTab === id ? '#2563eb' : '#6b7280',
              borderTop: mobileTab === id ? '2px solid #2563eb' : '2px solid transparent',
            }}
          >
            <span style={{ fontSize: '18px', lineHeight: 1 }}>{icon}</span>
            <span>{label}</span>
          </button>
        ))}
      </div>

    </div>
  );
}
