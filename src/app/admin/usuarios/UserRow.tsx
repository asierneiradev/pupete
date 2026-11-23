"use client";

import { useState } from "react";
import { ActionButton, CopyButton } from "@/components/forms";
import { deleteUserAction, regenerateUserCodeAction, setRoleAction } from "@/app/actions/auth";

export interface UserRowData {
  id: string;
  name: string;
  avatar: string;
  role: "USER" | "ORGANIZER" | "ADMIN";
  /** En cuántas de mis salas está */
  myGames: number;
  hasPin: boolean;
  /** Código de invitación pendiente (si aún no ha creado su PIN). */
  code: string | null;
  /** Puedo resetear su acceso o eliminarla */
  canManage: boolean;
}

const ROLE_CHIP = {
  ADMIN: <span className="chip chip-red">Admin</span>,
  ORGANIZER: <span className="chip chip-ochre">Organiza salas</span>,
  USER: <span className="chip">Participante</span>,
};

export function UserRow({ user, isSelf, canSetRoles }: { user: UserRowData; isSelf: boolean; canSetRoles: boolean }) {
  const [code, setCode] = useState<string | null>(user.code);
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="avatar h-10 w-10 text-xl">{user.avatar}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {user.name} {isSelf && <span className="text-ink-faint">(tú)</span>}
          </p>
          <p className="text-xs text-ink-faint">
            {user.myGames === 0 ? "En ninguna de tus salas" : `En ${user.myGames} de tus salas`}
          </p>
        </div>
        <div className="flex basis-full flex-wrap gap-1.5 pl-[52px] sm:basis-auto sm:pl-0">
          {ROLE_CHIP[user.role]}
          {user.hasPin && !code ? <span className="chip chip-moss">🔐 PIN creado</span> : <span className="chip chip-sky">⏳ Sin PIN</span>}
        </div>
      </div>

      {code && (
        <div className="flex flex-wrap items-center gap-2 text-sm sm:pl-[52px]">
          <span className="text-ink-soft">Código de invitación:</span>
          <span className="code-pill">{code}</span>
          <CopyButton text={code} label="⧉" className="btn btn-ghost btn-sm px-2.5" />
        </div>
      )}

      {!isSelf && (canSetRoles || user.canManage) && (
        <div className="flex flex-wrap gap-2 sm:pl-[52px]">
          {canSetRoles && user.role !== "ORGANIZER" && (
            <ActionButton
              action={() => setRoleAction(user.id, "ORGANIZER")}
              confirm={
                user.role === "ADMIN"
                  ? `¿Dejar a ${user.name} como organizador/a? Seguirá creando y llevando sus salas, pero ya no podrá repartir permisos ni ver todas las cuentas.`
                  : `¿Dejar que ${user.name} organice salas? Podrá crear las suyas y solo verá esas.`
              }
            >
              {user.role === "ADMIN" ? "Dejar en organizador/a" : "Hacer organizador/a"}
            </ActionButton>
          )}
          {canSetRoles && user.role !== "ADMIN" && (
            <ActionButton action={() => setRoleAction(user.id, "ADMIN")} confirm={`¿Hacer admin a ${user.name}? Podrá repartir permisos y ver todas las cuentas.`}>
              Hacer admin
            </ActionButton>
          )}
          {canSetRoles && user.role !== "USER" && (
            <ActionButton
              action={() => setRoleAction(user.id, "USER")}
              confirm={`¿Quitar los permisos a ${user.name}? No podrá crear salas nuevas; las que ya tiene las seguirá llevando.`}
            >
              Quitar permisos
            </ActionButton>
          )}
          {user.canManage && (
            <ActionButton
              action={async () => {
                const r = await regenerateUserCodeAction(user.id);
                if (r.ok && r.data) setCode(r.data);
                return r;
              }}
              confirm={`¿Resetear el acceso de ${user.name}? Se borrará su PIN, se cerrarán sus sesiones y tendrá que entrar con un código de invitación nuevo para crear otro PIN.`}
              showResult={false}
            >
              🔑 Resetear acceso
            </ActionButton>
          )}
          {user.canManage && (
            <ActionButton
              action={() => deleteUserAction(user.id)}
              confirm={`¿Eliminar a ${user.name} para siempre?\n\nSe borrarán su cuenta, sus listas de deseos, las fotos que subió, sus mensajes y su participación en todas las salas. No se puede deshacer.`}
              className="btn btn-ghost btn-sm text-red"
            >
              🗑 Eliminar
            </ActionButton>
          )}
        </div>
      )}
    </li>
  );
}
