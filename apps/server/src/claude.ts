import type { CoachMessage } from '@meeting-coach/shared';
import { searchKnowledge } from './knowledge.js';
import { sendMessage, sendMessageStream } from './session-manager.js';
import { ollamaChat } from './ollama.js';

// 主題詞彙表 — 根據會議主題注入專業術語提示
const TOPIC_VOCABULARIES: Record<string, string> = {
  'supply-chain': `庫存管理、供應鏈、採購、進貨、出貨、物流、倉儲、WMS、ERP、MRP、BOM、SKU、MOQ、lead time、safety stock、reorder point、backorder、fulfillment、3PL、vendor、supplier、procurement、inventory turnover、stockout、overstock、demand forecasting、JIT（Just In Time）、EOQ`,
  'software': `API、deploy、server、database、Kubernetes、Docker、CI/CD、Git、GitHub、PR（Pull Request）、code review、sprint、backlog、Jira、Scrum、microservice、frontend、backend、DevOps、cloud、AWS、GCP、Azure、latency、throughput、scalability、refactor、bug、hotfix、release、staging、production`,
  'sales': `業績、營收、毛利、客戶、報價、訂單、合約、CRM、pipeline、lead、conversion、quota、forecast、ARR、MRR、churn、upsell、cross-sell、POC、RFP、SLA、onboarding`,
  'finance': `財報、損益表、資產負債表、現金流、EBITDA、ROI、ROE、毛利率、淨利率、應收帳款、應付帳款、折舊、攤提、稅務、audit、compliance、budget、forecast、variance、capex、opex`,
  'hr': `人資、招聘、面試、onboarding、KPI、OKR、績效考核、薪資、福利、培訓、離職率、headcount、JD（Job Description）、offer、probation、retention`,
  'general': '',
};

// 逐句快速修正 prompt（精簡版，追求速度）
const QUICK_FIX_PROMPT = (text: string, topic: string, context: string) => {
  const vocab = TOPIC_VOCABULARIES[topic] || '';
  const vocabHint = vocab
    ? `\n此會議主題相關的專業術語：${vocab}\n請優先使用這些術語來修正辨識錯誤。`
    : '';

  return `修正以下語音辨識文字。只修正明顯錯誤，保持原意，輸出繁體中文，英文術語保持英文。${vocabHint}
${context ? `\n前文：「${context}」` : ''}
原文：「${text}」
修正：`;
};

// 全文修正 prompt（完整版）
const CLEAN_TRANSCRIPT_PROMPT = (rawText: string, topic: string) => {
  const vocab = TOPIC_VOCABULARIES[topic] || '';
  const vocabHint = vocab
    ? `\n此會議主題相關的專業術語供你參考：\n${vocab}\n`
    : '';

  return `你是專業的語音轉文字後處理專家，擅長處理繁體中文與英文夾雜的會議逐字稿。${vocabHint}

以下是語音辨識的原始輸出：

---
${rawText}
---

請修正上述文字：
1. 修正中英夾雜的辨識錯誤：根據上下文和主題術語判斷正確的詞
2. 修正英文專有名詞和縮寫的大小寫拼寫
3. 修正斷句，讓句子完整通順
4. 移除重複或無意義的字詞
5. 保持原意，不要添加新內容
6. 中文部分使用繁體中文，英文部分保持英文
7. 使用適當的標點符號

只輸出修正後的文字，不要任何說明或格式標記。`;
};

export const AVAILABLE_TOPICS = Object.keys(TOPIC_VOCABULARIES);

// 逐句快速修正（用於 Option A 即時修正）
export async function quickFixTranscript(
  text: string,
  topic: string,
  recentContext: string
): Promise<string> {
  if (!text || text.trim().length < 2) return text;

  try {
    const fixed = await ollamaChat(QUICK_FIX_PROMPT(text, topic, recentContext), 8000);
    // 如果 LLM 回傳太長或明顯不對，fallback 到原文
    if (!fixed || fixed.length > text.length * 3) return text;
    return fixed.trim();
  } catch {
    return text; // 失敗時返回原文，不阻塞
  }
}

// 修正文字語意
export async function cleanTranscript(rawText: string, topic = 'general'): Promise<string> {
  if (!rawText || rawText.trim().length < 10) {
    return rawText;
  }

  try {
    const cleaned = await ollamaChat(CLEAN_TRANSCRIPT_PROMPT(rawText, topic), 20000);
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
