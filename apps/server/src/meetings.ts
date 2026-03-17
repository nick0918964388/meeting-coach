import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { startSession, stopSession } from './session-manager.js';

const DATA_DIR = path.join(process.cwd(), '.meetings');
const FILE = path.join(DATA_DIR, 'meetings.json');

export interface Meeting {
  id: string;
  title: string;
  date: string;
  createdAt: string;
  transcript: string[];
  cleanedTranscript: string;
  coaching: {
    keyPoints: string[];
    suggestions: string[];
    warnings: string[];
    nextSteps: string[];
  } | null;
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load(): Meeting[] {
  ensureDir();
  if (!fs.existsSync(FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function save(meetings: Meeting[]) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(meetings, null, 2), 'utf-8');
}

export function listMeetings(): Meeting[] {
  return load().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getMeeting(id: string): Meeting | null {
  return load().find((m) => m.id === id) ?? null;
}

export function createMeeting(title: string): Meeting {
  const meetings = load();
  const meeting: Meeting = {
    id: crypto.randomUUID(),
    title: title || `會議 ${new Date().toLocaleDateString('zh-TW')}`,
    date: new Date().toISOString().slice(0, 10),
    createdAt: new Date().toISOString(),
    transcript: [],
    cleanedTranscript: '',
    coaching: null,
  };
  meetings.push(meeting);
  save(meetings);
  // Start persistent Claude session for this meeting (non-blocking)
  startSession(meeting.id).catch((err) =>
    console.error(`[Meeting] Failed to start session for ${meeting.id}:`, err),
  );
  return meeting;
}

export function updateMeeting(id: string, updates: Partial<Pick<Meeting, 'title' | 'transcript' | 'cleanedTranscript' | 'coaching'>>): Meeting | null {
  const meetings = load();
  const idx = meetings.findIndex((m) => m.id === id);
  if (idx === -1) return null;
  meetings[idx] = { ...meetings[idx], ...updates };
  save(meetings);
  return meetings[idx];
}

export function deleteMeeting(id: string): boolean {
  const meetings = load();
  const next = meetings.filter((m) => m.id !== id);
  if (next.length === meetings.length) return false;
  save(next);
  // Stop tmux session and clean up knowledge base directory (non-blocking)
  stopSession(id).catch((err) =>
    console.error(`[Meeting] Failed to stop session for ${id}:`, err),
  );
  const knowledgeDir = path.join(process.cwd(), '.knowledge', id);
  if (fs.existsSync(knowledgeDir)) {
    fs.rmSync(knowledgeDir, { recursive: true, force: true });
    console.log(`[Meeting] Deleted knowledge dir for ${id}`);
  }
  return true;
}
