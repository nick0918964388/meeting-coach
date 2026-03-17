'use client';

import { useState } from 'react';
import { useVocabularies, type Vocabulary } from '@/hooks/useVocabularies';

// Built-in topics that can be extended
const BUILTIN_TOPICS = [
  { key: 'supply-chain', name: '庫存/供應鏈' },
  { key: 'software', name: '軟體開發/IT' },
  { key: 'sales', name: '業務/銷售' },
  { key: 'finance', name: '財務/會計' },
  { key: 'hr', name: '人資/管理' },
];

interface Props {
  onClose: () => void;
}

export function VocabularyManager({ onClose }: Props) {
  const { vocabularies, saveVocabulary, removeVocabulary } = useVocabularies();
  const [editKey, setEditKey] = useState<string | null>(null);
  const [editTerms, setEditTerms] = useState('');
  const [newName, setNewName] = useState('');
  const [newKey, setNewKey] = useState('');
  const [newTerms, setNewTerms] = useState('');
  const [saving, setSaving] = useState(false);

  const allTopics = [
    ...BUILTIN_TOPICS.map((b) => ({
      ...b,
      custom: vocabularies.find((v) => v.key === b.key),
      isBuiltin: true,
    })),
    ...vocabularies
      .filter((v) => !BUILTIN_TOPICS.find((b) => b.key === v.key))
      .map((v) => ({ key: v.key, name: v.name, custom: v, isBuiltin: false })),
  ];

  const handleEdit = (topic: { key: string; custom?: Vocabulary }) => {
    setEditKey(topic.key);
    setEditTerms(topic.custom?.terms || '');
  };

  const handleSave = async (key: string, name: string) => {
    setSaving(true);
    await saveVocabulary(name, key, editTerms);
    setEditKey(null);
    setSaving(false);
  };

  const handleAddNew = async () => {
    if (!newName.trim() || !newKey.trim()) return;
    setSaving(true);
    await saveVocabulary(newName.trim(), newKey.trim().toLowerCase().replace(/\s+/g, '-'), newTerms);
    setNewName('');
    setNewKey('');
    setNewTerms('');
    setSaving(false);
  };

  return (
    <div style={{
      background: '#fff',
      border: '1px solid #d8d8d0',
      borderRadius: '8px',
      padding: '12px',
      fontSize: '12px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
        <span style={{ fontWeight: 700, color: '#333' }}>詞彙管理</span>
        <button onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer', color: '#999', fontSize: '14px' }}>✕</button>
      </div>

      {allTopics.map((topic) => (
        <div key={topic.key} style={{ marginBottom: '8px', padding: '8px', background: '#f8f8f5', borderRadius: '4px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
            <span style={{ fontWeight: 600, color: '#444' }}>
              {topic.name}
              {topic.isBuiltin && <span style={{ fontSize: '9px', color: '#999', marginLeft: '4px' }}>(內建)</span>}
            </span>
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                onClick={() => handleEdit(topic)}
                style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', border: '1px solid #ccc', background: '#fff', cursor: 'pointer', color: '#555' }}
              >
                {editKey === topic.key ? '取消' : '編輯'}
              </button>
              {!topic.isBuiltin && (
                <button
                  onClick={() => { if (confirm(`刪除「${topic.name}」？`)) removeVocabulary(topic.key); }}
                  style={{ fontSize: '10px', padding: '1px 6px', borderRadius: '3px', border: '1px solid #fca5a5', background: '#fef2f2', cursor: 'pointer', color: '#dc2626' }}
                >
                  刪除
                </button>
              )}
            </div>
          </div>
          {topic.custom?.terms && editKey !== topic.key && (
            <div style={{ fontSize: '11px', color: '#888', lineHeight: 1.4 }}>
              {topic.custom.terms.length > 100 ? topic.custom.terms.slice(0, 100) + '...' : topic.custom.terms}
            </div>
          )}
          {editKey === topic.key && (
            <div style={{ marginTop: '4px' }}>
              <textarea
                value={editTerms}
                onChange={(e) => setEditTerms(e.target.value)}
                placeholder="輸入專有名詞，用逗號分隔（如：MOQ、lead time、安全庫存）"
                style={{ width: '100%', minHeight: '60px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '11px', resize: 'vertical', boxSizing: 'border-box' }}
              />
              <button
                onClick={() => handleSave(topic.key, topic.name)}
                disabled={saving}
                style={{ marginTop: '4px', fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: 'none', background: '#22c55e', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
              >
                {saving ? '儲存中...' : '儲存'}
              </button>
            </div>
          )}
        </div>
      ))}

      {/* Add new topic */}
      <div style={{ marginTop: '10px', padding: '8px', background: '#f0f9ff', borderRadius: '4px', border: '1px dashed #93c5fd' }}>
        <div style={{ fontWeight: 600, color: '#2563eb', marginBottom: '6px', fontSize: '11px' }}>+ 新增主題</div>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '4px' }}>
          <input
            value={newName}
            onChange={(e) => { setNewName(e.target.value); setNewKey(e.target.value.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]/g, '-')); }}
            placeholder="主題名稱"
            style={{ flex: 1, padding: '4px 6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '11px' }}
          />
        </div>
        <textarea
          value={newTerms}
          onChange={(e) => setNewTerms(e.target.value)}
          placeholder="專有名詞（逗號分隔）"
          style={{ width: '100%', minHeight: '40px', padding: '6px', borderRadius: '4px', border: '1px solid #ccc', fontSize: '11px', resize: 'vertical', boxSizing: 'border-box' }}
        />
        <button
          onClick={handleAddNew}
          disabled={saving || !newName.trim()}
          style={{ marginTop: '4px', fontSize: '11px', padding: '3px 10px', borderRadius: '4px', border: 'none', background: '#3b82f6', color: '#fff', cursor: 'pointer', fontWeight: 600 }}
        >
          建立
        </button>
      </div>
    </div>
  );
}
