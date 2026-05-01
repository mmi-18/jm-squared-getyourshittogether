# syntax=docker/dockerfile:1.7
#
# Multi-stage Docker build for the Get Your Shit Together Next.js 16 app.
#
# Why this is NOT the Next.js "standalone" pattern (deliberately):
# Next.js's standalone output ships a trimmed node_modules. That works for
# the server bundle but breaks the Prisma CLI that the entrypoint runs at
# container start (`prisma migrate deploy`). Prisma 6's CLI transitively
# depends on `effect` and a chain of other packages that aren't in the
# trimmed bundle. Trying to copy them individually is whack-a-mole, so we
# ship the full node_modules instead. Image is ~600MB vs ~200MB —
# acceptable trade for correctness on a self-hosted box.
#
# Build args (set in CI via docker/build-push-action `build-args`):
#   - NEXT_PUBLIC_SITE_URL  baked into the client bundle for absolute URLs
#                           in metadata, og:image, sitemap.xml, manifest.

# ════════════════════════════════════════════════════════════════════════════
# Stage 1 — deps
# ════════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS deps
RUN apk add --no-cache libc6-compat openssl
WORKDIR /app

COPY package.json package-lock.json ./
COPY prisma ./prisma

# `npm ci` honors the lockfile exactly. Postinstall hook generates the
# Prisma client into node_modules/.prisma so the builder + runner can
# both reuse it.
RUN npm ci

# ════════════════════════════════════════════════════════════════════════════
# Stage 2 — builder
# ════════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS builder
RUN apk add --no-cache openssl
WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY . .

ARG NEXT_PUBLIC_SITE_URL=http://localhost:3000
ENV NEXT_PUBLIC_SITE_URL=${NEXT_PUBLIC_SITE_URL}
ENV NEXT_TELEMETRY_DISABLED=1

RUN npm run build

# ════════════════════════════════════════════════════════════════════════════
# Stage 3 — runner
# ════════════════════════════════════════════════════════════════════════════
FROM node:20-alpine AS runner
RUN apk add --no-cache openssl curl
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Use the `node` user that ships with node:20-alpine (uid 1000, gid 1000).
# Matches the host's `mario` user so bind-mounted volumes Just Work.

# Full app: built .next, all node_modules (so prisma CLI works), public
# assets, prisma schema/migrations (read by `migrate deploy`), package.json
# (so `npm start` resolves), entrypoint.
COPY --from=builder --chown=node:node /app/node_modules ./node_modules
COPY --from=builder --chown=node:node /app/.next ./.next
COPY --from=builder --chown=node:node /app/public ./public
COPY --from=builder --chown=node:node /app/package.json ./package.json
COPY --from=builder --chown=node:node /app/prisma ./prisma
COPY --chown=node:node scripts/entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

# Filesystem upload target. Bind-mounted from the host as a volume in
# docker-compose so uploads survive container rebuilds. Currently unused
# by the app (PWA stores user data in Postgres + IndexedDB), but kept
# for symmetry with glimpse and for future export/import dumps.
RUN mkdir -p /app/uploads && chown node:node /app/uploads

USER node
EXPOSE 3000

# Curl-based liveness probe. Traefik does its own routing healthcheck via
# HTTP requests, but this lets `docker ps` flag a wedged container.
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD curl -fsS http://127.0.0.1:3000/ || exit 1

ENTRYPOINT ["./entrypoint.sh"]
