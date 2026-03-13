import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const PREFIX = 'mtg-';
const POLL_MS = 300;
const STABLE_ROUNDS = 10; // 10 × 300ms = 3s stable → Claude done

function sessionName(meetingId: string): string {
  return `${PREFIX}${meetingId.replace(/[^a-z0-9]/gi, '_').slice(0, 25)}`;
}

function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\[[0-9;?]*[a-zA-Z]/g, '')
    .replace(/\x1b\][^\x07]*\x07/g, '')
    .replace(/\r/g, '');
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function tmuxExec(...args: string[]): string {
  try {
    return execFileSync('tmux', args, { encoding: 'utf8' });
  } catch (err: unknown) {
    const error = err as { stdout?: string; stderr?: string };
    throw new Error(`tmux ${args[0]} failed: ${error.stderr ?? String(err)}`);
  }
}

function capturePane(meetingId: string): string {
  try {
    return tmuxExec('capture-pane', '-t', sessionName(meetingId), '-p', '-S', '-10000');
  } catch {
    return '';
  }
}

// Look for the Claude interactive prompt ">" at the bottom of the pane
function isPromptVisible(pane: string): boolean {
  const lines = stripAnsi(pane).split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return false;
  const last = lines[lines.length - 1].trim();
  return last === '>' || last === '> ';
}

export function isSessionActive(meetingId: string): boolean {
  try {
    execFileSync('tmux', ['has-session', '-t', sessionName(meetingId)], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export async function startSession(meetingId: string): Promise<void> {
  if (isSessionActive(meetingId)) return;

  const sName = sessionName(meetingId);
  const env = { ...process.env };
  delete env.CLAUDECODE;
  delete env.CLAUDE_CODE_SESSION_ID;
  delete env.CLAUDE_CODE_ENTRYPOINT;

  execFileSync('tmux', ['new-session', '-d', '-s', sName, '-x', '220', '-y', '50'], { env });
  // Use --permission-mode bypassPermissions to skip the trust dialog
  execFileSync('tmux', ['send-keys', '-t', sName, 'claude --dangerously-skip-permissions --permission-mode bypassPermissions', 'Enter'], { env });

  // Wait for Claude interactive prompt to be ready
  await sleep(4000);
  console.log(`[Session] Started tmux session ${sName} for meeting ${meetingId}`);
}

export async function stopSession(meetingId: string): Promise<void> {
  if (!isSessionActive(meetingId)) return;
  try {
    tmuxExec('kill-session', '-t', sessionName(meetingId));
    console.log(`[Session] Stopped session for meeting ${meetingId}`);
  } catch (err) {
    console.error(`[Session] Failed to stop session for ${meetingId}:`, err);
  }
}

// Send text to the pane via tmux load-buffer + paste-buffer to handle special chars
async function sendToPane(meetingId: string, message: string): Promise<void> {
  const sName = sessionName(meetingId);
  // Claude interactive mode is line-based; flatten newlines to spaces
  const singleLine = message.replace(/\n+/g, ' ').trim();

  const tmpFile = path.join(os.tmpdir(), `claude-msg-${sName}-${Date.now()}.txt`);
  fs.writeFileSync(tmpFile, singleLine, 'utf8');
  try {
    const bufName = `buf-${sName}`;
    execFileSync('tmux', ['load-buffer', '-b', bufName, tmpFile]);
    execFileSync('tmux', ['paste-buffer', '-t', sName, '-b', bufName]);
    execFileSync('tmux', ['send-keys', '-t', sName, '', 'Enter']);
  } finally {
    try {
      fs.unlinkSync(tmpFile);
    } catch {}
  }
}

// Extract Claude's response: lines that appeared after `beforeLineCount` lines,
// skipping the echoed input line and the trailing prompt line.
function extractResponse(beforeLineCount: number, after: string): string {
  const lines = stripAnsi(after).split('\n');
  // New content starts from the last line of "before" (the old prompt got the echoed text appended)
  const newLines = lines.slice(Math.max(0, beforeLineCount - 1));

  // newLines[0] = "> [echoed message]"  →  skip
  // newLines[last] = ">"                →  skip
  const responseLines = newLines.slice(1);

  // Remove trailing prompt and blank lines at the very end
  while (responseLines.length > 0) {
    const tail = responseLines[responseLines.length - 1].trim();
    if (tail === '>' || tail === '') {
      responseLines.pop();
    } else {
      break;
    }
  }

  return responseLines.join('\n').trim();
}

export async function sendMessage(
  meetingId: string,
  message: string,
  timeoutMs = 90_000,
): Promise<string> {
  if (!isSessionActive(meetingId)) {
    await startSession(meetingId);
  }

  const beforeCapture = capturePane(meetingId);
  const beforeLineCount = beforeCapture.split('\n').length;

  await sendToPane(meetingId, message);

  const deadline = Date.now() + timeoutMs;
  let last = capturePane(meetingId);
  let stableCount = 0;

  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const current = capturePane(meetingId);

    if (current === last) {
      stableCount++;
      if (stableCount >= STABLE_ROUNDS && isPromptVisible(current)) {
        return extractResponse(beforeLineCount, current);
      }
    } else {
      stableCount = 0;
      last = current;
    }
  }

  throw new Error(`Claude response timed out for meeting ${meetingId}`);
}

export async function* sendMessageStream(
  meetingId: string,
  message: string,
  timeoutMs = 90_000,
): AsyncGenerator<string, void, unknown> {
  if (!isSessionActive(meetingId)) {
    await startSession(meetingId);
  }

  const beforeCapture = capturePane(meetingId);
  const beforeLineCount = beforeCapture.split('\n').length;

  await sendToPane(meetingId, message);

  const deadline = Date.now() + timeoutMs;
  let last = capturePane(meetingId);
  let stableCount = 0;
  let yieldedLength = 0;

  while (Date.now() < deadline) {
    await sleep(POLL_MS);
    const current = capturePane(meetingId);

    if (current !== last) {
      stableCount = 0;
      last = current;

      const response = extractResponse(beforeLineCount, current);
      if (response.length > yieldedLength) {
        const delta = response.slice(yieldedLength);
        if (delta.trim()) {
          yield delta;
        }
        yieldedLength = response.length;
      }
    } else {
      stableCount++;
      if (stableCount >= STABLE_ROUNDS && isPromptVisible(current)) {
        // Flush any remaining content
        const response = extractResponse(beforeLineCount, current);
        if (response.length > yieldedLength) {
          yield response.slice(yieldedLength);
        }
        break;
      }
    }
  }
}
