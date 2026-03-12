import { spawn } from 'child_process';
import type { CoachMessage } from '@meeting-coach/shared';
import { searchKnowledge } from './knowledge.js';

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
  // Search knowledge base for relevant context
  const relevantChunks = searchKnowledge(transcript, 4);
  const context = relevantChunks.length > 0 ? relevantChunks.join('\n\n') : undefined;
  const prompt = CLAUDE_PROMPT_TEMPLATE(transcript, context);

  return new Promise((resolve, reject) => {
    // Remove CLAUDECODE env vars to allow nested Claude CLI calls
    const env = { ...process.env };
    delete env.CLAUDECODE;
    delete env.CLAUDE_CODE_SESSION_ID;
    delete env.CLAUDE_CODE_ENTRYPOINT;

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
