/**
 * CLI de rescate. Necesita DATABASE_URL y el MISMO APP_SECRET que producción.
 *   npm run admin -- list
 *   npm run admin -- reset-code <nombre|id>
 *   npm run admin -- make-admin <nombre|id>
 *   npm run admin -- set-role <nombre|id> <USER|ORGANIZER|ADMIN>
 *   npm run admin -- games                      (salas y quién las lleva)
 *   npm run admin -- set-owner <id de sala> <nombre|id>   (ceder una sala)
 */
import { db } from "../src/lib/db";
import { nameKey, regenerateLoginCode } from "../src/lib/services/auth";

async function find(q: string) {
  const users = await db.user.findMany({
    where: { OR: [{ id: q }, { nameKey: nameKey(q) || undefined }, { name: { equals: q, mode: "insensitive" } }] },
  });
  if (users.length === 0) throw new Error(`No encuentro a «${q}»`);
  if (users.length > 1) {
    throw new Error(`Hay varias personas «${q}». Usa el id:\n${users.map((u) => `  ${u.id}  ${u.name}`).join("\n")}`);
  }
  return users[0];
}

async function main() {
  const [cmd, arg, arg2] = process.argv.slice(2);
  if (cmd === "list") {
    const users = await db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });
    for (const u of users) console.log(`${u.role.padEnd(9)}  ${u.id}  ${u.name}${u.pinHash ? "" : "  (sin PIN)"}${u.nameKey ? "" : "  (⚠ sin nombre de acceso)"}`);
  } else if (cmd === "reset-code" && arg) {
    const u = await find(arg);
    console.log(`Acceso reseteado (PIN borrado, sesiones cerradas). Código de invitación nuevo de ${u.name}: ${await regenerateLoginCode(u.id)}`);
  } else if (cmd === "make-admin" && arg) {
    const u = await find(arg);
    await db.user.update({ where: { id: u.id }, data: { role: "ADMIN" } });
    console.log(`${u.name} ahora es admin.`);
  } else if (cmd === "set-role" && arg && ["USER", "ORGANIZER", "ADMIN"].includes(arg2 ?? "")) {
    const u = await find(arg);
    await db.user.update({ where: { id: u.id }, data: { role: arg2 as "USER" | "ORGANIZER" | "ADMIN" } });
    console.log(`${u.name} ahora es ${arg2}.`);
  } else if (cmd === "games") {
    const games = await db.game.findMany({ orderBy: { createdAt: "asc" }, include: { owner: { select: { name: true } }, _count: { select: { participants: true } } } });
    for (const g of games) console.log(`${g.id}  ${g.status.padEnd(8)}  ${g.name}  ·  la lleva ${g.owner.name}  ·  ${g._count.participants} personas`);
  } else if (cmd === "set-owner" && arg && arg2) {
    const game = await db.game.findUnique({ where: { id: arg } });
    if (!game) throw new Error(`No existe la sala «${arg}». Mira los ids con: npm run admin -- games`);
    const u = await find(arg2);
    if (u.role === "USER") throw new Error(`${u.name} no organiza salas. Antes: npm run admin -- set-role "${u.name}" ORGANIZER`);
    await db.game.update({ where: { id: game.id }, data: { ownerId: u.id } });
    console.log(`La sala «${game.name}» ahora la lleva ${u.name}.`);
  } else {
    console.log("Uso: npm run admin -- list | reset-code <nombre|id> | make-admin <nombre|id> | set-role <nombre|id> <USER|ORGANIZER|ADMIN> | games | set-owner <sala> <nombre|id>");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
