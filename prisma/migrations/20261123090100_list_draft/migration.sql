-- Listas de regalos en borrador: se publican cuando su dueño quiere.
ALTER TABLE "Participant" ADD COLUMN "listPublishedAt" TIMESTAMP(3);

-- Todo lo que ya existe queda publicado: las salas en curso siguen exactamente igual.
UPDATE "Participant" SET "listPublishedAt" = "joinedAt";
