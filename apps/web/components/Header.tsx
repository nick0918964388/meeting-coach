'use client';

import type { ConnectionStatus } from '@/hooks/useWebSocket';
import type { RecordingState } from '@/hooks/useAudioRecorder';

interface HeaderProps {
  elapsed: number;
  recordingState: RecordingState;
  audioLevel: number;
  wsStatus: ConnectionStatus;
  onStart: () => void;
  onStop: () => void;
  onPause: () => void;
  onResume: () => void;
  onReconnect?: () => void;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, '0')).join(':');
}

interface IconBtnProps {
  icon: string;
  onClick: () => void;
  title: string;
  bg: string;
  disabled?: boolean;
}

function IconBtn({ icon, onClick, title, bg, disabled }: IconBtnProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        width: '34px',
        height: '34px',
        borderRadius: '50%',
        border: 'none',
        background: disabled ? '#e5e7eb' : bg,
        color: disabled ? '#9ca3af' : '#fff',
        fontSize: '15px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        flexShrink: 0,
        transition: 'opacity 0.15s, transform 0.1s',
        boxShadow: disabled ? 'none' : '0 1px 3px rgba(0,0,0,0.15)',
      }}
    >
      {icon}
    </button>
  );
}

export function Header({
  elapsed,
  recordingState,
  audioLevel,
  wsStatus,
  onStart,
  onStop,
  onPause,
  onResume,
  onReconnect,
}: HeaderProps) {
  const isIdle = recordingState === 'idle';
  const isRecording = recordingState === 'recording';
  const isPaused = recordingState === 'paused';

  const statusLabel = isRecording ? 'RECORDING' : isPaused ? 'PAUSED' : 'IDLE';
  const statusStyle = isRecording
    ? { background: '#ef4444', color: '#fff' }
    : isPaused
    ? { background: '#f97316', color: '#fff' }
    : { background: '#e0e0e0', color: '#999' };

  return (
    <header
      style={{
        background: '#ffffff',
        borderBottom: '1px solid #d8d8d0',
        height: '52px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 20px',
        flexShrink: 0,
      }}
    >
      {/* Left: Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <div
          style={{
            width: '26px',
            height: '26px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '12px',
            fontWeight: 'bold',
            color: '#fff',
          }}
        >
          M
        </div>
        <span style={{ color: '#1a1a1a', fontWeight: 600, fontSize: '14px' }}>
          Meeting Transcriber
        </span>
      </div>

      {/* Center: Record controls + audio level + timer + status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        {/* Circular control buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* ⏺ Record — active only when idle */}
          <IconBtn
            icon="⏺"
            title="開始錄音"
            onClick={onStart}
            bg="#22c55e"
            disabled={!isIdle}
          />
          {/* ⏸/▶ Pause/Resume — active when recording or paused */}
          <IconBtn
            icon={isPaused ? '▶' : '⏸'}
            title={isPaused ? '繼續錄音' : '暫停錄音'}
            onClick={isRecording ? onPause : onResume}
            bg="#3b82f6"
            disabled={isIdle}
          />
          {/* ⏹ Stop — active when recording or paused */}
          <IconBtn
            icon="⏹"
            title="停止錄音"
            onClick={onStop}
            bg="#ef4444"
            disabled={isIdle}
          />
        </div>

        {/* Audio level visualizer - pulsing rings */}
        {isRecording && (
          <div
            style={{
              position: 'relative',
              width: '40px',
              height: '40px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            {/* Outer ring - scales with audio level */}
            <div
              style={{
                position: 'absolute',
                width: `${20 + audioLevel * 0.3}px`,
                height: `${20 + audioLevel * 0.3}px`,
                borderRadius: '50%',
                background: `rgba(239, 68, 68, ${0.1 + audioLevel * 0.005})`,
                transition: 'all 0.1s ease-out',
              }}
            />
            {/* Middle ring */}
            <div
              style={{
                position: 'absolute',
                width: `${14 + audioLevel * 0.2}px`,
                height: `${14 + audioLevel * 0.2}px`,
                borderRadius: '50%',
                background: `rgba(239, 68, 68, ${0.2 + audioLevel * 0.006})`,
                transition: 'all 0.1s ease-out',
              }}
            />
            {/* Center dot */}
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: '#ef4444',
                boxShadow: audioLevel > 20 ? '0 0 8px rgba(239, 68, 68, 0.6)' : 'none',
              }}
            />
          </div>
        )}
        
        {/* Audio level bar (shown when paused) */}
        {isPaused && (
          <div
            style={{
              width: '48px',
              height: '3px',
              background: '#e5e7eb',
              borderRadius: '2px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${audioLevel}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #f97316, #f59e0b)',
                borderRadius: '2px',
                transition: 'width 0.1s',
              }}
            />
          </div>
        )}

        {/* Timer */}
        <span
          className={isRecording ? 'timer-recording' : ''}
          style={{
            fontFamily: "'Courier New', Courier, monospace",
            fontSize: '30px',
            fontWeight: 'bold',
            color: isRecording ? '#ef4444' : isPaused ? '#f97316' : '#333333',
            letterSpacing: '0.06em',
            lineHeight: 1,
          }}
        >
          {formatTime(elapsed)}
        </span>

        {/* Status badge */}
        <span
          style={{
            ...statusStyle,
            fontSize: '10px',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: '4px',
            letterSpacing: '0.1em',
          }}
        >
          {statusLabel}
        </span>
      </div>

      {/* Right: Nav + WS Status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        {/* Knowledge Link */}
        <a
          href="/knowledge"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 12px',
            borderRadius: '6px',
            background: 'linear-gradient(135deg, #667eea, #764ba2)',
            color: '#fff',
            fontSize: '12px',
            fontWeight: 600,
            textDecoration: 'none',
            boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
          }}
        >
          📚 AI 問答
        </a>
        
        {/* WS Status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div
          style={{
            width: '7px',
            height: '7px',
            borderRadius: '50%',
            background:
              wsStatus === 'connected' ? '#22c55e'
              : wsStatus === 'connecting' ? '#f59e0b'
              : '#d1d5db',
          }}
          className={wsStatus === 'connecting' ? 'animate-pulse' : ''}
        />
        <span style={{ color: '#888', fontSize: '12px' }}>
          {wsStatus === 'connected' ? '已連線' : wsStatus === 'connecting' ? '連線中...' : '未連線'}
        </span>
        {(wsStatus === 'disconnected' || wsStatus === 'error') && onReconnect && (
          <button
            onClick={onReconnect}
            style={{
              fontSize: '11px',
              padding: '2px 8px',
              borderRadius: '4px',
              background: '#f5f5f5',
              border: '1px solid #d0d0d0',
              color: '#555',
              cursor: 'pointer',
            }}
          >
            重連
          </button>
        )}
        </div>
      </div>
    </header>
  );
}
