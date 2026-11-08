"use client";

import { useState } from "react";
import type { Game } from "@prisma/client";
import { ActionForm, SubmitButton } from "./forms";
import { Cover } from "./Cover";
import type { ActionResult } from "@/lib/errors";

const COVERS: Array<[string, string]> = [
  ["bosque", "Bosque"],
  ["nieve", "Nieve"],
  ["faroles", "Farolillos"],
  ["colinas", "Colinas"],
];

type Props = {
  action: (prev: unknown, fd: FormData) => Promise<ActionResult<unknown>>;
  game?: Game;
  eventDateLocal?: string;
  deadlineLocal?: string;
  drawn?: boolean;
  isNew?: boolean;
};

const euroInput = (c: number | null | undefined) => (c == null ? "" : String(c / 100).replace(".", ","));

function Section({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <section className="card p-5 sm:p-6">
      <div className="flex items-baseline gap-3">
        <span className="font-dot text-2xl font-bold text-red">{n}</span>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <div className="mt-4 flex flex-col gap-4">{children}</div>
    </section>
  );
}

export function GameForm({ action, game, eventDateLocal = "", deadlineLocal = "", drawn = false, isNew = false }: Props) {
  const [useBudget, setUseBudget] = useState(game ? game.budgetMin != null || game.budgetMax != null : true);
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <Section n="01" title="Lo básico">
        <label className="field">
          <span>Nombre de la sala</span>
          <input name="name" required maxLength={80} defaultValue={game?.name} className="input" placeholder="Navidad en casa de la abuela 2026" />
        </label>
        <label className="field">
          <span>Mensaje para la familia (opcional)</span>
          <textarea name="description" maxLength={500} defaultValue={game?.description ?? ""} className="textarea" placeholder="Este año, cena el 24 y regalos después del turrón 🎄" />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="field">
            <span>Fecha del intercambio</span>
            <input name="eventDate" type="datetime-local" defaultValue={eventDateLocal} className="input" />
          </label>
          <label className="field">
            <span>Lugar</span>
            <input name="location" maxLength={120} defaultValue={game?.location ?? ""} className="input" placeholder="Casa de la abuela" />
          </label>
        </div>
        <fieldset>
          <legend className="label">Portada</legend>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {COVERS.map(([k, label]) => (
              <label key={k} className="option flex-col p-2">
                <input type="radio" name="cover" value={k} defaultChecked={(game?.cover ?? "bosque") === k} className="sr-only" />
                <Cover cover={k} className="h-16 w-full rounded-xl" />
                <span className="text-center text-sm font-semibold">{label}</span>
              </label>
            ))}
          </div>
        </fieldset>
      </Section>

      <Section n="02" title="¿Cómo entra la gente?">
        <div className="grid grid-cols-1 gap-2">
          {[
            ["INVITE", "📨 Con invitación", "Compartes un enlace (por WhatsApp) y cada persona crea su perfil."],
            ["ADMIN_CREATED", "🗝️ Lo hago yo", "Tú das de alta a todos y repartes a cada uno su código de acceso. Ideal para peques y abuelos."],
            ["BOTH", "✨ Las dos cosas", "Enlace de invitación y, además, puedes dar de alta tú a quien quieras."],
          ].map(([v, t, d]) => (
            <label key={v} className="option">
              <input type="radio" name="signupMode" value={v} defaultChecked={(game?.signupMode ?? "BOTH") === v} />
              <span>
                <b>{t}</b>
                <span className="block text-sm text-ink-soft">{d}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <Section n="03" title="Grupos">
        {drawn && <p className="notice notice-warn">El sorteo ya está hecho: para cambiar los grupos, deshazlo primero.</p>}
        <div className="grid grid-cols-1 gap-2">
          {[
            ["NONE", "👨‍👩‍👧‍👦 Todos juntos", "Cualquiera puede regalar a cualquiera."],
            ["SEPARATE", "🧑 + 🧒 Adultos y peques por separado", "Los adultos se regalan entre ellos y los peques entre ellos."],
            ["KIDS_FROM_ADULTS", "🎅 Los mayores regalan a los peques", "Los adultos hacen su sorteo y, además, cada peque recibe el regalo de un adulto. Los peques no regalan."],
          ].map(([v, t, d]) => (
            <label key={v} className="option" aria-disabled={drawn}>
              <input type="radio" name="groupMode" value={v} defaultChecked={(game?.groupMode ?? "NONE") === v} disabled={drawn && game?.groupMode !== v} />
              <span>
                <b>{t}</b>
                <span className="block text-sm text-ink-soft">{d}</span>
              </span>
            </label>
          ))}
        </div>
      </Section>

      <Section n="04" title="Presupuesto">
        <label className="switch font-semibold">
          <input type="checkbox" name="useBudget" checked={useBudget} onChange={(e) => setUseBudget(e.target.checked)} />
          Poner un rango de precios
        </label>
        {useBudget && (
          <div className="grid grid-cols-2 gap-4">
            <label className="field">
              <span>Mínimo (€)</span>
              <input name="budgetMin" inputMode="decimal" defaultValue={euroInput(game?.budgetMin ?? (game ? null : 1500))} className="input" placeholder="15" />
            </label>
            <label className="field">
              <span>Máximo (€)</span>
              <input name="budgetMax" inputMode="decimal" defaultValue={euroInput(game?.budgetMax ?? (game ? null : 3000))} className="input" placeholder="30" />
            </label>
          </div>
        )}
        <span className="hint">Las ideas que se salgan del rango se marcan con ⚠️ para que nadie se pase.</span>
      </Section>

      <Section n="05" title="Detalles mágicos">
        <label className="option">
          <input type="checkbox" name="anonChat" defaultChecked={game?.anonChat ?? true} />
          <span>
            <b>💬 Buzón secreto</b>
            <span className="block text-sm text-ink-soft">Quien regala puede hacer preguntas a quien recibe sin revelar quién es.</span>
          </span>
        </label>
        <label className="option">
          <input type="checkbox" name="avoidPrevious" defaultChecked={game?.avoidPrevious ?? true} />
          <span>
            <b>🔁 No repetir el año pasado</b>
            <span className="block text-sm text-ink-soft">Si esta sala viene de una edición anterior, se evita que te toque la misma persona.</span>
          </span>
        </label>
        <label className="field">
          <span>Fecha límite para completar la lista (opcional)</span>
          <input name="wishlistDeadline" type="datetime-local" defaultValue={deadlineLocal} className="input" />
        </label>
        {isNew && (
          <>
            <div className="divider-dots" />
            <label className="option">
              <input type="checkbox" name="joinAsParticipant" defaultChecked />
              <span>
                <b>🙋 Yo también juego</b>
                <span className="block text-sm text-ink-soft">Apúntame como participante (no veré las asignaciones de los demás).</span>
              </span>
            </label>
          </>
        )}
      </Section>

      <div className="flex justify-end">
        <SubmitButton className="btn px-8">{isNew ? "Crear sala ✦" : "Guardar cambios"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
