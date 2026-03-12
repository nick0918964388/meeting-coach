# ── Stage 1: Build ─────────────────────────────────────────────────────────
FROM node:22-slim AS builder
WORKDIR /app

# Copy workspace manifests first for layer caching
COPY package*.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN npm ci

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/web/ ./apps/web/

# NEXT_PUBLIC_* vars are baked into the JS bundle at build time.
# Override via --build-arg if your server is not on localhost.
ARG NEXT_PUBLIC_WS_URL=ws://localhost:3001/ws
ENV NEXT_PUBLIC_WS_URL=$NEXT_PUBLIC_WS_URL
ENV NEXT_TELEMETRY_DISABLED=1

RUN cd apps/web && npx next build

# ── Stage 2: Runtime image ─────────────────────────────────────────────────
FROM node:22-slim
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
# Make the next binary available without full path
ENV PATH="/app/node_modules/.bin:${PATH}"

# Only copy what next start needs at runtime
COPY --from=builder /app/node_modules        ./node_modules
COPY --from=builder /app/packages            ./packages
COPY --from=builder /app/package.json        ./package.json
COPY --from=builder /app/apps/web/.next      ./apps/web/.next
COPY --from=builder /app/apps/web/public     ./apps/web/public
COPY --from=builder /app/apps/web/package.json   ./apps/web/package.json
COPY --from=builder /app/apps/web/next.config.ts ./apps/web/next.config.ts

EXPOSE 3000

WORKDIR /app/apps/web
CMD ["next", "start"]
