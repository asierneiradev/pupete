-- CreateEnum
CREATE TYPE "GameKind" AS ENUM ('SECRET_SANTA', 'GIFT_LIST');

-- AlterTable
ALTER TABLE "Game" ADD COLUMN     "allHonorees" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "kind" "GameKind" NOT NULL DEFAULT 'SECRET_SANTA';

-- AlterTable
ALTER TABLE "Participant" ADD COLUMN     "honoree" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Wish" ADD COLUMN     "addedById" TEXT,
ADD COLUMN     "secret" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "WishClaim" (
    "id" TEXT NOT NULL,
    "wishId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "joint" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WishClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "WishClaim_participantId_idx" ON "WishClaim"("participantId");

-- CreateIndex
CREATE UNIQUE INDEX "WishClaim_wishId_participantId_key" ON "WishClaim"("wishId", "participantId");

-- AddForeignKey
ALTER TABLE "Wish" ADD CONSTRAINT "Wish_addedById_fkey" FOREIGN KEY ("addedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishClaim" ADD CONSTRAINT "WishClaim_wishId_fkey" FOREIGN KEY ("wishId") REFERENCES "Wish"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WishClaim" ADD CONSTRAINT "WishClaim_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
