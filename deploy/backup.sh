#!/bin/bash
# Backup de Pupete: base de datos + fotos subidas + .env (APP_SECRET incluido).
# Uso: ./deploy/backup.sh [destino]   (por defecto ./backups)
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DEST="${1:-$APP_DIR/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"
KEEP_DAYS=30

# shellcheck disable=SC1091
set -a; . "$APP_DIR/.env"; set +a

mkdir -p "$DEST"
umask 077

echo "[backup] BD → $DEST/pupete-db-$STAMP.sql.gz"
docker compose --project-directory "$APP_DIR" exec -T db pg_dump -U "${POSTGRES_USER:-pupete}" -d "${POSTGRES_DB:-pupete}" --clean --if-exists \
  | gzip -9 > "$DEST/pupete-db-$STAMP.sql.gz"

echo "[backup] fotos → $DEST/pupete-uploads-$STAMP.tar.gz"
tar czf "$DEST/pupete-uploads-$STAMP.tar.gz" -C "$APP_DIR/data" uploads

echo "[backup] .env (APP_SECRET) → $DEST/pupete-env-$STAMP.gz"
gzip -9 -c "$APP_DIR/.env" > "$DEST/pupete-env-$STAMP.gz"

find "$DEST" -maxdepth 1 -type f -name 'pupete-*' -mtime "+$KEEP_DAYS" -delete

ls -lh "$DEST" | tail -5
