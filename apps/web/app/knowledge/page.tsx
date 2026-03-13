'use client';

import { useState, useRef, useEffect } from 'react';

interface Document {
  id: string;
  filename: string;
  size: number;
  chunks: number;
  uploadedAt: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  streaming?: boolean;
}

export default function KnowledgePage() {
  const [mode, setMode] = useState<'chat' | 'docs'>('chat');
  const [query, setQuery] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);
  const esRef = useRef<EventSource | null>(null);

  const API_BASE = '/api';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    if (mode === 'docs') fetchDocuments();
  }, [mode]);

  // Clean up EventSource on unmount
  useEffect(() => () => { esRef.current?.close(); }, []);

  const fetchDocuments = async () => {
    try {
      const res = await fetch(`${API_BASE}/knowledge/list`);
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch (err) {
      console.error('Failed to fetch documents:', err);
    }
  };

  const handleAsk = () => {
    if (!query.trim() || loading) return;

    // Close any existing stream
    esRef.current?.close();

    const currentQuery = query;
    setQuery('');
    setLoading(true);
    setError('');

    // Add user + empty streaming assistant placeholder
    setMessages((prev) => [
      ...prev,
      { role: 'user', content: currentQuery },
      { role: 'assistant', content: '', streaming: true },
    ]);

    const params = new URLSearchParams({ question: currentQuery, limit: '5' });
    if (sessionIdRef.current) params.set('sessionId', sessionIdRef.current);

    const es = new EventSource(`${API_BASE}/ask-stream?${params}`);
    esRef.current = es;

    es.addEventListener('text', (e) => {
      const { text } = JSON.parse((e as MessageEvent).data) as { text: string };
      setMessages((prev) => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last?.role === 'assistant') {
          msgs[msgs.length - 1] = { ...last, content: last.content + text };
        }
        return msgs;
      });
    });

    es.addEventListener('done', (e) => {
      const { sessionId: sid, sources } = JSON.parse((e as MessageEvent).data) as {
        sessionId: string | null;
        sources: string[];
      };
      if (sid) sessionIdRef.current = sid;
      setMessages((prev) => {
        const msgs = [...prev];
        const last = msgs[msgs.length - 1];
        if (last?.role === 'assistant') {
          msgs[msgs.length - 1] = { ...last, streaming: false, sources };
        }
        return msgs;
      });
      es.close();
      esRef.current = null;
      setLoading(false);
    });

    es.addEventListener('fail', (e) => {
      const { message } = JSON.parse((e as MessageEvent).data) as { message: string };
      setError(message);
      // Remove empty assistant placeholder
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) return prev.slice(0, -1);
        return prev.map((m, i) =>
          i === prev.length - 1 && m.role === 'assistant' ? { ...m, streaming: false } : m,
        );
      });
      es.close();
      esRef.current = null;
      setLoading(false);
    });

    es.onerror = () => {
      // Only handle if still loading (not closed intentionally)
      if (es.readyState === EventSource.CLOSED) return;
      setError('連線中斷，請重試');
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) return prev.slice(0, -1);
        return prev.map((m, i) =>
          i === prev.length - 1 && m.role === 'assistant' ? { ...m, streaming: false } : m,
        );
      });
      es.close();
      esRef.current = null;
      setLoading(false);
    };
  };

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError('');

    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`${API_BASE}/knowledge/upload`, { method: 'POST', body: formData });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Upload failed');
      }
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : '上傳失敗');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('確定要刪除這個文件嗎？')) return;
    try {
      const res = await fetch(`${API_BASE}/knowledge/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      await fetchDocuments();
    } catch (err) {
      setError(err instanceof Error ? err.message : '刪除失敗');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAsk();
    }
  };

  const clearChat = () => {
    esRef.current?.close();
    esRef.current = null;
    sessionIdRef.current = undefined;
    setMessages([]);
    setError('');
    setLoading(false);
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const hasSession = !!sessionIdRef.current;

  return (
    // BUG FIX: use height:100dvh (not minHeight) so the inner scroll container
    // is properly bounded and overflow-y:auto can trigger scrolling.
    <div
      style={{
        height: '100dvh',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '16px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(0,0,0,0.2)',
          flexShrink: 0,
        }}
      >
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <a href="/" style={{ color: '#8892b0', textDecoration: 'none', fontSize: '0.9rem' }}>
                ← 返回
              </a>
              <h1 style={{ fontSize: '1.4rem', fontWeight: 700, color: '#fff', margin: 0 }}>
                📚 知識庫問答
              </h1>
              {/* Session indicator */}
              {mode === 'chat' && hasSession && (
                <span
                  style={{
                    fontSize: '11px',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    background: 'rgba(100,255,218,0.1)',
                    border: '1px solid rgba(100,255,218,0.3)',
                    color: '#64ffda',
                  }}
                >
                  對話中
                </span>
              )}
            </div>

            {/* Mode Toggle */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '4px',
                flexShrink: 0,
              }}
            >
              {(['chat', 'docs'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background:
                      mode === m
                        ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                        : 'transparent',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: mode === m ? 600 : 400,
                  }}
                >
                  {m === 'chat' ? '💬 問答' : '📁 文件'}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Main scrollable content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: '900px', margin: '0 auto' }}>
          {/* Error */}
          {error && (
            <div
              style={{
                background: 'rgba(239,68,68,0.1)',
                border: '1px solid rgba(239,68,68,0.3)',
                borderRadius: '8px',
                padding: '14px 18px',
                marginBottom: '20px',
                color: '#fca5a5',
              }}
            >
              ⚠️ {error}
            </div>
          )}

          {/* Chat Mode */}
          {mode === 'chat' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {messages.length === 0 && (
                <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>💬</div>
                  <p style={{ fontSize: '1.1rem', color: '#8892b0' }}>問我任何關於知識庫的問題！</p>
                  <p style={{ fontSize: '0.9rem', color: '#4a5568', marginTop: '8px' }}>
                    請先在「文件」頁面上傳文件，然後開始提問
                  </p>
                </div>
              )}

              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  style={{
                    display: 'flex',
                    justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                  }}
                >
                  <div
                    style={{
                      maxWidth: '85%',
                      background:
                        msg.role === 'user'
                          ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                          : 'rgba(255,255,255,0.08)',
                      borderRadius:
                        msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      padding: '14px 18px',
                      border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.1)' : 'none',
                    }}
                  >
                    {/* Message text */}
                    {msg.content ? (
                      <p
                        style={{
                          color: '#fff',
                          margin: 0,
                          lineHeight: 1.7,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {msg.content}
                        {msg.streaming && <span className="streaming-cursor" />}
                      </p>
                    ) : (
                      // Empty streaming placeholder
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#8892b0' }}>
                        <div className="spinner" />
                        <span>Claude 思考中...</span>
                      </div>
                    )}

                    {/* Sources */}
                    {msg.sources && msg.sources.length > 0 && (
                      <details style={{ marginTop: '12px' }}>
                        <summary
                          style={{ color: '#64ffda', cursor: 'pointer', fontSize: '0.85rem' }}
                        >
                          📚 參考來源 ({msg.sources.length})
                        </summary>
                        <div
                          style={{
                            marginTop: '10px',
                            display: 'flex',
                            flexDirection: 'column',
                            gap: '8px',
                          }}
                        >
                          {msg.sources.map((s, i) => (
                            <div
                              key={i}
                              style={{
                                background: 'rgba(0,0,0,0.2)',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                fontSize: '0.85rem',
                              }}
                            >
                              <span style={{ color: '#64ffda', marginRight: '8px' }}>#{i + 1}</span>
                              <span style={{ color: '#ccd6f6' }}>
                                {s.length > 200 ? s.slice(0, 200) + '...' : s}
                              </span>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                </div>
              ))}

              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Docs Mode */}
          {mode === 'docs' && (
            <div>
              <div
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  borderRadius: '12px',
                  padding: '24px',
                  marginBottom: '24px',
                  border: '1px solid rgba(255,255,255,0.1)',
                  textAlign: 'center',
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".txt,.md,.pdf,.doc,.docx"
                  onChange={handleUpload}
                  style={{ display: 'none' }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={uploading}
                  style={{
                    padding: '14px 32px',
                    borderRadius: '8px',
                    border: 'none',
                    background: uploading
                      ? '#4a5568'
                      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                    color: '#fff',
                    fontSize: '1rem',
                    fontWeight: 600,
                    cursor: uploading ? 'not-allowed' : 'pointer',
                  }}
                >
                  {uploading ? '上傳中...' : '📤 上傳文件'}
                </button>
                <p style={{ color: '#8892b0', marginTop: '12px', fontSize: '0.9rem' }}>
                  支援 .txt, .md, .pdf, .doc, .docx (最大 20MB)
                </p>
              </div>

              <h2 style={{ color: '#ccd6f6', fontSize: '1.2rem', marginBottom: '16px' }}>
                已上傳文件 ({documents.length})
              </h2>
              {documents.length === 0 ? (
                <div style={{ textAlign: 'center', color: '#4a5568', padding: '40px' }}>
                  <p>尚未上傳任何文件</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {documents.map((doc) => (
                    <div
                      key={doc.id}
                      style={{
                        background: 'rgba(255,255,255,0.05)',
                        borderRadius: '10px',
                        padding: '16px 20px',
                        border: '1px solid rgba(255,255,255,0.1)',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        gap: '12px',
                      }}
                    >
                      <div>
                        <div style={{ color: '#fff', fontWeight: 500, marginBottom: '4px' }}>
                          📄 {doc.filename}
                        </div>
                        <div style={{ color: '#8892b0', fontSize: '0.85rem' }}>
                          {formatSize(doc.size)} · {doc.chunks} 個片段 ·{' '}
                          {new Date(doc.uploadedAt).toLocaleString('zh-TW')}
                        </div>
                      </div>
                      <button
                        onClick={() => handleDelete(doc.id)}
                        style={{
                          padding: '8px 16px',
                          borderRadius: '6px',
                          border: '1px solid rgba(239,68,68,0.3)',
                          background: 'transparent',
                          color: '#fca5a5',
                          cursor: 'pointer',
                          fontSize: '0.85rem',
                          flexShrink: 0,
                        }}
                      >
                        🗑️ 刪除
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Input Bar (Chat mode only) */}
      {mode === 'chat' && (
        <div
          style={{
            padding: '16px 24px',
            paddingBottom: 'calc(16px + env(safe-area-inset-bottom))',
            borderTop: '1px solid rgba(255,255,255,0.1)',
            background: 'rgba(0,0,0,0.2)',
            flexShrink: 0,
          }}
        >
          <div style={{ maxWidth: '900px', margin: '0 auto' }}>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={clearChat}
                title="清除對話"
                style={{
                  padding: '14px 16px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'transparent',
                  color: '#8892b0',
                  cursor: 'pointer',
                  flexShrink: 0,
                }}
              >
                🗑️
              </button>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={hasSession ? '繼續問…（Claude 記得上下文）' : '輸入問題...'}
                disabled={loading}
                style={{
                  flex: 1,
                  padding: '14px 18px',
                  borderRadius: '12px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  fontSize: '1rem',
                  outline: 'none',
                  minWidth: 0,
                }}
              />
              <button
                onClick={handleAsk}
                disabled={loading || !query.trim()}
                style={{
                  padding: '14px 28px',
                  borderRadius: '12px',
                  border: 'none',
                  background:
                    loading || !query.trim()
                      ? '#4a5568'
                      : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                  color: '#fff',
                  fontSize: '1rem',
                  fontWeight: 600,
                  cursor: loading || !query.trim() ? 'not-allowed' : 'pointer',
                  minWidth: '80px',
                  flexShrink: 0,
                }}
              >
                {loading ? '...' : '送出'}
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`
        .spinner {
          width: 16px;
          height: 16px;
          border: 2px solid rgba(255,255,255,0.3);
          border-top-color: #667eea;
          border-radius: 50%;
          animation: spin 1s linear infinite;
          flex-shrink: 0;
        }
        @keyframes spin { to { transform: rotate(360deg); } }

        .streaming-cursor::after {
          content: '▍';
          display: inline-block;
          animation: blink-cursor 0.8s step-end infinite;
          color: #667eea;
          margin-left: 2px;
        }
        @keyframes blink-cursor { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
