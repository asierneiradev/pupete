-- Se entra con nombre + PIN: el email y los enlaces mágicos dejan de existir.

-- 1) Nombre normalizado y único (igual que nameKey() en src/lib/services/auth.ts:
--    minúsculas, sin tildes, solo letras y números separados por un espacio).
ALTER TABLE "User" ADD COLUMN "nameKey" TEXT;

WITH k AS (
  SELECT id, "createdAt",
         btrim(regexp_replace(
           translate(lower(name),
             'ÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇáàäâãéèëêíìïîóòöôõúùüûñç',
             'aaaaaeeeeiiiiooooouuuuncaaaaaeeeeiiiiooooouuuunc'),
           '[^a-z0-9]+', ' ', 'g')) AS key
  FROM "User"
), r AS (
  SELECT id, key, row_number() OVER (PARTITION BY key ORDER BY "createdAt") AS rn FROM k
)
UPDATE "User" u SET "nameKey" = r.key
FROM r
WHERE u.id = r.id AND r.rn = 1 AND r.key <> '';
-- Si dos cuentas se llamaban igual, la más nueva queda sin nameKey: al entrar,
-- la app le pide que elija un nombre distinto (p. ej. con una inicial).

CREATE UNIQUE INDEX "User_nameKey_key" ON "User"("nameKey");

-- 2) Fuera el email
DROP INDEX IF EXISTS "User_email_key";
ALTER TABLE "User" DROP COLUMN "email";

-- 3) Fuera los enlaces mágicos por email
DROP TABLE "MagicLink";
