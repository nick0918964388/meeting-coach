# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Meeting Coach (會議即時教練系統) — a real-time meeting assistant that captures audio, transcribes speech, searches a knowledge base via RAG, and delivers AI coaching suggestions. Primary UI language is Traditional Chinese.

## Commands

```bash
npm install              # Install all workspace dependencies
npm run dev              # Start both frontend and backend (Turborepo)
npm run dev:web          # Frontend only (Next.js, port 3000)
npm run dev:server       # Backend only (Fastify, port 3001)
npm run build            # Build all packages
npm run lint             # Lint (runs Next.js lint on web app)

# Run server directly without turbo
npx tsx apps/server/src/index.ts

# Docker
docker compose up --build        # Full stack
docker compose up -d             # Background
docker compose logs -f server    # Tail server logs
```

No test framework is configured yet.

## Architecture

Turborepo monorepo with npm workspaces:

- **`apps/web/`** — Next.js 15 (App Router) + React 19 + Tailwind CSS. Port 3000.
- **`apps/server/`** — Fastify 5 backend with WebSocket, REST API, audio processing (ffmpeg), STT (Groq/OpenAI), knowledge base (Ollama vector embeddings), and AI coaching. Port 3001.
- **`packages/shared/`** — Shared TypeScript types for the WebSocket message protocol (client↔server message interfaces).

### Data Flow

```
Browser mic → MediaRecorder (WebM/Opus, 3s chunks)
  → WebSocket binary frames → ffmpeg (→ 16kHz mono WAV)
  → STT provider (Groq/OpenAI/Sherpa-ONNX WASM)
  → Vector search knowledge base (Ollama embeddings)
  → LLM coaching analysis → WebSocket → Frontend UI
```

### Backend Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Fastify server setup, REST routes |
| `src/websocket.ts` | WebSocket handler, real-time audio pipeline |
| `src/knowledge.ts` | Document management, vector embeddings |
| `src/claude.ts` | AI coaching analysis, transcript cleaning |
| `src/ollama.ts` | Ollama LLM integration |
| `src/whisper.ts` | STT provider abstraction |
| `src/meetings.ts` | Meeting CRUD (file-based storage) |

### Frontend Key Patterns

- `hooks/useWebSocket.ts` — WebSocket connection and message handling
- `hooks/useAudioRecorder.ts` — Microphone capture logic
- `hooks/useSherpaOnnx.ts` — Browser-based WASM speech recognition fallback
- `hooks/useMeetings.ts` / `hooks/useKnowledge.ts` — API data hooks
- Mobile-responsive with 3-tab layout (context, transcript, coach)

## Environment Variables

Copy `.env.example` to `.env`. Key variables:

- `WHISPER_PROVIDER` — `groq` (default/fastest), `openai`, or `custom`
- `GROQ_API_KEY` / `OPENAI_API_KEY` — STT provider keys
- `OLLAMA_HOST` — Ollama server URL for embeddings and LLM
- `OLLAMA_MODEL` — Model for coaching analysis

## TypeScript Configuration

- Web: ES2017 target, strict mode, Next.js paths
- Server: ES2022 target, CommonJS output, strict mode
- Both use TypeScript 5.7
