// Support multiple Whisper providers: Groq (fast), OpenAI, self-hosted
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY || '';

// Default to Groq (fastest), fallback to OpenAI
const WHISPER_PROVIDER = process.env.WHISPER_PROVIDER || 'groq';

const PROVIDERS = {
  groq: {
    url: 'https://api.groq.com/openai/v1/audio/transcriptions',
    model: 'whisper-large-v3-turbo', // fastest, or use 'whisper-large-v3' for accuracy
    apiKey: GROQ_API_KEY,
  },
  openai: {
    url: 'https://api.openai.com/v1/audio/transcriptions',
    model: 'whisper-1',
    apiKey: OPENAI_API_KEY,
  },
  custom: {
    url: process.env.WHISPER_API_URL || '',
    model: process.env.WHISPER_MODEL || 'whisper-1',
    apiKey: process.env.WHISPER_API_KEY || '',
  },
};

function mimeTypeToExtension(mimeType: string): string {
  if (mimeType.startsWith('audio/mp4')) return 'mp4';
  if (mimeType.startsWith('audio/ogg')) return 'ogg';
  if (mimeType.startsWith('audio/webm')) return 'webm';
  if (mimeType.startsWith('audio/wav')) return 'wav';
  if (mimeType.startsWith('audio/mpeg')) return 'mp3';
  return 'webm';
}

export async function transcribeAudio(
  audioData: Buffer,
  language: string = 'zh',
  mimeType: string = 'audio/webm',
  promptHint: string = ''
): Promise<string> {
  const provider = PROVIDERS[WHISPER_PROVIDER as keyof typeof PROVIDERS] || PROVIDERS.groq;
  
  if (!provider.apiKey) {
    throw new Error(`Missing API key for Whisper provider: ${WHISPER_PROVIDER}`);
  }

  const ext = mimeTypeToExtension(mimeType);
  const form = new FormData();
  form.append('file', new Blob([audioData], { type: mimeType }), `audio.${ext}`);
  form.append('model', provider.model);
  // Don't set language — let Whisper auto-detect between zh/en
  // Use prompt to guide language and provide continuity context
  const basePrompt = '這是一段中英文混合的會議錄音。This meeting may contain both Chinese and English.';
  const prompt = promptHint
    ? `${basePrompt} ${promptHint.slice(-200)}`
    : basePrompt;
  form.append('prompt', prompt);

  console.log(`[Whisper] Using ${WHISPER_PROVIDER} provider, model: ${provider.model}`);

  const res = await fetch(provider.url, {
    method: 'POST',
    body: form,
    headers: {
      'Authorization': `Bearer ${provider.apiKey}`,
    },
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Whisper API error ${res.status}: ${body}`);
  }

  const data = await res.json() as { text?: string; language?: string; duration?: number };
  const text = data.text?.trim() ?? '';
  // Filter common Whisper hallucinations (silence artifacts)
  const HALLUCINATIONS = [
    /^(thank you|thanks|bye|goodbye|you|okay|ok|hmm+|uh+|um+|ah+|oh+)\.?$/i,
    /^(字幕|翻譯|訂閱|請訂閱|謝謝|再見|字幕由|翻譯由).*$/,
    /^\s*\[.*\]\s*$/, // [Music], [Applause], etc.
  ];
  if (HALLUCINATIONS.some((re) => re.test(text))) {
    console.log(`[Whisper] Filtered hallucination: "${text}"`);
    return '';
  }
  return text;
}
