'use client';

import { useState, useCallback, useEffect } from 'react';

export interface KnowledgeDoc {
  id: string;
  filename: string;
  size: number;
  chunks: number;
  uploadedAt: string;
}

const SERVER = 'http://localhost:3001';

export function useKnowledge() {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER}/api/knowledge/list`);
      if (res.ok) {
        const data = await res.json();
        setDocs(data.documents || []);
      }
    } catch {
      // server may not be running yet
    }
  }, []);

  useEffect(() => {
    fetchDocs();
  }, [fetchDocs]);

  const upload = useCallback(
    async (file: File) => {
      setUploading(true);
      setError(null);
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetch(`${SERVER}/api/knowledge/upload`, {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.message || `Upload failed: ${res.status}`);
        }
        await fetchDocs();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Upload failed');
      } finally {
        setUploading(false);
      }
    },
    [fetchDocs]
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await fetch(`${SERVER}/api/knowledge/${id}`, { method: 'DELETE' });
        setDocs((prev) => prev.filter((d) => d.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Delete failed');
      }
    },
    []
  );

  return { docs, uploading, error, upload, remove, refresh: fetchDocs };
}
