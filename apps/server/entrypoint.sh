#!/bin/bash
set -e

# Pre-approve /app workspace by running Claude once with expect
# This writes the trust state to ~/.claude/
if [ ! -f /home/appuser/.claude/.workspace-trusted ]; then
  echo "[Entrypoint] Pre-approving /app workspace..."
  
  # Use expect to auto-confirm trust dialog
  expect -c '
    set timeout 30
    spawn claude --dangerously-skip-permissions -p "echo hello"
    expect {
      "Enter to confirm" { 
        send "\r"
        exp_continue
      }
      "hello" {
        # Success - Claude responded
      }
      timeout {
        exit 1
      }
      eof
    }
  ' && touch /home/appuser/.claude/.workspace-trusted
  
  echo "[Entrypoint] Workspace pre-approved!"
fi

# Start the main server
exec node dist/index.js
