import { spawn, execSync } from 'child_process';
import { writeFile, unlink } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { randomUUID } from 'crypto';

const PYTHON_SCRIPT = `
import sys
import json
import tempfile
import os

def transcribe(audio_path: str, language: str = 'zh') -> dict:
    from faster_whisper import WhisperModel

    model = WhisperModel("base", device="cpu", compute_type="int8")

    segments, info = model.transcribe(
        audio_path,
        language=language,
        beam_size=5,
        vad_filter=True,
        vad_parameters=dict(min_silence_duration_ms=500)
    )

    text = " ".join([seg.text.strip() for seg in segments])
    return {"text": text, "language": info.language}

if __name__ == "__main__":
    audio_path = sys.argv[1]
    language = sys.argv[2] if len(sys.argv) > 2 else "zh"
    result = transcribe(audio_path, language)
    print(json.dumps(result, ensure_ascii=False))
`;

let pythonScriptPath: string | null = null;

async function ensurePythonScript(): Promise<string> {
  if (pythonScriptPath) return pythonScriptPath;
  const p = join(tmpdir(), 'whisper_transcribe.py');
  await writeFile(p, PYTHON_SCRIPT);
  pythonScriptPath = p;
  return p;
}

export async function transcribeAudio(
  audioData: Buffer,
  language: string = 'zh'
): Promise<string> {
  const scriptPath = await ensurePythonScript();
  const webmPath = join(tmpdir(), `audio_${randomUUID()}.webm`);
  const wavPath = webmPath.replace('.webm', '.wav');

  try {
    await writeFile(webmPath, audioData);
    // Convert WebM/Opus to 16kHz mono WAV for Whisper
    execSync(`ffmpeg -y -i ${webmPath} -ar 16000 -ac 1 -f wav ${wavPath}`);

    return new Promise((resolve, reject) => {
      const proc = spawn('python3', [scriptPath, wavPath, language]);
      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (d) => (stdout += d.toString()));
      proc.stderr.on('data', (d) => (stderr += d.toString()));

      proc.on('close', (code) => {
        if (code !== 0) {
          reject(new Error(`Whisper failed (code ${code}): ${stderr}`));
          return;
        }
        try {
          const result = JSON.parse(stdout.trim());
          resolve(result.text || '');
        } catch {
          reject(new Error(`Failed to parse whisper output: ${stdout}`));
        }
      });

      proc.on('error', reject);
    });
  } finally {
    unlink(webmPath).catch(() => {});
    unlink(wavPath).catch(() => {});
  }
}
