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
import { useVocabularies } from '@/hooks/useVocabularies';
import { VocabularyManager } from '@/components/VocabularyManager';

type MobileTab = 'context' | 'transcript' | 'coach';

const MOBILE_TABS: { id: MobileTab; icon: string; label: string }[] = [
  { id: 'context', icon: '🗂', label: '會議' },
  { id: 'transcript', icon: '📝', label: '逐字稿' },
  { id: 'coach', icon: '🤖', label: 'Coach' },
];

export default function Home() {
  const { status, transcripts, cleanedTranscript, coaching, connect, disconnect, send, sendJson, clearTranscripts, loadTranscripts } = useWebSocket();
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
  const [sttMode, setSttMode] = useState<'auto' | 'wasm' | 'api'>('api');
  const isSherpaReady = sherpaStatus === 'ready' && sttMode !== 'api';
  const [topic, setTopic] = useState<string>('general');
  const { vocabularies } = useVocabularies();
  const [showVocabManager, setShowVocabManager] = useState(false);

  const [mobileTab, setMobileTab] = useState<MobileTab>('transcript');

  // 切換會議時載入所有已儲存資料
  const handleSelectMeeting = useCallback((id: string) => {
    setActiveMeetingId(id);
    const meeting = meetings.find((m) => m.id === id);
    if (meeting) {
      loadTranscripts(
        meeting.transcript,
        meeting.cleanedTranscript,
        meeting.coaching as any,
      );
    } else {
      clearTranscripts();
    }
  }, [meetings, setActiveMeetingId, loadTranscripts, clearTranscripts]);

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

  // 定時自動儲存逐字稿（每 30 秒）
  useEffect(() => {
    if (!activeMeetingId || recorder.recordingState !== 'recording') return;
    const autoSave = setInterval(() => {
      const lines = transcripts
        .filter((t) => !t.isInterim)
        .map((t) => t.speaker !== undefined ? `[講者${t.speaker + 1}] ${t.text}` : t.text);
      if (lines.length > 0) {
        saveMeeting(activeMeetingId, {
          transcript: lines,
          cleanedTranscript: cleanedTranscript || undefined,
          coaching: coaching ?? undefined,
        });
        console.log('[AutoSave] Saved', lines.length, 'lines');
      }
    }, 30000);
    return () => clearInterval(autoSave);
  }, [activeMeetingId, recorder.recordingState, transcripts, coaching, saveMeeting]);

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
    if (!activeMeetingId) {
      alert('請先建立或選擇一個會議再開始錄音');
      return;
    }
    try {
      const detectedMime = await recorder.start();
      sendJson({
        type: 'start',
        config: {
          language: 'zh',
          meetingId: activeMeetingId,
          mimeType: detectedMime || 'audio/webm',
          topic,
        },
      });
    } catch (err) {
      console.error('[Start]', err);
    }
  }, [recorder, sendJson, activeMeetingId]);

  const handleStop = useCallback(() => {
    // Flush any remaining audio in VAD buffer before stopping
    if (isSherpaReady) {
      const remaining = flush();
      remaining.forEach((text) => handleTranscript(text));
    }
    recorder.stop();
    sendJson({ type: 'stop' });
    if (activeMeetingId && transcripts.length > 0) {
      const lines = transcripts
        .filter((t) => !t.isInterim)
        .map((t) => t.speaker !== undefined ? `[講者${t.speaker + 1}] ${t.text}` : t.text);
      saveMeeting(activeMeetingId, {
        transcript: lines,
        cleanedTranscript: cleanedTranscript || undefined,
        coaching: coaching ?? undefined,
      });
    }
  }, [recorder, sendJson, activeMeetingId, transcripts, cleanedTranscript, coaching, saveMeeting, isSherpaReady, flush, handleTranscript]);

  const handlePause = useCallback(() => recorder.pause(), [recorder]);
  const handleResume = useCallback(() => recorder.resume(), [recorder]);

  const handleSaveTranscript = useCallback(() => {
    if (activeMeetingId && transcripts.length > 0) {
      const lines = transcripts
        .filter((t) => !t.isInterim)
        .map((t) => t.speaker !== undefined ? `[講者${t.speaker + 1}] ${t.text}` : t.text);
      saveMeeting(activeMeetingId, {
        transcript: lines,
        cleanedTranscript: cleanedTranscript || undefined,
        coaching: coaching ?? undefined,
      });
      alert('逐字稿已儲存');
    }
  }, [activeMeetingId, transcripts, cleanedTranscript, coaching, saveMeeting]);

  const handleClearTranscript = useCallback(() => {
    if (confirm('確定要清除目前的逐字稿嗎？')) {
      clearTranscripts();
    }
  }, [clearTranscripts]);

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
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          主題:
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
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
            <option value="general">通用</option>
            <option value="supply-chain">庫存/供應鏈</option>
            <option value="software">軟體開發/IT</option>
            <option value="sales">業務/銷售</option>
            <option value="finance">財務/會計</option>
            <option value="hr">人資/管理</option>
            {vocabularies
              .filter((v) => !['supply-chain','software','sales','finance','hr','general'].includes(v.key))
              .map((v) => <option key={v.key} value={v.key}>{v.name}</option>)
            }
          </select>
          <button
            onClick={() => setShowVocabManager((v) => !v)}
            style={{ background: '#0f172a', color: '#94a3b8', border: '1px solid #334155', borderRadius: '4px', padding: '2px 6px', fontSize: '10px', cursor: 'pointer' }}
            title="管理詞彙"
          >
            ⚙
          </button>
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

      {/* Vocabulary Manager overlay */}
      {showVocabManager && (
        <div style={{ position: 'absolute', top: '90px', right: '16px', zIndex: 50, width: '360px', maxHeight: '70vh', overflowY: 'auto', boxShadow: '0 4px 24px rgba(0,0,0,0.3)', borderRadius: '8px' }}>
          <VocabularyManager onClose={() => setShowVocabManager(false)} />
        </div>
      )}

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
            onSelectMeeting={handleSelectMeeting}
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
          <Transcript
            lines={transcripts}
            cleanedText={cleanedTranscript}
            isRecording={isRecording}
            onSave={activeMeetingId ? handleSaveTranscript : undefined}
            onClear={handleClearTranscript}
          />
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
