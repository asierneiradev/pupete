"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionButton, ActionForm, CopyButton, Notice, ShareButton, SubmitButton } from "./forms";
import { GroupPicker } from "./GroupPicker";
import type { ActionResult } from "@/lib/errors";
import {
  addExclusionAction, addParticipantAction, checkDrawAction, drawAction, finishGameAction, removeExclusionAction,
  removeParticipantAction, resetDrawAction, rotateJoinTokenAction, setGroupAction, setJoinOpenAction,
} from "@/app/actions/games";

export interface AdminParticipant {
  id: string;
  userId: string;
  name: string;
  avatar: string;
  group: "ADULT" | "CHILD";
  wishCount: number;
  emptyList: boolean;
  revealed: boolean;
  hasPin: boolean;
  /** Código de invitación: solo mientras no haya creado su PIN. */
  code: string | null;
}

export function ParticipantsTable({
  gameId,
  participants,
  open,
  showGroups,
  drawn,
}: {
  gameId: string;
  participants: AdminParticipant[];
  open: boolean;
  showGroups: boolean;
  drawn: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const [error, setError] = useState<ActionResult | null>(null);
  const [showCodes, setShowCodes] = useState(false);
  if (participants.length === 0) {
    return <p className="text-ink-soft">Todavía no hay nadie. ¡Añade a la primera persona!</p>;
  }
  const withoutPin = participants.filter((p) => p.code).length;
  return (
    <div>
      {withoutPin > 0 && (
        <div className="mb-3 flex flex-wrap items-center justify-end gap-2">
          <span className="hint">{withoutPin} sin PIN todavía</span>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => setShowCodes((s) => !s)}>
            {showCodes ? "Ocultar códigos de invitación" : "Ver códigos de invitación"}
          </button>
        </div>
      )}
      <ul className="flex flex-col divide-y divide-line">
        {participants.map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="avatar h-10 w-10 text-xl">{p.avatar}</span>
            <div className="min-w-[9.5rem] flex-1">
              <p className="font-semibold leading-tight">{p.name}</p>
              <p className="text-xs text-ink-faint">
                {p.wishCount} idea{p.wishCount === 1 ? "" : "s"}
                {drawn && (p.revealed ? " · ✉️ sobre abierto" : " · ✉️ sin abrir")}
              </p>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {p.hasPin ? <span className="chip chip-moss">🔐 PIN creado</span> : <span className="chip chip-sky">⏳ Sin PIN</span>}
                {p.emptyList && <span className="chip chip-red">⚠️ Lista vacía</span>}
              </div>
            </div>
            <div className="ml-auto flex flex-wrap items-center justify-end gap-2">
            {showGroups &&
              (open ? (
                <select
                  className="select min-h-[36px] w-auto py-1 text-sm"
                  value={p.group}
                  disabled={pending}
                  aria-label={`Grupo de ${p.name}`}
                  onChange={(e) =>
                    start(async () => {
                      setError(await setGroupAction(gameId, p.id, e.target.value as "ADULT" | "CHILD"));
                      router.refresh();
                    })
                  }
                >
                  <option value="ADULT">🧑 Adulto</option>
                  <option value="CHILD">🧒 Peque</option>
                </select>
              ) : (
                <span className="chip">{p.group === "CHILD" ? "🧒 Peque" : "🧑 Adulto"}</span>
              ))}
            {showCodes && p.code && (
              <span className="flex items-center gap-1">
                <span className="code-pill text-sm">{p.code}</span>
                <CopyButton text={p.code} label="⧉" className="btn btn-ghost btn-sm px-2.5" />
              </span>
            )}
            {open && (
              <ActionButton
                action={() => removeParticipantAction(gameId, p.id)}
                confirm={`¿Quitar a ${p.name} de la sala? Se borrará su lista de esta sala.`}
                className="btn btn-ghost btn-sm px-2.5"
              >
                <span aria-label={`Quitar a ${p.name}`}>✕</span>
              </ActionButton>
            )}
            </div>
          </li>
        ))}
      </ul>
      <Notice result={error} />
    </div>
  );
}

export function AddParticipant({
  gameId,
  showGroups,
  reusable,
}: {
  gameId: string;
  showGroups: boolean;
  reusable: Array<{ id: string; name: string; avatar: string }>;
}) {
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [last, setLast] = useState<{ code?: string; name: string } | null>(null);
  return (
    <div className="flex flex-col gap-4">
      {reusable.length > 0 && (
        <div className="grid grid-cols-2 gap-1 rounded-full border border-line bg-paper p-1">
          {(["new", "existing"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded-full py-2 text-sm font-semibold ${mode === m ? "bg-paper-2 text-ink shadow-sm" : "text-ink-faint"}`}
            >
              {m === "new" ? "Persona nueva" : "De otras salas"}
            </button>
          ))}
        </div>
      )}
      <ActionForm
        action={addParticipantAction.bind(null, gameId)}
        resetOnSuccess
        onSuccess={(r) => setLast(r.ok ? ((r.data as { code?: string; name: string }) ?? null) : null)}
        className="flex flex-col gap-3"
      >
        {mode === "new" ? (
          <label className="field">
            <span>Nombre</span>
            <input name="name" required maxLength={60} className="input" placeholder="Martina" />
            <span className="hint">Con este nombre entrará (junto con su PIN). Si ya hay alguien que se llama igual, añade una inicial.</span>
          </label>
        ) : (
          <label className="field">
            <span>Persona</span>
            <select name="existingUserId" required className="select">
              {reusable.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.avatar} {u.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {showGroups && <GroupPicker />}
        <SubmitButton className="btn self-start">+ Añadir</SubmitButton>
      </ActionForm>
      {last?.code && (
        <div className="rounded-2xl border-2 border-dashed border-moss bg-moss-soft p-4">
          <p className="text-sm">Código de invitación de <b>{last.name}</b> (con él entra la primera vez y crea su PIN):</p>
          <div className="mt-1 flex items-center gap-2">
            <span className="font-dot text-3xl font-bold tracking-wider">{last.code}</span>
            <CopyButton text={last.code} />
          </div>
        </div>
      )}
    </div>
  );
}

export function InvitePanel({
  gameId,
  url,
  joinOpen,
  canJoin,
  gameName,
}: {
  gameId: string;
  url: string;
  joinOpen: boolean;
  canJoin: boolean;
  gameName: string;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2">
        <span className="label">Enlace de invitación</span>
        <div className="flex flex-wrap items-center gap-2">
          <code className="min-w-0 basis-full truncate rounded-xl sm:basis-0 sm:flex-1 border border-line bg-paper px-3 py-2 font-mono text-sm">{url}</code>
          <CopyButton text={url} />
          <ShareButton text={`¡Te invito al amigo invisible «${gameName}»! 🎁`} url={url} />
        </div>
      </div>
      {canJoin && (
        <div className="flex flex-wrap items-center gap-3">
          <span className={`chip ${joinOpen ? "chip-moss" : "chip-red"}`}>{joinOpen ? "● Inscripción abierta" : "● Inscripción cerrada"}</span>
          <ActionButton action={() => setJoinOpenAction(gameId, !joinOpen)}>{joinOpen ? "Cerrar inscripción" : "Abrir inscripción"}</ActionButton>
          <ActionButton action={() => rotateJoinTokenAction(gameId)} confirm="El enlace actual dejará de funcionar. ¿Crear uno nuevo?">
            Cambiar enlace
          </ActionButton>
        </div>
      )}
      <p className="hint">Mándalo por WhatsApp a quien quieras invitar: cada persona pone su nombre y elige su PIN.</p>
    </div>
  );
}

export function ExclusionsPanel({
  gameId,
  participants,
  exclusions,
  open,
}: {
  gameId: string;
  participants: Array<{ id: string; name: string; avatar: string }>;
  exclusions: Array<{ id: string; a: string; b: string }>;
  open: boolean;
}) {
  return (
    <div className="flex flex-col gap-4">
      {exclusions.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {exclusions.map((e) => (
            <li key={e.id} className="flex items-center gap-2 rounded-2xl border border-line bg-paper px-3 py-2">
              <span className="flex-1">{e.a} <span className="text-red">⇎</span> {e.b}</span>
              {open && (
                <ActionButton action={() => removeExclusionAction(gameId, e.id)} className="btn btn-ghost btn-sm px-2.5">
                  <span aria-label="Quitar exclusión">✕</span>
                </ActionButton>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-ink-soft">Sin exclusiones. Úsalas para que parejas o hermanos no se toquen entre sí.</p>
      )}
      {open && participants.length >= 2 && (
        <ActionForm action={addExclusionAction.bind(null, gameId)} className="flex flex-col gap-2">
          <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_auto_1fr_auto]">
            <select name="a" className="select" aria-label="Primera persona" required>
              {participants.map((p) => <option key={p.id} value={p.id}>{p.avatar} {p.name}</option>)}
            </select>
            <span className="self-center text-center text-red">⇎</span>
            <select name="b" className="select" aria-label="Segunda persona" defaultValue={participants[1]?.id} required>
              {participants.map((p) => <option key={p.id} value={p.id}>{p.avatar} {p.name}</option>)}
            </select>
            <SubmitButton className="btn btn-ghost">Añadir</SubmitButton>
          </div>
        </ActionForm>
      )}
    </div>
  );
}

export function DrawPanel({ gameId, status, total }: { gameId: string; status: "OPEN" | "DRAWN" | "FINISHED"; total: number }) {
  const [check, setCheck] = useState<{ ok: boolean; error?: string; warnings?: string[] } | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  if (status === "FINISHED") {
    return <p className="text-ink-soft">Esta sala está cerrada. Puedes crear la edición del año que viene más abajo.</p>;
  }

  if (status === "DRAWN") {
    return (
      <div className="flex flex-col gap-3">
        <p className="notice notice-ok">🎉 Sorteo hecho. Cada persona ve a quién regala desde su perfil. Tú tampoco lo sabes (¡ni lo verás!).</p>
        <div className="flex flex-wrap gap-2">
          <ActionButton action={() => finishGameAction(gameId)} confirm="¿Marcar la sala como celebrada? Se cerrarán listas y chat." className="btn btn-ghost">
            🎄 Ya hemos hecho el intercambio
          </ActionButton>
          <ActionButton
            action={() => resetDrawAction(gameId)}
            confirm="Se borrarán todas las asignaciones y habrá que volver a sortear. Quien ya haya abierto su sobre lo sabrá. ¿Seguro?"
            className="btn btn-ghost text-red"
          >
            Deshacer sorteo
          </ActionButton>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-ink-soft">
        Cuando estéis todos ({total} ahora), comprueba que el sorteo es posible y lánzalo. Nadie (ni tú) verá las asignaciones de los demás.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-ghost"
          disabled={pending}
          onClick={() => start(async () => setCheck(await checkDrawAction(gameId)))}
        >
          Comprobar
        </button>
        <button
          type="button"
          className="btn btn-red px-7"
          disabled={pending}
          onClick={() => {
            if (!confirm(`¿Hacer el sorteo ahora con ${total} personas? Después no se podrá añadir a nadie sin deshacerlo.`)) return;
            start(async () => {
              const r = await drawAction(gameId);
              setResult(r);
              router.refresh();
            });
          }}
        >
          {pending ? <span className="inline-block w-2 h-2 rounded-full bg-current pulse-dot" /> : "✦"} ¡Hacer el sorteo!
        </button>
      </div>
      {check && (
        <div className={`notice ${check.ok ? (check.warnings?.length ? "notice-warn" : "notice-ok") : "notice-err"}`}>
          {!check.ok ? (
            check.error
          ) : check.warnings?.length ? (
            <>
              <p className="font-semibold">El sorteo es posible, pero ojo:</p>
              <ul className="mt-1 list-disc pl-5">
                {check.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            </>
          ) : (
            "Todo cuadra: el sorteo es posible ✓"
          )}
        </div>
      )}
      <Notice result={result} />
    </div>
  );
}
