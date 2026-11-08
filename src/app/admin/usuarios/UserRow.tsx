"use client";

import { useState } from "react";
import { ActionButton, CopyButton } from "@/components/forms";
import { deleteUserAction, regenerateUserCodeAction, setRoleAction } from "@/app/actions/auth";

export interface UserRowData {
  id: string;
  name: string;
  avatar: string;
  role: "USER" | "ADMIN";
  games: number;
  hasPin: boolean;
  /** Código de invitación pendiente (si aún no ha creado su PIN). */
  code: string | null;
}

export function UserRow({ user, isSelf }: { user: UserRowData; isSelf: boolean }) {
  const [code, setCode] = useState<string | null>(user.code);
  const canTouch = !isSelf && user.role !== "ADMIN";
  return (
    <li className="flex flex-col gap-3 py-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="avatar h-10 w-10 text-xl">{user.avatar}</span>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">
            {user.name} {isSelf && <span className="text-ink-faint">(tú)</span>}
          </p>
          <p className="text-xs text-ink-faint">
            {user.games} sala{user.games === 1 ? "" : "s"}
          </p>
        </div>
        <div className="flex basis-full flex-wrap gap-1.5 pl-[52px] sm:basis-auto sm:pl-0">
          {user.role === "ADMIN" ? <span className="chip chip-red">Admin</span> : <span className="chip">Participante</span>}
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

      {!isSelf && (
        <div className="flex flex-wrap gap-2 sm:pl-[52px]">
          <ActionButton
            action={() => setRoleAction(user.id, user.role === "ADMIN" ? "USER" : "ADMIN")}
            confirm={user.role === "ADMIN" ? `¿Quitar admin a ${user.name}?` : `¿Hacer admin a ${user.name}?`}
          >
            {user.role === "ADMIN" ? "Quitar admin" : "Hacer admin"}
          </ActionButton>
          {canTouch && (
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
          {canTouch && (
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
