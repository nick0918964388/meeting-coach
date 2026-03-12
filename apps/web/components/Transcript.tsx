'use client';

import { useEffect, useRef, useState } from 'react';

interface TranscriptProps {
  lines: string[];
  isRecording: boolean;
}

export function Transcript({ lines, isRecording }: TranscriptProps) {
  const bottomRef = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<'raw' | 'cleaned'>('raw');

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines]);

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
        <div style={{ display: 'flex', gap: '4px' }}>
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
            </button>
          ))}
        </div>
      </div>

      {/* Raw transcript (white bg) */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          background: '#ffffff',
          color: '#1a1a1a',
        }}
      >
        {lines.length === 0 ? (
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
              return (
                <div
                  key={idx}
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
                  <p
                    className={isLatest ? 'typing-cursor' : ''}
                    style={{
                      margin: 0,
                      fontSize: '13px',
                      lineHeight: 1.6,
                      color: isLatest ? '#111' : '#333',
                      flex: 1,
                      background: isLatest ? '#f0f9ff' : 'transparent',
                      padding: isLatest ? '2px 6px' : '2px 0',
                      borderRadius: '3px',
                    }}
                  >
                    {line}
                  </p>
                </div>
              );
            })}
            <div ref={bottomRef} />
          </div>
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
