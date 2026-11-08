#!/usr/bin/env sh
# Vacía TODAS las tablas de la BD indicada en DATABASE_URL (solo para pruebas locales).
set -e
: "${DATABASE_URL:?Define DATABASE_URL}"
echo 'TRUNCATE "PushSubscription","ChatMessage","Assignment","Exclusion","WishLink","Wish","Participant","Game","Session","User" CASCADE;' \
  | npx prisma db execute --stdin --url "$DATABASE_URL"
