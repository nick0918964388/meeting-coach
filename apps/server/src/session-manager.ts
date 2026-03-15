import { ollamaChat, ollamaChatStream } from './ollama.js';

// For compatibility: sessions are stateless with Ollama
export function isSessionActive(_meetingId: string): boolean {
  return true;
}

export async function startSession(_meetingId: string): Promise<void> {
  // No-op — Ollama is stateless
}

export async function stopSession(_meetingId: string): Promise<void> {
  // No-op
}

export async function sendMessage(
  _meetingId: string,
  message: string,
  timeoutMs = 90_000,
): Promise<string> {
  return ollamaChat(message, timeoutMs);
}

export async function* sendMessageStream(
  _meetingId: string,
  message: string,
  timeoutMs = 90_000,
): AsyncGenerator<string, void, unknown> {
  yield* ollamaChatStream(message, timeoutMs);
}
