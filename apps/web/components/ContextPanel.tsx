'use client';

import { useState } from 'react';
import { KnowledgePanel } from './KnowledgePanel';
import type { Meeting } from '@/hooks/useMeetings';

interface ContextPanelProps {
  meetings: Meeting[];
  activeMeeting: Meeting | null;
  onSelectMeeting: (id: string) => void;
  onCreateMeeting: (title: string) => void;
  onDeleteMeeting: (id: string) => void;
  loading?: boolean;
}

export function ContextPanel({
  meetings,
  activeMeeting,
  onSelectMeeting,
  onCreateMeeting,
  onDeleteMeeting,
  loading,
}: ContextPanelProps) {
  const [creating, setCreating] = useState(false);
  const [newTitle, setNewTitle] = useState('');

  const handleCreate = () => {
    const title = newTitle.trim() || `會議 ${new Date().toLocaleDateString('zh-TW')}`;
    onCreateMeeting(title);
    setNewTitle('');
    setCreating(false);
  };

  const info = activeMeeting
    ? [
        { label: '標題', value: activeMeeting.title },
        { label: '日期', value: activeMeeting.date },
        { label: '逐字稿', value: `${activeMeeting.transcript.length} 段` },
      ]
    : [
        { label: '類型', value: 'Meeting Playbook' },
        { label: '項目', value: '內部' },
        { label: '日期', value: new Date().toLocaleDateString('zh-TW') },
        { label: '時間', value: new Date().toLocaleTimeString('zh-TW', { hour: '2-digit', minute: '2-digit' }) },
      ];

  return (
    <div
      style={{
        background: '#f5f5f0',
        borderRight: '1px solid #d8d8d0',
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        overflow: 'hidden',
      }}
    >
      {/* Section label */}
      <div
        style={{
          height: '40px',
          padding: '0 14px',
          borderBottom: '1px solid #d8d8d0',
          display: 'flex',
          alignItems: 'center',
          fontSize: '10px',
          fontWeight: 700,
          color: '#888',
          textTransform: 'uppercase',
          letterSpacing: '0.1em',
          flexShrink: 0,
          background: '#eeeee8',
          boxSizing: 'border-box',
        }}
      >
        Context / Playbook
      </div>

      {/* Scrollable content */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          padding: '12px 14px',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
        }}
      >
        {/* Meeting Selector */}
        <div>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '8px',
            }}
          >
            🗂 會議
          </div>

          {/* Dropdown */}
          <select
            value={activeMeeting?.id ?? ''}
            onChange={(e) => e.target.value && onSelectMeeting(e.target.value)}
            style={{
              width: '100%',
              padding: '5px 8px',
              borderRadius: '5px',
              border: '1px solid #ccc',
              background: '#fff',
              color: '#333',
              fontSize: '12px',
              marginBottom: '6px',
              cursor: 'pointer',
            }}
          >
            <option value="">— 選擇會議 —</option>
            {meetings.map((m) => (
              <option key={m.id} value={m.id}>
                {m.title}
              </option>
            ))}
          </select>

          {/* New meeting */}
          {creating ? (
            <div style={{ display: 'flex', gap: '4px' }}>
              <input
                autoFocus
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreate();
                  if (e.key === 'Escape') setCreating(false);
                }}
                placeholder="會議標題..."
                style={{
                  flex: 1,
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: '1px solid #ccc',
                  fontSize: '12px',
                  color: '#333',
                  background: '#fff',
                }}
              />
              <button
                onClick={handleCreate}
                disabled={loading}
                style={{
                  padding: '4px 10px',
                  borderRadius: '4px',
                  border: 'none',
                  background: '#22c55e',
                  color: '#fff',
                  fontSize: '12px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                建立
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => setCreating(true)}
                style={{
                  flex: 1,
                  padding: '4px 0',
                  borderRadius: '4px',
                  border: '1px dashed #bbb',
                  background: '#f0f0ea',
                  color: '#666',
                  fontSize: '11px',
                  cursor: 'pointer',
                }}
              >
                + 新增會議
              </button>
              {activeMeeting && (
                <button
                  onClick={() => {
                    if (confirm(`刪除「${activeMeeting.title}」？`)) {
                      onDeleteMeeting(activeMeeting.id);
                    }
                  }}
                  style={{
                    padding: '4px 8px',
                    borderRadius: '4px',
                    border: '1px solid #ddd',
                    background: '#fff',
                    color: '#cc4444',
                    fontSize: '11px',
                    cursor: 'pointer',
                  }}
                  title="刪除此會議"
                >
                  🗑
                </button>
              )}
            </div>
          )}
        </div>

        {/* Meeting Info */}
        <div>
          <div
            style={{
              fontSize: '10px',
              fontWeight: 600,
              color: '#888',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
              marginBottom: '8px',
            }}
          >
            📋 會議資訊
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <tbody>
              {info.map(({ label, value }) => (
                <tr key={label} style={{ borderBottom: '1px solid #e0e0d8' }}>
                  <td
                    style={{
                      padding: '5px 0',
                      fontSize: '11px',
                      color: '#888',
                      width: '38%',
                      verticalAlign: 'top',
                    }}
                  >
                    {label}
                  </td>
                  <td style={{ padding: '5px 0', fontSize: '12px', color: '#333' }}>{value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Summary placeholder */}
        {!activeMeeting && (
          <div>
            <div
              style={{
                fontSize: '10px',
                fontWeight: 600,
                color: '#888',
                textTransform: 'uppercase',
                letterSpacing: '0.08em',
                marginBottom: '8px',
              }}
            >
              Summary
            </div>
            <div style={{ fontSize: '12px', color: '#aaa', fontStyle: 'italic' }}>
              錄音後自動生成摘要...
            </div>
          </div>
        )}

        {/* Knowledge Base */}
        <KnowledgePanel meetingId={activeMeeting?.id ?? 'global'} />
      </div>
    </div>
  );
}
