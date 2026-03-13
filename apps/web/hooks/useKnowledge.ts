'use client';

import { useState, useCallback, useEffect } from 'react';

export interface KnowledgeDoc {
  id: string;
  filename: string;
  size: number;
  chunks: number;
  uploadedAt: string;
}

// Use relative path so Next.js rewrites proxy to backend
const SERVER = '';

export function useKnowledge(meetingId = 'global') {
  const [docs, setDocs] = useState<KnowledgeDoc[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDocs = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER}/api/knowledge/list?meetingId=${encodeURIComponent(meetingId)}`);
      if (res.ok) {
        const data = await res.json();
        setDocs(data.documents || []);
      }
    } catch {
      // server may not be running yet
    }
  }, [meetingId]);

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
        const res = await fetch(`${SERVER}/api/knowledge/upload?meetingId=${encodeURIComponent(meetingId)}`, {
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
    [meetingId, fetchDocs]
  );

  const remove = useCallback(
    async (id: string) => {
      try {
        await fetch(`${SERVER}/api/knowledge/${id}?meetingId=${encodeURIComponent(meetingId)}`, { method: 'DELETE' });
        setDocs((prev) => prev.filter((d) => d.id !== id));
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Delete failed');
      }
    },
    [meetingId]
  );

  return { docs, uploading, error, upload, remove, refresh: fetchDocs };
}
