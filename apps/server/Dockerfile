# ── Stage 1: TypeScript build ──────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

# Install all deps (workspaces hoisted to root node_modules)
RUN npm ci

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/server/ ./apps/server/

# Compile TypeScript → dist/
RUN cd apps/server && npx tsc

# ── Stage 2: Runtime image ─────────────────────────────────────────────────
FROM node:22-slim
WORKDIR /app

# System deps: ffmpeg (audio conversion) + python3 + pip (faster-whisper)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      python3-pip \
    && pip3 install faster-whisper --break-system-packages \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /root/.cache/pip

# Copy compiled output
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./package.json

# Copy runtime node_modules (shared symlink will resolve via packages/ below)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

# Persistent data directories (override with volumes in production)
RUN mkdir -p .knowledge .meetings

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

EXPOSE 3001

CMD ["node", "dist/index.js"]
