import type { CoachMessage } from '@meeting-coach/shared';
import { searchKnowledge } from './knowledge.js';
import { sendMessage, sendMessageStream } from './session-manager.js';
import { ollamaChat } from './ollama.js';

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

// 修正文字語意
export async function cleanTranscript(rawText: string): Promise<string> {
  if (!rawText || rawText.trim().length < 10) {
    return rawText;
  }

  try {
    const cleaned = await ollamaChat(CLEAN_TRANSCRIPT_PROMPT(rawText), 20000);
    return cleaned || rawText;
  } catch (err) {
    console.error('[Ollama] Clean transcript error:', err);
    return rawText; // 失敗時返回原文
  }
}

const COACH_PROMPT_TEMPLATE = (transcript: string, context?: string) => `你是一個專業會議教練。${
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

export async function analyzeWithClaude(transcript: string, meetingId = 'global'): Promise<CoachMessage> {
  // Search knowledge base for relevant context
  const relevantChunks = await searchKnowledge(transcript, 4, meetingId);
  const context = relevantChunks.length > 0 ? relevantChunks.join('\n\n') : undefined;
  const prompt = COACH_PROMPT_TEMPLATE(transcript, context);

  try {
    const text = await ollamaChat(prompt, 30000);

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Ollama response');
    }

    const coaching = JSON.parse(jsonMatch[0]);
    return {
      type: 'coach',
      keyPoints: coaching.keyPoints || [],
      suggestions: coaching.suggestions || [],
      warnings: coaching.warnings || [],
      nextSteps: coaching.nextSteps || [],
    };
  } catch (err) {
    console.error('[Ollama] Analyze error:', err);
    throw err;
  }
}

// ===== 對話歷史管理 =====

interface ConversationTurn {
  q: string;
  a: string;
  ts: number;
}

const conversationHistory = new Map<string, ConversationTurn[]>();
const MAX_HISTORY_TURNS = 10;

function getHistory(meetingId: string): ConversationTurn[] {
  return conversationHistory.get(meetingId) ?? [];
}

function addToHistory(meetingId: string, q: string, a: string): void {
  const history = conversationHistory.get(meetingId) ?? [];
  history.push({ q, a, ts: Date.now() });
  if (history.length > MAX_HISTORY_TURNS) {
    history.splice(0, history.length - MAX_HISTORY_TURNS);
  }
  conversationHistory.set(meetingId, history);
}

export function clearConversationHistory(meetingId: string): void {
  conversationHistory.delete(meetingId);
}

// ===== 知識庫問答 =====

const ASK_PROMPT_TEMPLATE = (question: string, context: string, history: ConversationTurn[]) => {
  const historySection = history.length > 0
    ? `\n## 對話歷史（最近 ${history.length} 輪）\n${history.map((t, i) =>
        `[第 ${i + 1} 輪]\n用戶：${t.q}\n助理：${t.a}`
      ).join('\n\n')}\n`
    : '';

  return `你是一個專業的知識助理。根據以下參考文件回答用戶的問題。${historySection}
## 參考文件
${context}

## 用戶問題
${question}

## 回答要求
- 根據參考文件內容回答，不要編造資訊
- 如果文件中沒有相關資訊，請誠實說明
- 回答要簡潔、有條理
- 使用繁體中文回答
- 如有對話歷史，請保持上下文連貫

請回答：`;
};

export interface AskResult {
  answer: string;
  sources: string[];
}

export async function askQuestion(question: string, topK = 5, meetingId = 'global'): Promise<AskResult> {
  const relevantChunks = await searchKnowledge(question, topK, meetingId);

  if (relevantChunks.length === 0) {
    return {
      answer: '抱歉，知識庫中找不到與您問題相關的資料。請先上傳相關文件。',
      sources: [],
    };
  }

  const context = relevantChunks
    .map((chunk, i) => `[文件片段 ${i + 1}]\n${chunk}`)
    .join('\n\n');

  const history = getHistory(meetingId);
  const prompt = ASK_PROMPT_TEMPLATE(question, context, history);

  try {
    const answer = await sendMessage(meetingId, prompt, 60_000);
    addToHistory(meetingId, question, answer);
    return { answer, sources: relevantChunks };
  } catch (err) {
    console.error('[Ollama] Ask question error:', err);
    throw err;
  }
}

// ===== 知識庫問答（Streaming via SSE） =====

type SseEmitter = (event: string, data: unknown) => void;

export async function askQuestionStream(
  question: string,
  topK: number,
  _sessionId: string | undefined,
  onEvent: SseEmitter,
  meetingId = 'global',
): Promise<void> {
  const relevantChunks = await searchKnowledge(question, topK, meetingId);

  if (relevantChunks.length === 0) {
    onEvent('text', { text: '抱歉，知識庫中找不到與您問題相關的資料。請先上傳相關文件。' });
    onEvent('done', { sessionId: null, sources: [] });
    return;
  }

  const context = relevantChunks
    .map((chunk, i) => `[文件片段 ${i + 1}]\n${chunk}`)
    .join('\n\n');

  const history = getHistory(meetingId);
  const prompt = ASK_PROMPT_TEMPLATE(question, context, history);

  let fullAnswer = '';
  try {
    for await (const chunk of sendMessageStream(meetingId, prompt)) {
      fullAnswer += chunk;
      onEvent('text', { text: chunk });
    }
    addToHistory(meetingId, question, fullAnswer);
    onEvent('done', { sessionId: null, sources: relevantChunks });
  } catch (err) {
    console.error('[Ollama] Stream error:', err);
    onEvent('fail', { message: String(err) });
  }
}
