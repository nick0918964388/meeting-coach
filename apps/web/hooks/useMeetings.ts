'use client';

import { useState, useCallback, useEffect } from 'react';

export interface Meeting {
  id: string;
  title: string;
  date: string;
  createdAt: string;
  transcript: string[];
  coaching: unknown | null;
}

// Use relative path so Next.js rewrites proxy to backend
const SERVER = '';

export function useMeetings() {
  const [meetings, setMeetings] = useState<Meeting[]>([]);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchMeetings = useCallback(async () => {
    try {
      const res = await fetch(`${SERVER}/api/meetings`);
      if (res.ok) {
        const data = await res.json();
        setMeetings(data.meetings || []);
      }
    } catch {
      // server may not be running
    }
  }, []);

  useEffect(() => {
    fetchMeetings();
  }, [fetchMeetings]);

  const activeMeeting = meetings.find((m) => m.id === activeMeetingId) ?? null;

  const createMeeting = useCallback(
    async (title: string) => {
      setLoading(true);
      try {
        const res = await fetch(`${SERVER}/api/meetings`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title }),
        });
        if (res.ok) {
          const data = await res.json();
          const m: Meeting = data.meeting;
          setMeetings((prev) => [m, ...prev]);
          setActiveMeetingId(m.id);
          return m;
        }
      } catch {
        // ignore
      } finally {
        setLoading(false);
      }
      return null;
    },
    []
  );

  const saveMeeting = useCallback(
    async (id: string, updates: { transcript?: string[]; coaching?: unknown }) => {
      try {
        await fetch(`${SERVER}/api/meetings/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
        });
        setMeetings((prev) =>
          prev.map((m) => (m.id === id ? { ...m, ...updates } : m))
        );
      } catch {
        // ignore
      }
    },
    []
  );

  const removeMeeting = useCallback(
    async (id: string) => {
      try {
        await fetch(`${SERVER}/api/meetings/${id}`, { method: 'DELETE' });
        setMeetings((prev) => prev.filter((m) => m.id !== id));
        if (activeMeetingId === id) setActiveMeetingId(null);
      } catch {
        // ignore
      }
    },
    [activeMeetingId]
  );

  return {
    meetings,
    activeMeeting,
    activeMeetingId,
    setActiveMeetingId,
    createMeeting,
    saveMeeting,
    removeMeeting,
    loading,
  };
}
