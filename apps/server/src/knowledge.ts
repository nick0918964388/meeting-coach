import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import mammoth from 'mammoth';
// pdf-parse will be imported dynamically

// Ollama embedding configuration
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const EMBED_MODEL = process.env.EMBED_MODEL || 'nomic-embed-text';

const DATA_DIR = path.join(process.cwd(), '.knowledge');
const INDEX_FILE = path.join(DATA_DIR, 'index.json');

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

// Ollama embedding - 768 dimensions for nomic-embed-text
async function embed(text: string): Promise<number[]> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: EMBED_MODEL,
        prompt: text,
      }),
    });

    if (!res.ok) {
      console.error(`Ollama embedding error: ${res.status}`);
      return fallbackEmbed(text);
    }

    const data = await res.json() as { embedding?: number[] };
    if (!data.embedding || data.embedding.length === 0) {
      console.error('Empty embedding from Ollama');
      return fallbackEmbed(text);
    }

    // L2 normalize
    const vec = data.embedding;
    const mag = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
    if (mag > 0) {
      for (let i = 0; i < vec.length; i++) vec[i] /= mag;
    }
    return vec;
  } catch (err) {
    console.error('Ollama embedding failed:', err);
    return fallbackEmbed(text);
  }
}

// Fallback: simple bag-of-words (768-dim to match nomic-embed)
function fallbackEmbed(text: string, dims = 768): number[] {
  const vec = new Float64Array(dims);
  const words = text.toLowerCase().split(/\W+/).filter((w) => w.length > 1);
  for (const word of words) {
    let h = 5381;
    for (let i = 0; i < word.length; i++) {
      h = ((h << 5) + h + word.charCodeAt(i)) & 0x7fffffff;
    }
    vec[h % dims] += 1;
  }
  const mag = Math.sqrt(Array.from(vec).reduce((s, v) => s + v * v, 0));
  if (mag > 0) for (let i = 0; i < dims; i++) vec[i] /= mag;
  return Array.from(vec);
}

function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot;
}

// Split text into chunks (~400 chars with overlap)
function chunk(text: string, size = 400, overlap = 80): string[] {
  const chunks: string[] = [];
  const sentences = text.split(/(?<=[。！？.!?])\s*/);
  let current = '';
  for (const sentence of sentences) {
    if ((current + sentence).length > size && current.length > 0) {
      chunks.push(current.trim());
      current = current.slice(-overlap) + sentence;
    } else {
      current += sentence;
    }
  }
  if (current.trim()) chunks.push(current.trim());
  if (chunks.length === 0 && text.length > 0) {
    for (let i = 0; i < text.length; i += size - overlap) {
      chunks.push(text.slice(i, i + size));
    }
  }
  return chunks.filter((c) => c.length > 10);
}

// Parse file content (async for docx support)
async function parseContent(filename: string, buffer: Buffer): Promise<string> {
  const ext = path.extname(filename).toLowerCase();
  if (ext === '.txt' || ext === '.md') {
    return buffer.toString('utf-8');
  }
  if (ext === '.docx' || ext === '.doc') {
    try {
      const result = await mammoth.extractRawText({ buffer });
      return result.value || '';
    } catch (err) {
      console.error('Failed to parse docx:', err);
      return '';
    }
  }
  if (ext === '.pdf') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const data = await pdfParse(buffer);
      if (data.text && data.text.trim().length > 0) {
        console.log(`[Knowledge] PDF parsed: ${data.numpages} pages, ${data.text.length} chars`);
        return data.text;
      }
    } catch (err) {
      console.error('[Knowledge] pdf-parse failed:', err);
    }
    // Fallback to raw extraction
    const raw = buffer.toString('latin1');
    const texts: string[] = [];
    const pattern = /\(([^)]{3,200})\)/g;
    let m;
    while ((m = pattern.exec(raw)) !== null) {
      const s = m[1].replace(/\\[()\\]/g, '');
      if (/[a-zA-Z\u4e00-\u9fff]/.test(s)) texts.push(s);
    }
    if (texts.length > 0) return texts.join(' ');
    return '';
  }
  return buffer.toString('utf-8');
}

export async function addDocument(filename: string, buffer: Buffer): Promise<DocRecord> {
  const store = loadStore();
  const id = crypto.randomUUID();
  const content = await parseContent(filename, buffer);
  const chunks = chunk(content);

  console.log(`[Knowledge] Embedding ${chunks.length} chunks with ${EMBED_MODEL}...`);

  // Embed all chunks (parallel with concurrency limit)
  const chunkRecords: ChunkRecord[] = [];
  const batchSize = 5;
  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);
    const vectors = await Promise.all(batch.map((text) => embed(text)));
    for (let j = 0; j < batch.length; j++) {
      chunkRecords.push({
        id: `${id}_${i + j}`,
        docId: id,
        text: batch[j],
        vector: vectors[j],
      });
    }
  }

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
  
  console.log(`[Knowledge] Added ${filename}: ${chunkRecords.length} chunks indexed`);
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

// Async search with Ollama embedding
export async function searchKnowledge(query: string, topK = 5): Promise<string[]> {
  const store = loadStore();
  if (store.chunks.length === 0) return [];

  const qVec = await embed(query);
  const scored = store.chunks.map((c) => ({
    text: c.text,
    score: cosine(qVec, c.vector),
  }));

  scored.sort((a, b) => b.score - a.score);
  return scored
    .slice(0, topK)
    .filter((s) => s.score > 0.1) // Higher threshold for semantic search
    .map((s) => s.text);
}

// Sync version for backward compatibility (uses cached vectors only)
export function searchKnowledgeSync(query: string, topK = 5): string[] {
  const store = loadStore();
  if (store.chunks.length === 0) return [];

  // Use fallback embedding for sync search
  const qVec = fallbackEmbed(query);
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
