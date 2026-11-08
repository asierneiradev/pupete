-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "wantsSurprise" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "pinFailed" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pinHash" TEXT,
ADD COLUMN     "pinLockedUntil" TIMESTAMP(3);

-- Antes, "Lo que quieras, sorpréndeme" salía siempre en todas las listas.
-- Se mantiene marcado para quien ya participaba, para no dejar listas vacías.
UPDATE "Participant" SET "wantsSurprise" = true;
