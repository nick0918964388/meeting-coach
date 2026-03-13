#!/usr/bin/env bash
# Deploy to thor
# Usage: ./scripts/deploy-thor.sh ["optional commit message"]
set -euo pipefail

REMOTE_HOST="thor"
REMOTE_DIR="~/meeting-coach"

cd "$(git rev-parse --show-toplevel)"

# ── 1. Commit ────────────────────────────────────────────────────────────────
echo "📦 Staging all changes..."
git add -A

if git diff --cached --quiet; then
  echo "   Nothing new to commit."
else
  MSG="${1:-"chore: deploy $(date '+%Y-%m-%d %H:%M')"}"
  git commit -m "$MSG"
  echo "   ✅ Committed: $MSG"
fi

# ── 2. Push ──────────────────────────────────────────────────────────────────
echo "🚀 Pushing to origin..."
git push

# ── 3. Remote deploy ─────────────────────────────────────────────────────────
echo "🖥️  Deploying on $REMOTE_HOST:$REMOTE_DIR ..."
ssh "$REMOTE_HOST" "
  set -euo pipefail
  cd $REMOTE_DIR
  git pull
  docker compose up -d --build
"

echo ""
echo "✅ Deploy complete → $REMOTE_HOST:$REMOTE_DIR"
