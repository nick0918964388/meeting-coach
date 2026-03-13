#!/bin/bash
# Deploy to Thor (192.168.1.161)
# Usage: ./scripts/deploy-thor.sh [commit message]

set -e

cd "$(dirname "$0")/.."

# Default commit message
COMMIT_MSG="${1:-deploy: auto deploy to thor}"

echo "🔄 Checking for changes..."
if git diff --quiet && git diff --staged --quiet; then
    echo "📝 No local changes, pulling latest..."
else
    echo "📦 Committing changes..."
    git add -A
    git commit -m "$COMMIT_MSG"
fi

echo "🚀 Pushing to origin..."
git push origin main

echo "🔧 Deploying to Thor..."
ssh thor "cd ~/meeting-coach && git stash 2>/dev/null || true && git pull && git stash pop 2>/dev/null || true && docker compose up -d --build"

echo "✅ Deployed to Thor!"
echo "🌐 https://meeting-coach.nickai.cc"
