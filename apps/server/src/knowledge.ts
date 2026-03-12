import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

// Simple local vector store without external dependencies
// Uses bag-of-words with cosine similarity for retrieval

const DATA_DIR = path.join(process.cwd(), '.knowledge');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');
const VECTORS_FILE = path.join(DATA_DIR, 'vectors.json');

interface DocRecord {
  id: string;
  filename: string;
  size: number;
  chunks: number;
  uploadedAt: string;
}

interface ChunkRecord {
  id: string;
  docId: string;
  text: string;
  vector: number[];
}

interface KnowledgeStore {
  docs: DocRecord[];
  chunks: ChunkRecord[];
}

// Ensure data dir exists
function ensureDir() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
}

function loadStore(): KnowledgeStore {
  ensureDir();
  if (!fs.existsSync(INDEX_FILE)) return { docs: [], chunks: [] };
  try {
    return JSON.parse(fs.readFileSync(INDEX_FILE, 'utf-8'));
  } catch {
    return { docs: [], chunks: [] };
  }
}

function saveStore(store: KnowledgeStore) {
  ensureDir();
  fs.writeFileSync(INDEX_FILE, JSON.stringify(store, null, 2), 'utf-8');
}

// Simple bag-of-words embedding: 512-dim hash vector
function embed(text: string, dims = 512): number[] {
  const vec = new Float64Array(dims);
  const words = text.toLowerCase().split(/\W+/).filter((w) => w.length > 1);
  for (const word of words) {
    // djb2 hash
    let h = 5381;
    for (let i = 0; i < word.length; i++) {
      h = ((h << 5) + h + word.charCodeAt(i)) & 0x7fffffff;
    }
    // Also add bigrams for better recall
    for (let i = 0; i < word.length - 1; i++) {
      const bigram = word.slice(i, i + 2);
      let bh = 5381;
      for (let j = 0; j < bigram.length; j++) {
        bh = ((bh << 5) + bh + bigram.charCodeAt(j)) & 0x7fffffff;
      }
      vec[bh % dims] += 0.5;
    }
    vec[h % dims] += 1;
  }
  // L2 normalize
  const mag = Math.sqrt(Array.from(vec).reduce((s, v) => s + v * v, 0));
  if (mag > 0) for (let i = 0; i < dims; i++) vec[i] /= mag;
  return Array.from(vec);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot; // vectors are already normalized
}

// Split text into chunks (~400 chars with overlap)
function chunk(text: string, size = 400, overlap = 80): string[] {
  const chunks: string[] = [];
  // Split on sentences first
  const sentences = text.split(/(?<=[。！？.!?])\s*/);
  let current = '';
  for (const sentence of sentences) {
    if ((current + sentence).length > size && current.length > 0) {
      chunks.push(current.trim());
      // Keep last part for overlap
      current = current.slice(-overlap) + sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  // Fallback: if no sentence splits worked, split by char count
  if (chunks.length === 0 && text.length > 0) {
    for (let i = 0; i < text.length; i += size - overlap) {
      chunks.push(text.slice(i, i + size));
    }
  }
  return chunks.filter((c) => c.length > 10);
}

// Parse file content
function parseContent(filename: string, buffer: Buffer): string {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.txt' || ext === '.md') {
    return buffer.toString('utf-8');
  }
  if (ext === '.pdf') {
    // Basic PDF text extraction (find readable text)
    const raw = buffer.toString('latin1');
    const texts: string[] = [];
    const pattern = /\(([^)]{3,200})\)/g;
    let m;
    while ((m = pattern.exec(raw)) !== null) {
      const s = m[1].replace(/\\[()\\]/g, '');
      if (/[a-zA-Z\u4e00-\u9fff]/.test(s)) texts.push(s);
    }
    if (texts.length > 0) return texts.join(' ');
    // Try stream text extraction
    const streamMatch = raw.match(/stream([\s\S]*?)endstream/g);
    if (streamMatch) {
      return streamMatch
        .map((s) => s.replace(/stream|endstream/g, '').replace(/[^\x20-\x7e\u4e00-\u9fff]/g, ' '))
        .join(' ')
        .trim();
    }
    return buffer.toString('utf-8', 0, Math.min(buffer.length, 50000)).replace(/[^\x20-\x7e\u4e00-\u9fff\n]/g, ' ');
  }
  // Default: treat as text
  return buffer.toString('utf-8');
}

export async function addDocument(filename: string, buffer: Buffer): Promise<DocRecord> {
  const store = loadStore();
  const id = crypto.randomUUID();
  const content = parseContent(filename, buffer);
  const chunks = chunk(content);

  const chunkRecords: ChunkRecord[] = chunks.map((text, i) => ({
    id: `${id}_${i}`,
    docId: id,
    text,
    vector: embed(text),
  }));

  const doc: DocRecord = {
    id,
    filename,
    size: buffer.length,
    chunks: chunkRecords.length,
    uploadedAt: new Date().toISOString(),
  };

  store.docs.push(doc);
  store.chunks.push(...chunkRecords);
  saveStore(store);
  return doc;
}

export function listDocuments(): DocRecord[] {
  return loadStore().docs;
}

export function deleteDocument(id: string): boolean {
  const store = loadStore();
  const before = store.docs.length;
  store.docs = store.docs.filter((d) => d.id !== id);
  store.chunks = store.chunks.filter((c) => c.docId !== id);
  if (store.docs.length < before) {
    saveStore(store);
    return true;
  }
  return false;
}

export function searchKnowledge(query: string, topK = 5): string[] {
  const store = loadStore();
  if (store.chunks.length === 0) return [];

  const qVec = embed(query);
  const scored = store.chunks.map((c) => ({
    text: c.text,
    score: cosine(qVec, c.vector),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored
    .slice(0, topK)
    .filter((s) => s.score > 0.05)
    .map((s) => s.text);
}
