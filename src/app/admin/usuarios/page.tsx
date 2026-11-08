import type { Metadata } from "next";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/session";
import { UserRow } from "./UserRow";
import { revealLoginCode } from "@/lib/services/auth";

export const metadata: Metadata = { title: "Personas" };

export default async function UsuariosPage() {
  const admin = await requireAdmin();
  const users = await db.user.findMany({
    orderBy: [{ role: "asc" }, { name: "asc" }],
    include: { _count: { select: { participants: true } } },
  });
  return (
    <div className="mx-auto max-w-3xl">
      <p className="dot-label rise">Administración</p>
      <h1 className="font-dot text-5xl font-bold rise">PERSONAS</h1>
      <p className="mt-2 text-ink-soft">
        Todas las cuentas. Los admins pueden crear y gestionar salas. Si alguien olvida su PIN, <b>resetea su acceso</b> y pásale el
        código de invitación nuevo. Al <b>eliminar</b> a una persona se borra todo lo suyo, fotos incluidas.
      </p>
      <ul className="card mt-6 divide-y divide-line px-5">
        {users.map((u) => (
          <UserRow
            key={u.id}
            user={{
              id: u.id,
              name: u.name,
              avatar: u.avatar,
              role: u.role,
              games: u._count.participants,
              hasPin: Boolean(u.pinHash),
              code: u.pinHash || (u.role === "ADMIN" && u.id !== admin.id) ? null : revealLoginCode(u),
            }}
            isSelf={u.id === admin.id}
          />
        ))}
      </ul>
    </div>
  );
}
