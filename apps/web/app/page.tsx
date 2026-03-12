'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AudioRecorder } from '@/components/AudioRecorder';
import { Transcript } from '@/components/Transcript';
import { CoachPanel } from '@/components/CoachPanel';
import { Header } from '@/components/Header';
import { ContextPanel } from '@/components/ContextPanel';
import { useWebSocket } from '@/hooks/useWebSocket';
import { useAudioRecorder } from '@/hooks/useAudioRecorder';
import { useMeetings } from '@/hooks/useMeetings';

export default function Home() {
  const { status, transcripts, coaching, connect, disconnect, send, sendJson } = useWebSocket();
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

  // Recording timer
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const handleChunk = useCallback(
    (data: ArrayBuffer) => {
      if (status === 'connected') send(data);
    },
    [status, send]
  );

  const recorder = useAudioRecorder({ onChunk: handleChunk, chunkIntervalMs: 3000 });

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
      await recorder.start();
      sendJson({ type: 'start', config: { language: 'zh' } });
    } catch (err) {
      console.error('[Start]', err);
    }
  }, [recorder, sendJson]);

  const handleStop = useCallback(() => {
    recorder.stop();
    sendJson({ type: 'stop' });
    // Auto-save to active meeting
    if (activeMeetingId && transcripts.length > 0) {
      saveMeeting(activeMeetingId, {
        transcript: transcripts,
        coaching: coaching ?? undefined,
      });
    }
  }, [recorder, sendJson, activeMeetingId, transcripts, coaching, saveMeeting]);

  const handlePause = useCallback(() => recorder.pause(), [recorder]);
  const handleResume = useCallback(() => recorder.resume(), [recorder]);

  const isRecording = recorder.recordingState === 'recording';

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        background: '#1a1a1a',
        overflow: 'hidden',
      }}
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

      {/* Three-column main area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {/* Left: Context / Playbook */}
        <div style={{ width: '240px', flexShrink: 0, overflow: 'hidden' }}>
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
        <div style={{ flex: 1, overflow: 'hidden' }}>
          <Transcript lines={transcripts} isRecording={isRecording} />
        </div>

        {/* Right: Coach Panel */}
        <div style={{ width: '280px', flexShrink: 0, overflow: 'hidden' }}>
          <CoachPanel coaching={coaching} />
        </div>
      </div>

      {/* Bottom control bar (secondary actions) */}
      <AudioRecorder error={recorder.error} />
    </div>
  );
}
