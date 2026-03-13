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

# System deps: ffmpeg (audio conversion) + python3 + pip (faster-whisper)
RUN apt-get update && apt-get install -y --no-install-recommends \
      ffmpeg \
      python3 \
      python3-pip \
      tmux \
    && pip3 install faster-whisper --break-system-packages \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /root/.cache/pip

# Install Claude CLI globally
RUN npm install -g @anthropic-ai/claude-code

# Create non-root user (UID 1000 for compatibility)
ARG UID=1000
ARG GID=1000
RUN (groupadd -g ${GID} appuser 2>/dev/null || true) && \
    (useradd -u ${UID} -g ${GID} -m -s /bin/bash appuser 2>/dev/null || \
     useradd -u ${UID} -m -s /bin/bash appuser 2>/dev/null || true)

# Set working directory
WORKDIR /app

# Copy compiled output
COPY --from=builder /app/apps/server/dist ./dist
COPY --from=builder /app/apps/server/package.json ./package.json

# Copy runtime node_modules (shared symlink will resolve via packages/ below)
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/packages ./packages

# Persistent data directories
RUN mkdir -p .knowledge .meetings && \
    chown -R 1000:1000 /app

# Claude config directory (will be mounted as volume)
RUN mkdir -p /home/appuser/.claude 2>/dev/null || true && \
    chown -R 1000:1000 /home/appuser 2>/dev/null || true

ENV NODE_ENV=production
ENV PORT=3001
ENV HOST=0.0.0.0

# Switch to non-root user (UID 1000)
USER 1000

EXPOSE 3001

CMD ["node", "dist/index.js"]
