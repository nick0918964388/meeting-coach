import { spawn } from 'child_process';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Use -p (print) mode to avoid trust dialog issues
// Each call spawns a new Claude process
async function callClaudePrint(prompt: string, timeoutMs = 90000): Promise<string> {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_SESSION_ID;
    delete env.CLAUDE_CODE_ENTRYPOINT;

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

// For compatibility: sessions are no longer needed
export function isSessionActive(_meetingId: string): boolean {
  return true; // Always "active" in -p mode
}

export async function startSession(_meetingId: string): Promise<void> {
  // No-op in -p mode
  console.log(`[Session] Using -p mode for meeting (no persistent session)`);
}

export async function stopSession(_meetingId: string): Promise<void> {
  // No-op in -p mode
}

export async function sendMessage(
  _meetingId: string,
  message: string,
  timeoutMs = 90_000,
): Promise<string> {
  return callClaudePrint(message, timeoutMs);
}

export async function* sendMessageStream(
  _meetingId: string,
  message: string,
  timeoutMs = 90_000,
): AsyncGenerator<string, void, unknown> {
  // For streaming, we'll use a polling approach with -p mode
  // Since -p doesn't stream, we simulate by yielding the full response
  const response = await callClaudePrint(message, timeoutMs);
  
  // Yield in chunks to simulate streaming
  const chunkSize = 100;
  for (let i = 0; i < response.length; i += chunkSize) {
    yield response.slice(i, i + chunkSize);
    await sleep(50); // Small delay between chunks
  }
}
