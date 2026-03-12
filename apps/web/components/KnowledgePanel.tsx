'use client';

import { useRef } from 'react';
import { useKnowledge } from '@/hooks/useKnowledge';

function fileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📄';
  if (ext === 'md') return '📝';
  if (ext === 'txt') return '📃';
  if (ext === 'docx' || ext === 'doc') return '📘';
  return '📎';
}

export function KnowledgePanel() {
  const { docs, uploading, error, upload, remove } = useKnowledge();
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = '';
  };

  const totalChunks = docs.reduce((s, d) => s + d.chunks, 0);

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          📚 背景知識庫
        </span>
      </div>

      {/* Doc list */}
      <div style={{ marginBottom: '10px' }}>
        {docs.length === 0 ? (
          <div
            style={{
              border: '1px dashed #c8c8c0',
              borderRadius: '6px',
              padding: '12px',
              textAlign: 'center',
              color: '#bbb',
              fontSize: '12px',
              background: '#f0f0ea',
            }}
          >
            尚無文件
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {docs.map((doc) => (
              <div
                key={doc.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: '#fff',
                  border: '1px solid #ddd',
                  borderRadius: '6px',
                  padding: '6px 8px',
                }}
              >
                <span style={{ fontSize: '14px', flexShrink: 0 }}>{fileIcon(doc.filename)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: '12px',
                      color: '#333',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {doc.filename}
                  </div>
                  <div style={{ fontSize: '10px', color: '#999' }}>
                    {doc.chunks} 段落
                  </div>
                </div>
                <button
                  onClick={() => remove(doc.id)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#bbb',
                    cursor: 'pointer',
                    fontSize: '14px',
                    padding: '2px',
                    lineHeight: 1,
                    flexShrink: 0,
                  }}
                  title="刪除"
                >
                  ×
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Upload button */}
      <input
        ref={inputRef}
        type="file"
        accept=".txt,.md,.pdf,.docx"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        style={{
          width: '100%',
          padding: '7px',
          borderRadius: '6px',
          border: '1px dashed #bbb',
          background: uploading ? '#ececec' : '#f0f0ea',
          color: uploading ? '#aaa' : '#666',
          fontSize: '12px',
          cursor: uploading ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s',
        }}
      >
        {uploading ? '⏳ 索引中...' : '+ 上傳文件'}
      </button>

      {/* Stats */}
      {docs.length > 0 && (
        <div style={{ marginTop: '8px', fontSize: '11px', color: '#aaa', textAlign: 'center' }}>
          已索引: {docs.length} 份文件 · 向量數: {totalChunks}
        </div>
      )}

      {/* Error */}
      {error && (
        <div
          style={{
            marginTop: '8px',
            padding: '6px',
            background: '#fff0f0',
            border: '1px solid #ffcccc',
            borderRadius: '4px',
            fontSize: '11px',
            color: '#cc3333',
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
