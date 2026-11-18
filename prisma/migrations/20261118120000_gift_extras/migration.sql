-- Lote 7: agradecimientos, recordatorios, bote común y portada con foto.
-- Solo añade columnas (con valor por defecto o nulas): no toca datos existentes.
ALTER TABLE "Game" ADD COLUMN "coverImage" TEXT,
ADD COLUMN "revealGivers" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "lastReminderDays" INTEGER;

ALTER TABLE "WishClaim" ADD COLUMN "amountCents" INTEGER;
