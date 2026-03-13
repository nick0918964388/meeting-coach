import { spawn } from 'child_process';
import type { CoachMessage } from '@meeting-coach/shared';
import { searchKnowledge, searchKnowledgeSync } from './knowledge.js';

// 文字修正 prompt
const CLEAN_TRANSCRIPT_PROMPT = (rawText: string) => `你是專業的語音轉文字後處理專家。

以下是語音轉文字的原始輸出，可能有斷句不完整、重複字詞、語意不通順的問題：

---
${rawText}
---

請修正上述文字：
1. 修正斷句，讓句子完整通順
2. 移除重複或無意義的字詞
3. 保持原意，不要添加新內容
4. 使用適當的標點符號

只輸出修正後的文字，不要任何說明或格式標記。`;

// 通用 Claude CLI 調用函數
async function callClaude(prompt: string, timeoutMs = 30000): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_SESSION_ID;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    // 非 root 用戶可以使用 --dangerously-skip-permissions
    const proc = spawn('claude', ['-p', '--dangerously-skip-permissions'], { env });

    let stdout = '';
    let stderr = '';

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Claude CLI failed (code ${code}): ${stderr}`));
        return;
      }
      resolve(stdout.trim());
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });

    setTimeout(() => {
      proc.kill();
      reject(new Error('Claude CLI timed out'));
    }, timeoutMs);
  });
}

// 修正文字語意
export async function cleanTranscript(rawText: string): Promise<string> {
  if (!rawText || rawText.trim().length < 10) {
    return rawText;
  }
  
  try {
    const cleaned = await callClaude(CLEAN_TRANSCRIPT_PROMPT(rawText), 20000);
    return cleaned || rawText;
  } catch (err) {
    console.error('[Claude] Clean transcript error:', err);
    return rawText; // 失敗時返回原文
  }
}

const CLAUDE_PROMPT_TEMPLATE = (transcript: string, context?: string) => `你是一個專業會議教練。${
  context
    ? `\n\n以下是相關背景知識供你參考：\n\n---\n${context}\n---\n`
    : ''
}

以下是會議逐字稿片段：

---
${transcript}
---

請分析上述內容，以 JSON 格式提供即時教練建議：

{
  "keyPoints": ["重點摘要（2-3條）"],
  "suggestions": ["具體建議（2-3條）"],
  "warnings": ["需要注意的問題（0-2條，如有）"],
  "nextSteps": ["建議的下一步行動（1-2條）"]
}

只輸出 JSON，不要其他說明。`;

export async function analyzeWithClaude(transcript: string): Promise<CoachMessage> {
  // Search knowledge base for relevant context (async with Ollama embedding)
  const relevantChunks = await searchKnowledge(transcript, 4);
  const context = relevantChunks.length > 0 ? relevantChunks.join('\n\n') : undefined;
  const prompt = CLAUDE_PROMPT_TEMPLATE(transcript, context);

  return new Promise((resolve, reject) => {
    // Remove CLAUDECODE env vars to allow nested Claude CLI calls
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_SESSION_ID;
    delete env.CLAUDE_CODE_ENTRYPOINT;

    // 非 root 用戶可以直接使用 claude CLI
    const proc = spawn('claude', [
      '-p',
      '--dangerously-skip-permissions',
      '--output-format', 'json'
    ], { env });

    let stdout = '';
    let stderr = '';

    proc.stdin.write(prompt);
    proc.stdin.end();

    proc.stdout.on('data', (d) => (stdout += d.toString()));
    proc.stderr.on('data', (d) => (stderr += d.toString()));

    proc.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(`Claude CLI failed (code ${code}): ${stderr}`));
        return;
      }

      try {
        // Parse the Claude JSON output format
        const output = JSON.parse(stdout.trim());
        // Claude --output-format json wraps in a result field
        const text = output.result || output.content || stdout;

        // Extract JSON from the text response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          throw new Error('No JSON found in Claude response');
        }

        const coaching = JSON.parse(jsonMatch[0]);
        resolve({
          type: 'coach',
          keyPoints: coaching.keyPoints || [],
          suggestions: coaching.suggestions || [],
          warnings: coaching.warnings || [],
          nextSteps: coaching.nextSteps || [],
        });
      } catch (err) {
        // Try parsing stdout directly as JSON
        try {
          const jsonMatch = stdout.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const coaching = JSON.parse(jsonMatch[0]);
            resolve({
              type: 'coach',
              keyPoints: coaching.keyPoints || [],
              suggestions: coaching.suggestions || [],
              warnings: coaching.warnings || [],
              nextSteps: coaching.nextSteps || [],
            });
            return;
          }
        } catch {}
        reject(new Error(`Failed to parse Claude output: ${err}`));
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to spawn Claude CLI: ${err.message}`));
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      proc.kill();
      reject(new Error('Claude CLI timed out'));
    }, 30000);
  });
}

// ===== 知識庫問答 =====

const ASK_PROMPT_TEMPLATE = (question: string, context: string) => `你是一個專業的知識助理。根據以下參考文件回答用戶的問題。

## 參考文件
${context}

## 用戶問題
${question}

## 回答要求
- 根據參考文件內容回答，不要編造資訊
- 如果文件中沒有相關資訊，請誠實說明
- 回答要簡潔、有條理
- 使用繁體中文回答

請回答：`;

export interface AskResult {
  answer: string;
  sources: string[];
}

export async function askQuestion(question: string, topK = 5): Promise<AskResult> {
  const relevantChunks = await searchKnowledge(question, topK);

  if (relevantChunks.length === 0) {
    return {
      answer: '抱歉，知識庫中找不到與您問題相關的資料。請先上傳相關文件。',
      sources: [],
    };
  }

  const context = relevantChunks
    .map((chunk, i) => `[文件片段 ${i + 1}]\n${chunk}`)
    .join('\n\n');

  const prompt = ASK_PROMPT_TEMPLATE(question, context);

  try {
    const answer = await callClaude(prompt, 60000);
    return { answer, sources: relevantChunks };
  } catch (err) {
    console.error('[Claude] Ask question error:', err);
    throw err;
  }
}

// ===== 知識庫問答（Streaming via SSE） =====

type SseEmitter = (event: string, data: unknown) => void;

export async function askQuestionStream(
  question: string,
  topK: number,
  sessionId: string | undefined,
  onEvent: SseEmitter,
): Promise<void> {
  const relevantChunks = await searchKnowledge(question, topK);

  if (relevantChunks.length === 0) {
    onEvent('text', { text: '抱歉，知識庫中找不到與您問題相關的資料。請先上傳相關文件。' });
    onEvent('done', { sessionId: null, sources: [] });
    return;
  }

  const context = relevantChunks
    .map((chunk, i) => `[文件片段 ${i + 1}]\n${chunk}`)
    .join('\n\n');

  const prompt = ASK_PROMPT_TEMPLATE(question, context);

  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  const args = [
    '-p', '--dangerously-skip-permissions',
    '--verbose',  // Required for stream-json with -p flag
    '--output-format', 'stream-json',
    // Resume existing session so Claude remembers previous turns
    ...(sessionId ? ['--resume', sessionId] : []),
  ];

  const proc = spawn('claude', args, { env });
  proc.stdin.write(prompt);
  proc.stdin.end();

  let buffer = '';
  let lastSentLength = 0;
  let finalSessionId: string | null = sessionId ?? null;
  let doneSent = false;

  proc.stdout.on('data', (chunk: Buffer) => {
    buffer += chunk.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() ?? '';

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        const evt = JSON.parse(trimmed) as Record<string, unknown>;

        // Capture session ID from any event that carries it
        if (typeof evt.session_id === 'string') {
          finalSessionId = evt.session_id;
        }

        // Stream text deltas from assistant messages
        if (evt.type === 'assistant' && evt.message) {
          const msg = evt.message as { content?: Array<{ type: string; text?: string }> };
          const fullText = (msg.content ?? [])
            .filter((b) => b.type === 'text')
            .map((b) => b.text ?? '')
            .join('');

          if (fullText.length > lastSentLength) {
            onEvent('text', { text: fullText.slice(lastSentLength) });
            lastSentLength = fullText.length;
          }
        }

        // Final result event — send 'done'
        if (evt.type === 'result') {
          // Fallback: if no text was streamed, use the result field
          if (lastSentLength === 0 && typeof evt.result === 'string' && evt.result) {
            onEvent('text', { text: evt.result });
          }
          onEvent('done', { sessionId: finalSessionId, sources: relevantChunks });
          doneSent = true;
        }
      } catch {
        // Non-JSON line, skip
      }
    }
  });

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      proc.kill();
      reject(new Error('Claude CLI timed out'));
    }, 120_000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        reject(new Error(`Claude CLI exited with code ${code}`));
        return;
      }
      // Guard: send 'done' if the result event never arrived
      if (!doneSent) {
        onEvent('done', { sessionId: finalSessionId, sources: relevantChunks });
      }
      resolve();
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}
