'use client';

import { useState, useCallback, useEffect } from 'react';

export interface Vocabulary {
  id: string;
  name: string;
  key: string;
  terms: string;
}

const SERVER = '';

export function useVocabularies() {
  const [vocabularies, setVocabularies] = useState<Vocabulary[]>([]);

  const fetchVocabularies = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER}/api/vocabularies`);
      if (res.ok) {
        const data = await res.json();
        setVocabularies(data.vocabularies || []);
      }
    } catch { /* ignore */ }
  }, []);

  useEffect(() => { fetchVocabularies(); }, [fetchVocabularies]);

  const saveVocabulary = useCallback(async (name: string, key: string, terms: string) => {
    try {
      const res = await fetch(`${SERVER}/api/vocabularies`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, key, terms }),
      });
      if (res.ok) {
        await fetchVocabularies();
        return true;
      }
    } catch { /* ignore */ }
    return false;
  }, [fetchVocabularies]);

  const removeVocabulary = useCallback(async (key: string) => {
    try {
      await fetch(`${SERVER}/api/vocabularies/${key}`, { method: 'DELETE' });
      await fetchVocabularies();
    } catch { /* ignore */ }
  }, [fetchVocabularies]);

  return { vocabularies, saveVocabulary, removeVocabulary };
}
