import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyWebsocket from '@fastify/websocket';
import fastifyMultipart from '@fastify/multipart';
import { handleWebSocket } from './websocket.js';
import { addDocument, listDocuments, deleteDocument, searchKnowledge } from './knowledge.js';
import { askQuestion, askQuestionStream, analyzeWithClaude } from './claude.js';
import { listMeetings, getMeeting, createMeeting, updateMeeting, deleteMeeting } from './meetings.js';
import { listVocabularies, upsertVocabulary, deleteVocabulary } from './vocabularies.js';

const PORT = parseInt(process.env.PORT || '3001', 10);
const HOST = process.env.HOST || '0.0.0.0';

async function main() {
  const app = Fastify({
    logger: { level: 'info' },
  });

  await app.register(fastifyCors, { origin: true });
  await app.register(fastifyWebsocket);
  await app.register(fastifyMultipart, { limits: { fileSize: 20 * 1024 * 1024 } }); // 20MB

  // Health check
  app.get('/health', async () => {
    return { status: 'ok', timestamp: new Date().toISOString() };
  });

  // WebSocket endpoint
  app.register(async (fastify) => {
    fastify.get('/ws', { websocket: true }, (socket) => {
      handleWebSocket(socket);
    });
  });

  // Knowledge base: upload
  app.post<{ Querystring: { meetingId?: string } }>('/api/knowledge/upload', async (request, reply) => {
    try {
      const meetingId = request.query.meetingId || 'global';
      const data = await request.file();
      if (!data) {
        return reply.status(400).send({ error: 'No file provided' });
      }
      const chunks: Buffer[] = [];
      for await (const chunk of data.file) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const doc = await addDocument(data.filename, buffer, meetingId);
      return reply.send({ success: true, document: doc });
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ error: String(err) });
    }
  });

  // Knowledge base: list
  app.get<{ Querystring: { meetingId?: string } }>('/api/knowledge/list', async (request) => {
    const meetingId = request.query.meetingId || 'global';
    const documents = listDocuments(meetingId);
    return { documents };
  });

  // Knowledge base: delete
  app.delete<{ Params: { id: string }; Querystring: { meetingId?: string } }>('/api/knowledge/:id', async (request, reply) => {
    const { id } = request.params;
    const meetingId = request.query.meetingId || 'global';
    const deleted = deleteDocument(id, meetingId);
    if (!deleted) {
      return reply.status(404).send({ error: 'Document not found' });
    }
    return { success: true };
  });

  // Knowledge base: search (vector search only)
  app.post<{ Body: { query: string; limit?: number; meetingId?: string } }>('/api/knowledge/search', async (request, reply) => {
    const { query, limit = 5, meetingId = 'global' } = request.body || {};
    if (!query) {
      return reply.status(400).send({ error: 'Query is required' });
    }
    try {
      const results = await searchKnowledge(query, limit, meetingId);
      return { query, results };
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ error: String(err) });
    }
  });

  // Knowledge base: ask (RAG with Claude CLI — non-streaming, kept for backwards compat)
  app.post<{ Body: { question: string; limit?: number; meetingId?: string } }>('/api/ask', async (request, reply) => {
    const { question, limit = 5, meetingId = 'global' } = request.body || {};
    if (!question) {
      return reply.status(400).send({ error: 'Question is required' });
    }
    try {
      const result = await askQuestion(question, limit, meetingId);
      return result;
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ error: String(err) });
    }
  });

  // Knowledge base: ask with streaming SSE + optional session resumption
  app.get<{ Querystring: { question?: string; sessionId?: string; limit?: string; meetingId?: string } }>(
    '/api/ask-stream',
    (request, reply) => {
      reply.hijack();
      const res = reply.raw;

      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no', // disable nginx buffering when behind a proxy
      });

      const { question, sessionId, limit, meetingId = 'global' } = request.query;

      if (!question?.trim()) {
        res.write(`event: fail\ndata: ${JSON.stringify({ message: 'Question is required' })}\n\n`);
        res.end();
        return;
      }

      const topK = Math.min(parseInt(limit ?? '5', 10), 10);

      const sendEvent = (event: string, data: unknown) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      };

      askQuestionStream(question.trim(), topK, sessionId || undefined, sendEvent, meetingId)
        .then(() => res.end())
        .catch((err) => {
          app.log.error(err);
          sendEvent('fail', { message: String(err) });
          res.end();
        });
    },
  );

  // Test Coach endpoint (for debugging)
  app.post<{ Body: { transcript: string } }>('/api/test-coach', async (request, reply) => {
    const { transcript } = request.body || {};
    if (!transcript) {
      return reply.status(400).send({ error: 'Transcript is required' });
    }
    try {
      const result = await analyzeWithClaude(transcript);
      return result;
    } catch (err) {
      app.log.error(err);
      return reply.status(500).send({ error: String(err) });
    }
  });

  // Meetings CRUD
  app.get('/api/meetings', async () => {
    return { meetings: listMeetings() };
  });

  app.post<{ Body: { title?: string } }>('/api/meetings', async (request, reply) => {
    const { title } = request.body || {};
    const meeting = createMeeting(title || '');
    return reply.status(201).send({ meeting });
  });

  app.get<{ Params: { id: string } }>('/api/meetings/:id', async (request, reply) => {
    const meeting = getMeeting(request.params.id);
    if (!meeting) return reply.status(404).send({ error: 'Not found' });
    return { meeting };
  });

  app.patch<{ Params: { id: string }; Body: { title?: string; transcript?: string[]; cleanedTranscript?: string; coaching?: unknown } }>(
    '/api/meetings/:id',
    async (request, reply) => {
      const { title, transcript, cleanedTranscript, coaching } = request.body || {};
      const updated = updateMeeting(request.params.id, {
        ...(title !== undefined && { title }),
        ...(transcript !== undefined && { transcript }),
        ...(cleanedTranscript !== undefined && { cleanedTranscript }),
        ...(coaching !== undefined && { coaching: coaching as any }),
      });
      if (!updated) return reply.status(404).send({ error: 'Not found' });
      return { meeting: updated };
    }
  );

  app.delete<{ Params: { id: string } }>('/api/meetings/:id', async (request, reply) => {
    const deleted = deleteMeeting(request.params.id);
    if (!deleted) return reply.status(404).send({ error: 'Not found' });
    return { success: true };
  });

  // Vocabularies CRUD
  app.get('/api/vocabularies', async () => {
    return { vocabularies: listVocabularies() };
  });

  app.post<{ Body: { name: string; key: string; terms: string } }>('/api/vocabularies', async (request, reply) => {
    const { name, key, terms } = request.body || {};
    if (!key || !name) return reply.status(400).send({ error: 'name and key are required' });
    const vocab = upsertVocabulary({ name, key, terms: terms || '' });
    return reply.status(201).send({ vocabulary: vocab });
  });

  app.delete<{ Params: { key: string } }>('/api/vocabularies/:key', async (request, reply) => {
    const deleted = deleteVocabulary(request.params.key);
    if (!deleted) return reply.status(404).send({ error: 'Not found' });
    return { success: true };
  });

  try {
    await app.listen({ port: PORT, host: HOST });
    console.log(`\n🎙️  Meeting Coach Server running at http://localhost:${PORT}`);
    console.log(`🔌 WebSocket endpoint: ws://localhost:${PORT}/ws`);
    console.log(`📚 Knowledge API: http://localhost:${PORT}/api/knowledge\n`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

main();
