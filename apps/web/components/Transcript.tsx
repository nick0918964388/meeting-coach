'use client';

import { useEffect, useRef, useState } from 'react';

import type { TranscriptLine } from '@/hooks/useWebSocket';

const SPEAKER_COLORS = ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

interface TranscriptProps {
  lines: TranscriptLine[];
  cleanedText: string;
  isRecording: boolean;
  onSave?: () => void;
  onClear?: () => void;
}

export function Transcript({ lines, cleanedText, isRecording, onSave, onClear }: TranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<'raw' | 'cleaned'>('raw');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, cleanedText]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: '#ffffff',
        borderRight: '1px solid #d8d8d0',
      }}
    >
      {/* Section label + tabs */}
      <div
        style={{
          height: '40px',
          padding: '0 14px',
          borderBottom: '1px solid #e0e0d8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexShrink: 0,
          background: '#eeeee8',
          boxSizing: 'border-box',
        }}
      >
        <span
          style={{
            fontSize: '10px',
            fontWeight: 700,
            color: '#888',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
          }}
        >
          Transcript
        </span>
        <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
          {/* Save / Clear buttons */}
          {lines.length > 0 && !isRecording && (
            <>
              {onSave && (
                <button
                  onClick={onSave}
                  title="儲存逐字稿"
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '3px',
                    border: '1px solid #22c55e',
                    cursor: 'pointer',
                    background: '#f0fdf4',
                    color: '#16a34a',
                    marginRight: '2px',
                  }}
                >
                  儲存
                </button>
              )}
              {onClear && (
                <button
                  onClick={onClear}
                  title="清除逐字稿"
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '3px',
                    border: '1px solid #ef4444',
                    cursor: 'pointer',
                    background: '#fef2f2',
                    color: '#dc2626',
                    marginRight: '6px',
                  }}
                >
                  清除
                </button>
              )}
            </>
          )}
          {(['raw', 'cleaned'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                fontSize: '10px',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '3px',
                border: tab === t ? '1px solid #bbb' : '1px solid transparent',
                cursor: 'pointer',
                textTransform: 'uppercase',
                letterSpacing: '0.05em',
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? '#333' : '#999',
              }}
            >
              {t}
              {t === 'cleaned' && cleanedText && (
                <span style={{ marginLeft: '4px', color: '#22c55e' }}>●</span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Transcript content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: '#ffffff',
          color: '#1a1a1a',
        }}
      >
        {tab === 'raw' ? (
          // RAW tab - 原始逐字稿
          lines.length === 0 ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#aaa',
                fontSize: '13px',
              }}
            >
              {isRecording ? '等待語音輸入...' : '錄音後逐字稿將顯示於此'}
            </div>
          ) : (
            <div style={{ padding: '12px' }}>
              {lines.map((line, idx) => {
                const isLatest = idx === lines.length - 1 && isRecording;
                const speakerColor = line.speaker !== undefined
                  ? SPEAKER_COLORS[line.speaker % SPEAKER_COLORS.length]
                  : undefined;
                const prevSpeaker = idx > 0 ? lines[idx - 1].speaker : undefined;
                const showSpeaker = line.speaker !== undefined && line.speaker !== prevSpeaker;
                return (
                  <div key={idx}>
                    {showSpeaker && (
                      <div style={{
                        fontSize: '10px',
                        fontWeight: 700,
                        color: speakerColor,
                        marginTop: idx > 0 ? '10px' : '0',
                        marginBottom: '2px',
                      }}>
                        講者 {(line.speaker ?? 0) + 1}
                      </div>
                    )}
                    <div
                      style={{
                        display: 'flex',
                        gap: '10px',
                        marginBottom: '4px',
                        alignItems: 'flex-start',
                      }}
                    >
                      <span
                        style={{
                          fontSize: '10px',
                          color: '#bbb',
                          minWidth: '36px',
                          paddingTop: '3px',
                          flexShrink: 0,
                          fontFamily: 'monospace',
                        }}
                      >
                        {String(idx + 1).padStart(2, '0')}:{String(Math.floor(idx * 3)).padStart(2, '0')}
                      </span>
                      {speakerColor && (
                        <span style={{
                          width: '3px',
                          flexShrink: 0,
                          background: speakerColor,
                          borderRadius: '2px',
                          alignSelf: 'stretch',
                        }} />
                      )}
                      <p
                        className={isLatest ? 'typing-cursor' : ''}
                        style={{
                          margin: 0,
                          fontSize: '13px',
                          lineHeight: 1.6,
                          color: line.isInterim ? '#999' : isLatest ? '#111' : '#333',
                          fontStyle: line.isInterim ? 'italic' : 'normal',
                          flex: 1,
                          background: isLatest ? '#f0f9ff' : 'transparent',
                          padding: isLatest ? '2px 6px' : '2px 0',
                          borderRadius: '3px',
                        }}
                      >
                        {line.text}
                        {line.isCorrection && (
                          <span style={{ fontSize: '9px', color: '#22c55e', marginLeft: '4px' }} title="AI 已修正">✓</span>
                        )}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>
          )
        ) : (
          // CLEANED tab - 修正後的文字
          !cleanedText ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: '#aaa',
                fontSize: '13px',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <span style={{ fontSize: '24px' }}>✨</span>
              <span>AI 修正後的文字將顯示於此</span>
              <span style={{ fontSize: '11px', color: '#bbb' }}>每 3 段自動修正一次</span>
            </div>
          ) : (
            <div style={{ padding: '16px' }}>
              <div
                style={{
                  fontSize: '14px',
                  lineHeight: 1.8,
                  color: '#1a1a1a',
                  whiteSpace: 'pre-wrap',
                }}
              >
                {cleanedText}
              </div>
              <div ref={bottomRef} />
            </div>
          )
        )}
      </div>

      {/* Summary sections */}
      {lines.length > 0 && (
        <div
          style={{
            flexShrink: 0,
            borderTop: '2px solid #e5e5e5',
            background: '#f8f8f8',
            maxHeight: '200px',
            overflowY: 'auto',
            padding: '12px',
          }}
        >
          <SummarySection title="Meeting Summary" icon="📋" color="#3b82f6" />
          <SummarySection title="Key Decisions" icon="✅" color="#10b981" />
          <SummarySection title="Action Items" icon="⚡" color="#f59e0b" />
        </div>
      )}
    </div>
  );
}

function SummarySection({ title, icon, color }: { title: string; icon: string; color: string }) {
  return (
    <div style={{ marginBottom: '10px' }}>
      <div
        style={{
          fontSize: '11px',
          fontWeight: 700,
          color: '#444',
          marginBottom: '4px',
          display: 'flex',
          alignItems: 'center',
          gap: '4px',
        }}
      >
        <span>{icon}</span>
        <span style={{ color }}>{title}</span>
      </div>
      <div style={{ fontSize: '12px', color: '#888', fontStyle: 'italic' }}>
        分析後自動填入...
      </div>
    </div>
  );
}
