#!/bin/sh
# Migraciones idempotentes y arranque del servidor standalone de Next.
set -e

echo "[pupete] prisma migrate deploy…"
node /opt/prisma-cli/node_modules/prisma/build/index.js migrate deploy --schema /app/prisma/schema.prisma

echo "[pupete] arrancando server.js en ${HOSTNAME:-0.0.0.0}:${PORT:-3000}"
exec node server.js
