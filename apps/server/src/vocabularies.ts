import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.join(process.cwd(), '.vocabularies');
const FILE = path.join(DATA_DIR, 'custom.json');

export interface VocabularyEntry {
  id: string;
  name: string;       // display name, e.g. "庫存/供應鏈"
  key: string;        // topic key, e.g. "supply-chain"
  terms: string;      // comma-separated terms
}

function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function load(): VocabularyEntry[] {
  ensureDir();
  if (!fs.existsSync(FILE)) return [];
  try {
    return JSON.parse(fs.readFileSync(FILE, 'utf-8'));
  } catch {
    return [];
  }
}

function save(entries: VocabularyEntry[]) {
  ensureDir();
  fs.writeFileSync(FILE, JSON.stringify(entries, null, 2), 'utf-8');
}

export function listVocabularies(): VocabularyEntry[] {
  return load();
}

export function getVocabulary(key: string): VocabularyEntry | null {
  return load().find((v) => v.key === key) ?? null;
}

export function upsertVocabulary(entry: Omit<VocabularyEntry, 'id'> & { id?: string }): VocabularyEntry {
  const entries = load();
  const existing = entries.findIndex((v) => v.key === entry.key);
  const saved: VocabularyEntry = {
    id: entry.id || crypto.randomUUID(),
    name: entry.name,
    key: entry.key,
    terms: entry.terms,
  };
  if (existing >= 0) {
    entries[existing] = saved;
  } else {
    entries.push(saved);
  }
  save(entries);
  return saved;
}

export function deleteVocabulary(key: string): boolean {
  const entries = load();
  const next = entries.filter((v) => v.key !== key);
  if (next.length === entries.length) return false;
  save(next);
  return true;
}

// Get custom terms as string for a given topic key
export function getCustomTerms(key: string): string {
  const entry = getVocabulary(key);
  return entry?.terms || '';
}
