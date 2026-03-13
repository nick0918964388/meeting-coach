'use client';

import { useState, useRef, useEffect } from 'react';

interface SearchResult {
  id: string;
  score: number;
  content: string;
  metadata: Record<string, unknown>;
}

interface AskResponse {
  question: string;
  answer: string;
  sources: SearchResult[];
  model: string;
}

interface Message {
  role: 'user' | 'assistant';
  content: string;
  sources?: SearchResult[];
  model?: string;
}

export default function VectorTestPage() {
  const [mode, setMode] = useState<'search' | 'chat'>('chat');
  const [collection, setCollection] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(5);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [collections, setCollections] = useState<string[]>([]);
  const [models, setModels] = useState<string[]>([]);
  const [selectedModel, setSelectedModel] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const API_BASE = 'https://vector-search.nickai.cc';

  useEffect(() => {
    fetchCollections();
    fetchModels();
  }, []);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const fetchCollections = async () => {
    try {
      const res = await fetch(`${API_BASE}/collections`);
      const data = await res.json();
      const cols = data.result.collections.map((c: { name: string }) => c.name);
      setCollections(cols);
      if (cols.length > 0 && !collection) {
        setCollection(cols[0]);
      }
    } catch (err) {
      console.error('Failed to fetch collections:', err);
    }
  };

  const fetchModels = async () => {
    try {
      const res = await fetch(`${API_BASE}/models`);
      const data = await res.json();
      setModels(data.models || []);
      setSelectedModel(data.default || '');
    } catch (err) {
      console.error('Failed to fetch models:', err);
    }
  };

  const handleSearch = async () => {
    if (!collection || !query) {
      setError('請輸入 Collection 和搜尋關鍵字');
      return;
    }

    setLoading(true);
    setError('');
    setResults([]);

    try {
      const res = await fetch(`${API_BASE}/search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ collection, query, limit }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResults(data.results);
    } catch (err) {
      setError(err instanceof Error ? err.message : '搜尋失敗');
    } finally {
      setLoading(false);
    }
  };

  const handleAsk = async () => {
    if (!collection || !query) {
      setError('請選擇 Collection 並輸入問題');
      return;
    }

    const userMessage: Message = { role: 'user', content: query };
    setMessages((prev) => [...prev, userMessage]);
    setQuery('');
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          collection,
          question: query,
          limit,
          model: selectedModel || undefined,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data: AskResponse = await res.json();

      const assistantMessage: Message = {
        role: 'assistant',
        content: data.answer,
        sources: data.sources,
        model: data.model,
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'AI 回答失敗');
      // Remove the user message on error
      setMessages((prev) => prev.slice(0, -1));
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (mode === 'search') handleSearch();
      else handleAsk();
    }
  };

  const clearChat = () => {
    setMessages([]);
    setResults([]);
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)',
        fontFamily: 'system-ui, -apple-system, sans-serif',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <h1
              style={{
                fontSize: '1.5rem',
                fontWeight: 700,
                color: '#fff',
                margin: 0,
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
              }}
            >
              🔍 Vector Search
            </h1>

            {/* Mode Toggle */}
            <div
              style={{
                display: 'flex',
                background: 'rgba(255,255,255,0.1)',
                borderRadius: '8px',
                padding: '4px',
              }}
            >
              {(['search', 'chat'] as const).map((m) => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  style={{
                    padding: '8px 16px',
                    borderRadius: '6px',
                    border: 'none',
                    background: mode === m ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)' : 'transparent',
                    color: '#fff',
                    cursor: 'pointer',
                    fontSize: '0.9rem',
                    fontWeight: mode === m ? 600 : 400,
                  }}
                >
                  {m === 'search' ? '🔎 搜尋' : '💬 問答'}
                </button>
              ))}
            </div>
          </div>

          {/* Settings Row */}
          <div
            style={{
              display: 'flex',
              gap: '12px',
              marginTop: '16px',
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            {/* Collection Select */}
            <select
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(0,0,0,0.3)',
                color: '#fff',
                fontSize: '0.95rem',
                minWidth: '180px',
              }}
            >
              <option value="">選擇 Collection...</option>
              {collections.map((c) => (
                <option key={c} value={c}>
                  📁 {c}
                </option>
              ))}
            </select>

            {/* Model Select (Chat mode only) */}
            {mode === 'chat' && (
              <select
                value={selectedModel}
                onChange={(e) => setSelectedModel(e.target.value)}
                style={{
                  padding: '10px 14px',
                  borderRadius: '8px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(0,0,0,0.3)',
                  color: '#fff',
                  fontSize: '0.95rem',
                  minWidth: '150px',
                }}
              >
                {models.map((m) => (
                  <option key={m} value={m}>
                    🤖 {m}
                  </option>
                ))}
              </select>
            )}

            {/* Limit */}
            <select
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              style={{
                padding: '10px 14px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(0,0,0,0.3)',
                color: '#fff',
                fontSize: '0.95rem',
              }}
            >
              {[3, 5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  Top {n}
                </option>
              ))}
            </select>

            {/* Clear Button */}
            <button
              onClick={clearChat}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                color: '#8892b0',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              🗑️ 清除
            </button>

            <button
              onClick={fetchCollections}
              style={{
                padding: '10px 16px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'transparent',
                color: '#8892b0',
                cursor: 'pointer',
                fontSize: '0.9rem',
              }}
            >
              🔄 重新整理
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: '24px' }}>
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
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
                <div
                  style={{
                    textAlign: 'center',
                    color: '#4a5568',
                    padding: '60px 20px',
                  }}
                >
                  <div style={{ fontSize: '3rem', marginBottom: '16px' }}>💬</div>
                  <p style={{ fontSize: '1.1rem' }}>選擇 Collection 後，開始提問吧！</p>
                  <p style={{ fontSize: '0.9rem', marginTop: '8px' }}>AI 會根據文件庫內容回答你的問題</p>
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
                      maxWidth: '80%',
                      background:
                        msg.role === 'user'
                          ? 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)'
                          : 'rgba(255,255,255,0.08)',
                      borderRadius: msg.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                      padding: '14px 18px',
                      border: msg.role === 'assistant' ? '1px solid rgba(255,255,255,0.1)' : 'none',
                    }}
                  >
                    <p
                      style={{
                        color: '#fff',
                        margin: 0,
                        lineHeight: 1.6,
                        whiteSpace: 'pre-wrap',
                      }}
                    >
                      {msg.content}
                    </p>

                    {/* Sources */}
                    {msg.sources && msg.sources.length > 0 && (
                      <details style={{ marginTop: '12px' }}>
                        <summary
                          style={{
                            color: '#64ffda',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                          }}
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
                              key={s.id}
                              style={{
                                background: 'rgba(0,0,0,0.2)',
                                borderRadius: '8px',
                                padding: '10px 12px',
                                fontSize: '0.85rem',
                              }}
                            >
                              <div
                                style={{
                                  display: 'flex',
                                  justifyContent: 'space-between',
                                  marginBottom: '6px',
                                }}
                              >
                                <span style={{ color: '#64ffda' }}>#{i + 1}</span>
                                <span style={{ color: '#8892b0' }}>{(s.score * 100).toFixed(1)}%</span>
                              </div>
                              <p style={{ color: '#ccd6f6', margin: 0, lineHeight: 1.5 }}>
                                {s.content.length > 200 ? s.content.slice(0, 200) + '...' : s.content}
                              </p>
                            </div>
                          ))}
                        </div>
                      </details>
                    )}

                    {/* Model info */}
                    {msg.model && (
                      <div
                        style={{
                          marginTop: '8px',
                          fontSize: '0.75rem',
                          color: '#4a5568',
                        }}
                      >
                        🤖 {msg.model}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && (
                <div style={{ display: 'flex', justifyContent: 'flex-start' }}>
                  <div
                    style={{
                      background: 'rgba(255,255,255,0.08)',
                      borderRadius: '16px 16px 16px 4px',
                      padding: '14px 18px',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <div style={{ display: 'flex', gap: '6px' }}>
                      {[0, 1, 2].map((i) => (
                        <div
                          key={i}
                          style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: '#667eea',
                            animation: `pulse 1.4s ease-in-out ${i * 0.2}s infinite`,
                          }}
                        />
                      ))}
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* Search Mode Results */}
          {mode === 'search' && results.length > 0 && (
            <div>
              <h2 style={{ color: '#ccd6f6', fontSize: '1.2rem', marginBottom: '16px' }}>
                搜尋結果 ({results.length} 筆)
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {results.map((r, idx) => (
                  <div
                    key={r.id}
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      borderRadius: '12px',
                      padding: '18px',
                      border: '1px solid rgba(255,255,255,0.1)',
                    }}
                  >
                    <div
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        marginBottom: '10px',
                      }}
                    >
                      <span
                        style={{
                          background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                          color: '#fff',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '0.85rem',
                          fontWeight: 600,
                        }}
                      >
                        #{idx + 1}
                      </span>
                      <span
                        style={{
                          color: r.score > 0.7 ? '#64ffda' : r.score > 0.5 ? '#fbbf24' : '#8892b0',
                          fontWeight: 600,
                          fontSize: '0.9rem',
                        }}
                      >
                        {(r.score * 100).toFixed(1)}%
                      </span>
                    </div>
                    <p style={{ color: '#e2e8f0', lineHeight: 1.7, margin: 0, whiteSpace: 'pre-wrap' }}>
                      {r.content}
                    </p>
                    {Object.keys(r.metadata).length > 0 && (
                      <div
                        style={{
                          marginTop: '12px',
                          paddingTop: '12px',
                          borderTop: '1px solid rgba(255,255,255,0.1)',
                          display: 'flex',
                          gap: '8px',
                          flexWrap: 'wrap',
                        }}
                      >
                        {Object.entries(r.metadata).map(([k, v]) => (
                          <span
                            key={k}
                            style={{
                              background: 'rgba(100,255,218,0.1)',
                              color: '#64ffda',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '0.8rem',
                            }}
                          >
                            {k}: {String(v)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Input Bar */}
      <div
        style={{
          padding: '16px 24px',
          borderTop: '1px solid rgba(255,255,255,0.1)',
          background: 'rgba(0,0,0,0.2)',
        }}
      >
        <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
          <div style={{ display: 'flex', gap: '12px' }}>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={mode === 'search' ? '輸入搜尋關鍵字...' : '輸入問題...'}
              style={{
                flex: 1,
                padding: '14px 18px',
                borderRadius: '12px',
                border: '1px solid rgba(255,255,255,0.2)',
                background: 'rgba(0,0,0,0.3)',
                color: '#fff',
                fontSize: '1rem',
                outline: 'none',
              }}
            />
            <button
              onClick={mode === 'search' ? handleSearch : handleAsk}
              disabled={loading || !collection}
              style={{
                padding: '14px 28px',
                borderRadius: '12px',
                border: 'none',
                background:
                  loading || !collection
                    ? '#4a5568'
                    : 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                color: '#fff',
                fontSize: '1rem',
                fontWeight: 600,
                cursor: loading || !collection ? 'not-allowed' : 'pointer',
                minWidth: '100px',
              }}
            >
              {loading ? '...' : mode === 'search' ? '🔍' : '送出'}
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 80%, 100% { transform: scale(0.8); opacity: 0.5; }
          40% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}
