import type { Metadata } from "next";
import Link from "next/link";
import { requireOrganizer } from "@/lib/session";
import { listPeople } from "@/lib/services/users";
import { UserRow } from "./UserRow";

export const metadata: Metadata = { title: "Personas" };

export default async function UsuariosPage({ searchParams }: { searchParams: Promise<{ ver?: string }> }) {
  const actor = await requireOrganizer();
  const admin = actor.role === "ADMIN";
  const all = admin && (await searchParams).ver === "todas";
  const { people, hiddenCount } = await listPeople(actor, { all });
  const mine = people.filter((p) => p.id === actor.id || p.myGames > 0);
  const staff = people.filter((p) => p.id !== actor.id && p.myGames === 0 && p.role !== "USER");
  const rest = people.filter((p) => p.id !== actor.id && p.myGames === 0 && p.role === "USER");

  const list = (rows: typeof people) => (
    <ul className="card mt-4 divide-y divide-line px-5">
      {rows.map((u) => (
        <UserRow key={u.id} user={u} isSelf={u.id === actor.id} canSetRoles={admin} />
      ))}
    </ul>
  );

  return (
    <div className="mx-auto max-w-3xl">
      <p className="dot-label rise">{admin ? "Administración" : "Organización"}</p>
      <h1 className="font-dot text-5xl font-bold rise">PERSONAS</h1>
      <p className="mt-2 text-ink-soft">
        Aquí está la gente de <b>las salas que tú has creado</b>. Si alguien olvida su PIN, <b>resetea su acceso</b> y pásale el código de
        invitación nuevo. Al <b>eliminar</b> a una persona se borra todo lo suyo, fotos incluidas.
        {!admin && " Si alguien también está en salas de otro organizador, eso lo hace un administrador."}
      </p>

      <h2 className="dot-label mt-8">De mis salas</h2>
      {list(mine)}

      {admin && (
        <>
          <h2 className="dot-label mt-10">Organizadores y admins</h2>
          <p className="mt-2 text-sm text-ink-soft">
            Un <b>organizador</b> crea sus propias salas y solo ve las suyas y a su gente. Un <b>admin</b> además reparte estos permisos. Nadie ve
            ni gestiona las salas de otro.
          </p>
          {staff.length > 0 ? list(staff) : <p className="mt-3 text-ink-soft">Nadie más organiza salas todavía.</p>}

          {all ? (
            <>
              <div className="mt-10 flex items-center justify-between">
                <h2 className="dot-label">Resto de cuentas</h2>
                <Link href="/admin/usuarios" className="link text-sm">Ocultar</Link>
              </div>
              <p className="mt-2 text-sm text-ink-soft">Gente de las salas de otros organizadores y cuentas que ya no están en ninguna sala.</p>
              {rest.length > 0 ? list(rest) : <p className="mt-3 text-ink-soft">No hay más cuentas.</p>}
            </>
          ) : (
            hiddenCount > 0 && (
              <p className="mt-10 text-sm text-ink-soft">
                Hay {hiddenCount} cuenta{hiddenCount === 1 ? "" : "s"} más que no {hiddenCount === 1 ? "es" : "son"} de tus salas.{" "}
                <Link href="/admin/usuarios?ver=todas" className="link">Ver todas las cuentas</Link>
              </p>
            )
          )}
        </>
      )}
    </div>
  );
}
