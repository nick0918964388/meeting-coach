const WHISPER_API_URL = process.env.WHISPER_API_URL || 'https://whisper.nickai.cc/transcribe';

function mimeTypeToExtension(mimeType: string): string {
  if (mimeType.startsWith('audio/mp4')) return 'mp4';
  if (mimeType.startsWith('audio/ogg')) return 'ogg';
  if (mimeType.startsWith('audio/webm')) return 'webm';
  return 'webm';
}

export async function transcribeAudio(
  audioData: Buffer,
  language: string = 'zh',
  mimeType: string = 'audio/webm'
): Promise<string> {
  const ext = mimeTypeToExtension(mimeType);
  const form = new FormData();
  form.append('file', new Blob([audioData], { type: mimeType }), `audio.${ext}`);
  form.append('language', language);

  const res = await fetch(WHISPER_API_URL, { method: 'POST', body: form });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Whisper API error ${res.status}: ${body}`);
  }

  const data = await res.json() as { text?: string; language?: string; duration?: number };
  return data.text?.trim() ?? '';
}
