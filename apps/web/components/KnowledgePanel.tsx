'use client';

import { useState, useRef, useEffect } from 'react';
import { useKnowledge } from '@/hooks/useKnowledge';

function fileIcon(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return '📄';
  if (ext === 'md') return '📝';
  if (ext === 'txt') return '📃';
  if (ext === 'docx' || ext === 'doc') return '📘';
  return '📎';
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: string[];
  streaming?: boolean;
}

interface KnowledgePanelProps {
  meetingId?: string;
}

export function KnowledgePanel({ meetingId = 'global' }: KnowledgePanelProps) {
  const [tab, setTab] = useState<'docs' | 'chat'>('docs');
  const { docs, uploading, error, upload, remove } = useKnowledge(meetingId);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [query, setQuery] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const esRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Cleanup SSE on unmount
  useEffect(() => () => { esRef.current?.close(); }, []);

  // Reset chat when meetingId changes
  useEffect(() => {
    esRef.current?.close();
    esRef.current = null;
    sessionIdRef.current = undefined;
    setMessages([]);
    setChatError('');
    setChatLoading(false);
  }, [meetingId]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) upload(file);
    e.target.value = '';
  };

  const handleAsk = () => {
    if (!query.trim() || chatLoading) return;
    esRef.current?.close();

    const currentQuery = query;
    setQuery('');
    setChatLoading(true);
    setChatError('');

    setMessages((prev) => [
      ...prev,
      { role: 'user', content: currentQuery },
      { role: 'assistant', content: '', streaming: true },
    ]);

    const params = new URLSearchParams({ question: currentQuery, limit: '5', meetingId });
    if (sessionIdRef.current) params.set('sessionId', sessionIdRef.current);

    const es = new EventSource(`/api/ask-stream?${params}`);
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
        if (last?.role === 'assistant') msgs[msgs.length - 1] = { ...last, streaming: false, sources };
        return msgs;
      });
      es.close();
      esRef.current = null;
      setChatLoading(false);
    });

    const handleStreamError = () => {
      setMessages((prev) => {
        const last = prev[prev.length - 1];
        if (last?.role === 'assistant' && !last.content) return prev.slice(0, -1);
        return prev.map((m, i) =>
          i === prev.length - 1 && m.role === 'assistant' ? { ...m, streaming: false } : m,
        );
      });
      es.close();
      esRef.current = null;
      setChatLoading(false);
    };

    es.addEventListener('fail', (e) => {
      const { message } = JSON.parse((e as MessageEvent).data) as { message: string };
      setChatError(message);
      handleStreamError();
    });

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) return;
      setChatError('連線中斷，請重試');
      handleStreamError();
    };
  };

  const clearChat = () => {
    esRef.current?.close();
    esRef.current = null;
    sessionIdRef.current = undefined;
    setMessages([]);
    setChatError('');
    setChatLoading(false);
  };

  const totalChunks = docs.reduce((s, d) => s + d.chunks, 0);

  return (
    <div>
      {/* Header with tabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: '#888', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          📚 知識庫
        </span>
        <div style={{ display: 'flex', background: '#e8e8e0', borderRadius: '5px', padding: '2px', gap: '2px' }}>
          {(['docs', 'chat'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '2px 8px',
                borderRadius: '4px',
                border: 'none',
                background: tab === t ? '#fff' : 'transparent',
                color: tab === t ? '#333' : '#888',
                fontSize: '10px',
                fontWeight: tab === t ? 600 : 400,
                cursor: 'pointer',
                boxShadow: tab === t ? '0 1px 2px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {t === 'docs' ? '文件' : '問答'}
            </button>
          ))}
        </div>
      </div>

      {/* Docs Tab */}
      {tab === 'docs' && (
        <div>
          <div style={{ marginBottom: '8px' }}>
            {docs.length === 0 ? (
              <div style={{ border: '1px dashed #c8c8c0', borderRadius: '6px', padding: '12px', textAlign: 'center', color: '#bbb', fontSize: '12px', background: '#f0f0ea' }}>
                尚無文件
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {docs.map((doc) => (
                  <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#fff', border: '1px solid #ddd', borderRadius: '6px', padding: '6px 8px' }}>
                    <span style={{ fontSize: '14px', flexShrink: 0 }}>{fileIcon(doc.filename)}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '12px', color: '#333', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {doc.filename}
                      </div>
                      <div style={{ fontSize: '10px', color: '#999' }}>{doc.chunks} 段落</div>
                    </div>
                    <button
                      onClick={() => remove(doc.id)}
                      style={{ background: 'none', border: 'none', color: '#bbb', cursor: 'pointer', fontSize: '14px', padding: '2px', lineHeight: 1, flexShrink: 0 }}
                      title="刪除"
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <input ref={fileInputRef} type="file" accept=".txt,.md,.pdf,.docx" style={{ display: 'none' }} onChange={handleFileChange} />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ width: '100%', padding: '7px', borderRadius: '6px', border: '1px dashed #bbb', background: uploading ? '#ececec' : '#f0f0ea', color: uploading ? '#aaa' : '#666', fontSize: '12px', cursor: uploading ? 'not-allowed' : 'pointer', transition: 'all 0.2s' }}
          >
            {uploading ? '⏳ 索引中...' : '+ 上傳文件'}
          </button>

          {docs.length > 0 && (
            <div style={{ marginTop: '8px', fontSize: '11px', color: '#aaa', textAlign: 'center' }}>
              已索引: {docs.length} 份文件 · 向量數: {totalChunks}
            </div>
          )}

          {error && (
            <div style={{ marginTop: '8px', padding: '6px', background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '4px', fontSize: '11px', color: '#cc3333' }}>
              {error}
            </div>
          )}
        </div>
      )}

      {/* Chat Tab */}
      {tab === 'chat' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* Messages */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', maxHeight: '260px', overflowY: 'auto', padding: '4px 0' }}>
            {messages.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 8px', color: '#bbb', fontSize: '12px' }}>
                <div style={{ marginBottom: '4px', fontSize: '18px' }}>💬</div>
                問我關於知識庫的問題
              </div>
            ) : (
              messages.map((msg, idx) => (
                <div key={idx} style={{ display: 'flex', justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start' }}>
                  <div
                    style={{
                      maxWidth: '90%',
                      padding: '6px 10px',
                      borderRadius: msg.role === 'user' ? '10px 10px 2px 10px' : '10px 10px 10px 2px',
                      background: msg.role === 'user' ? '#3b82f6' : '#f0f0ea',
                      color: msg.role === 'user' ? '#fff' : '#333',
                      fontSize: '12px',
                      lineHeight: 1.5,
                      border: msg.role === 'assistant' ? '1px solid #e0e0d8' : 'none',
                    }}
                  >
                    {msg.content ? (
                      <span style={{ whiteSpace: 'pre-wrap' }}>
                        {msg.content}
                        {msg.streaming && (
                          <span style={{ display: 'inline-block', color: '#3b82f6', marginLeft: '2px', animation: 'kb-blink 0.8s step-end infinite' }}>▍</span>
                        )}
                      </span>
                    ) : (
                      <span style={{ color: '#999' }}>思考中...</span>
                    )}
                    {msg.sources && msg.sources.length > 0 && (
                      <div style={{ marginTop: '4px', fontSize: '10px', color: '#888' }}>
                        📚 {msg.sources.length} 個來源
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
            <div ref={messagesEndRef} />
          </div>

          {chatError && (
            <div style={{ padding: '4px 6px', background: '#fff0f0', border: '1px solid #ffcccc', borderRadius: '4px', fontSize: '11px', color: '#cc3333' }}>
              ⚠️ {chatError}
            </div>
          )}

          {/* Input row */}
          <div style={{ display: 'flex', gap: '4px', alignItems: 'center' }}>
            {messages.length > 0 && (
              <button
                onClick={clearChat}
                title="清除對話"
                style={{ padding: '5px 6px', borderRadius: '5px', border: '1px solid #ddd', background: '#f0f0ea', color: '#999', fontSize: '12px', cursor: 'pointer', flexShrink: 0, lineHeight: 1 }}
              >
                🗑
              </button>
            )}
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleAsk(); } }}
              placeholder={sessionIdRef.current ? '繼續問…' : '輸入問題...'}
              disabled={chatLoading}
              style={{ flex: 1, padding: '6px 8px', borderRadius: '5px', border: '1px solid #ccc', fontSize: '12px', background: '#fff', color: '#333', outline: 'none', minWidth: 0 }}
            />
            <button
              onClick={handleAsk}
              disabled={chatLoading || !query.trim()}
              style={{ padding: '6px 10px', borderRadius: '5px', border: 'none', background: chatLoading || !query.trim() ? '#ccc' : '#3b82f6', color: '#fff', fontSize: '12px', fontWeight: 600, cursor: chatLoading || !query.trim() ? 'not-allowed' : 'pointer', flexShrink: 0 }}
            >
              {chatLoading ? '...' : '送'}
            </button>
          </div>
        </div>
      )}

      <style>{`
        @keyframes kb-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0; } }
      `}</style>
    </div>
  );
}
