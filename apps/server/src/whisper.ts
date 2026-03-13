const WHISPER_API_URL = process.env.WHISPER_API_URL || 'https://whisper.nickai.cc/transcribe';

export async function transcribeAudio(
  audioData: Buffer,
  language: string = 'zh'
): Promise<string> {
  const form = new FormData();
  form.append('file', new Blob([audioData], { type: 'audio/webm' }), 'audio.webm');
  form.append('language', language);

  const res = await fetch(WHISPER_API_URL, { method: 'POST', body: form });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Whisper API error ${res.status}: ${body}`);
  }

  const data = await res.json() as { text?: string; language?: string; duration?: number };
  return data.text?.trim() ?? '';
}
