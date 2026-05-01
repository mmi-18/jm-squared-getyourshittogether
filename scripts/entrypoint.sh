#!/bin/sh
# Container entrypoint.
#
# Runs Prisma migrations against the configured DATABASE_URL/DIRECT_URL,
# then starts the Next.js server. If the migration step fails, the
# container exits non-zero — Docker's restart policy will retry, and the
# previous container stays in place so partial deploys can't corrupt state.

set -e

echo "[entrypoint] Applying Prisma migrations..."
node node_modules/.bin/prisma migrate deploy

echo "[entrypoint] Starting Next.js server on ${HOSTNAME:-0.0.0.0}:${PORT:-3000}..."
exec node node_modules/.bin/next start -p "${PORT:-3000}" -H "${HOSTNAME:-0.0.0.0}"
