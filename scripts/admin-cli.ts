/**
 * CLI de rescate. Necesita DATABASE_URL y el MISMO APP_SECRET que producción.
 *   npm run admin -- list
 *   npm run admin -- reset-code <nombre|id>
 *   npm run admin -- make-admin <nombre|id>
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
  const [cmd, arg] = process.argv.slice(2);
  if (cmd === "list") {
    const users = await db.user.findMany({ orderBy: [{ role: "asc" }, { name: "asc" }] });
    for (const u of users) console.log(`${u.role.padEnd(5)}  ${u.id}  ${u.name}${u.pinHash ? "" : "  (sin PIN)"}${u.nameKey ? "" : "  (⚠ sin nombre de acceso)"}`);
  } else if (cmd === "reset-code" && arg) {
    const u = await find(arg);
    console.log(`Acceso reseteado (PIN borrado, sesiones cerradas). Código de invitación nuevo de ${u.name}: ${await regenerateLoginCode(u.id)}`);
  } else if (cmd === "make-admin" && arg) {
    const u = await find(arg);
    await db.user.update({ where: { id: u.id }, data: { role: "ADMIN" } });
    console.log(`${u.name} ahora es admin.`);
  } else {
    console.log("Uso: npm run admin -- list | reset-code <nombre|id> | make-admin <nombre|id>");
    process.exitCode = 1;
  }
}

main()
  .catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
