/**
 * Ollama API client for meeting-coach server.
 *
 * Env vars:
 *   OLLAMA_HOST  - e.g. http://192.168.1.161:11434  (default: http://localhost:11434)
 *   OLLAMA_MODEL - e.g. qwen3.5:397b-cloud          (default: qwen3:8b)
 */

const OLLAMA_HOST = process.env.OLLAMA_HOST ?? 'http://localhost:11434';
const OLLAMA_MODEL = process.env.OLLAMA_MODEL ?? 'qwen3:8b';

export function getModel(): string {
  return OLLAMA_MODEL;
}

interface OllamaChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface OllamaChatResponse {
  message: OllamaChatMessage;
  done: boolean;
}

/**
 * One-shot chat completion (no streaming).
 */
export async function ollamaChat(
  prompt: string,
  timeoutMs = 90_000,
  system?: string,
): Promise<string> {
  const messages: OllamaChatMessage[] = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content: prompt });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: false }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama HTTP ${res.status}: ${body}`);
    }

    const data = (await res.json()) as OllamaChatResponse;
    return data.message?.content ?? '';
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Streaming chat completion — yields text chunks as they arrive.
 */
export async function* ollamaChatStream(
  prompt: string,
  timeoutMs = 90_000,
  system?: string,
): AsyncGenerator<string, void, unknown> {
  const messages: OllamaChatMessage[] = [];
  if (system) {
    messages.push({ role: 'system', content: system });
  }
  messages.push({ role: 'user', content: prompt });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`${OLLAMA_HOST}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: OLLAMA_MODEL, messages, stream: true }),
      signal: controller.signal,
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`Ollama HTTP ${res.status}: ${body}`);
    }

    if (!res.body) {
      throw new Error('Ollama returned empty response body');
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });

      // Ollama streams newline-delimited JSON
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line) as OllamaChatResponse;
          const chunk = obj.message?.content;
          if (chunk) yield chunk;
          if (obj.done) return;
        } catch {
          // Ignore malformed lines
        }
      }
    }
  } finally {
    clearTimeout(timer);
  }
}
