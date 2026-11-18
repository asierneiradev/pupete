"use client";

import { useRef, useState } from "react";
import type { Game } from "@prisma/client";
import { ActionForm, SubmitButton } from "./forms";
import { Cover } from "./Cover";
import type { ActionResult } from "@/lib/errors";

const COVERS: Array<[string, string]> = [
  ["bosque", "Bosque"],
  ["nieve", "Nieve"],
  ["faroles", "Farolillos"],
  ["colinas", "Colinas"],
  ["globos", "Globos"],
  ["playa", "Playa"],
  ["estrellas", "Noche estrellada"],
  ["flores", "Flores"],
];

type Props = {
  action: (prev: unknown, fd: FormData) => Promise<ActionResult<unknown>>;
  game?: Game;
  eventDateLocal?: string;
  deadlineLocal?: string;
  drawn?: boolean;
  isNew?: boolean;
};

/**
 * Las fotos del móvil pesan demasiado: la reducimos en el navegador antes de
 * subirla. Si algo falla, se sube la original.
 */
async function shrinkPhoto(file: File, max = 1600): Promise<File> {
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    canvas.getContext("2d")!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.85));
    if (!blob || blob.size >= file.size) return file;
    return new File([blob], "portada.jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}

function CoverPhoto({ current }: { current: string | null }) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(current);
  const [remove, setRemove] = useState(false);
  const [busy, setBusy] = useState(false);
  const shown = preview && !remove;
  return (
    <div className="flex flex-col gap-2">
      <span className="label">O pon una foto tuya de portada (opcional)</span>
      <div className="flex flex-wrap items-center gap-3">
        {shown && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Foto de portada elegida" className="h-16 w-28 rounded-xl border border-line object-cover" />
        )}
        <label className="btn btn-ghost btn-sm cursor-pointer">
          📷 {busy ? "Preparando…" : shown ? "Cambiar foto" : "Subir una foto"}
          <input
            ref={input}
            type="file"
            name="coverPhoto"
            accept="image/jpeg,image/png,image/webp"
            className="sr-only"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              const small = await shrinkPhoto(f);
              try {
                const dt = new DataTransfer();
                dt.items.add(small);
                if (input.current) input.current.files = dt.files;
              } catch {
                /* navegador antiguo: se sube la original */
              }
              setPreview(URL.createObjectURL(small));
              setRemove(false);
              setBusy(false);
            }}
          />
        </label>
        {shown && (
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              if (input.current) input.current.value = "";
              setPreview(null);
              setRemove(true);
            }}
          >
            Quitar foto
          </button>
        )}
        {remove && current && <input type="hidden" name="removeCoverPhoto" value="on" />}
      </div>
      <span className="hint">
        {shown ? "Se verá esta foto en lugar del dibujo." : "Por ejemplo, una foto de quien cumple años. Si no subes ninguna, se usa el dibujo elegido."}
      </span>
    </div>
  );
}

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
  const [kind, setKind] = useState<"SECRET_SANTA" | "GIFT_LIST">(game?.kind ?? "SECRET_SANTA");
  const gift = kind === "GIFT_LIST";
  const [useBudget, setUseBudget] = useState(game ? game.budgetMin != null || game.budgetMax != null : true);
  const [giftFor, setGiftFor] = useState<"some" | "all">(game?.allHonorees ? "all" : "some");
  // La numeración se adapta: una lista de regalos no tiene grupos ni sorteo
  let step = 0;
  const n = () => String(++step).padStart(2, "0");
  return (
    <ActionForm action={action} className="flex flex-col gap-5">
      <input type="hidden" name="kind" value={kind} />
      {isNew && (
        <Section n={n()} title="¿Qué quieres montar?">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {(
              [
                ["SECRET_SANTA", "🎅 Amigo invisible", "Sorteo secreto: a cada persona le toca regalar a otra."],
                ["GIFT_LIST", "🎁 Lista de regalos", "Cumpleaños, boda, Reyes… Sin sorteo: cada uno se pide qué regala y quien recibe no se entera."],
              ] as const
            ).map(([v, t, d]) => (
              <label key={v} className="option">
                <input
                  type="radio"
                  name="kindChoice"
                  value={v}
                  checked={kind === v}
                  onChange={() => {
                    setKind(v);
                    if (v === "GIFT_LIST") setUseBudget(false);
                  }}
                />
                <span>
                  <b>{t}</b>
                  <span className="block text-sm text-ink-soft">{d}</span>
                </span>
              </label>
            ))}
          </div>
          <span className="hint">El tipo de sala no se puede cambiar después.</span>
        </Section>
      )}

      <Section n={n()} title="Lo básico">
        <label className="field">
          <span>Nombre de la sala</span>
          <input name="name" required maxLength={80} defaultValue={game?.name} className="input" placeholder={gift ? "Cumple de Miriam" : "Navidad en casa de la abuela 2026"} />
        </label>
        <label className="field">
          <span>{gift ? "Mensaje para los invitados (opcional)" : "Mensaje para la familia (opcional)"}</span>
          <textarea name="description" maxLength={500} defaultValue={game?.description ?? ""} className="textarea" placeholder={gift ? "Cumple 40 y lo celebramos el sábado. ¡Ni una palabra! 🤫" : "Este año, cena el 24 y regalos después del turrón 🎄"} />
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <label className="field">
            <span>{gift ? "Fecha de la celebración" : "Fecha del intercambio"}</span>
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
        <CoverPhoto current={game?.coverImage ?? null} />
      </Section>

      {gift && (
        <Section n={n()} title="¿Para quién son los regalos?">
          <div className="grid grid-cols-1 gap-2">
            {(
              [
                ["some", "🎂 Para una persona (o unas pocas)", "Un cumpleaños, una boda, un bebé… Tú eliges quién recibe; los demás regalan."],
                ["all", "🎄 Todos con todos", "Cada persona tiene su lista y todos ven las de los demás (Reyes, Navidad en familia…)."],
              ] as const
            ).map(([v, t, d]) => (
              <label key={v} className="option">
                <input type="radio" name="giftFor" value={v} checked={giftFor === v} onChange={() => setGiftFor(v)} />
                <span>
                  <b>{t}</b>
                  <span className="block text-sm text-ink-soft">{d}</span>
                </span>
              </label>
            ))}
          </div>
          {giftFor === "some" && (
            <span className="hint">
              {isNew
                ? "Al crear la sala, en «Participantes» marcas quién recibe regalos."
                : "En «Participantes» marcas quién recibe regalos."}
            </span>
          )}
          {isNew && giftFor === "some" && (
            <label className="option">
              <input type="checkbox" name="ownerIsHonoree" />
              <span>
                <b>🙈 Los regalos son para mí</b>
                <span className="block text-sm text-ink-soft">Pones tu lista y no verás quién se pide cada cosa, aunque organices la sala.</span>
              </span>
            </label>
          )}
        </Section>
      )}

      <Section n={n()} title="¿Cómo entra la gente?">
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

      {!gift && (
      <Section n={n()} title="Grupos">
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
      )}

      <Section n={n()} title="Presupuesto">
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

      {(!gift || isNew) && (
      <Section n={n()} title={gift ? "Y tú…" : "Detalles mágicos"}>
        {!gift && (
        <>
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
        </>
        )}
        {isNew && (
          <>
            {!gift && <div className="divider-dots" />}
            <label className="option">
              <input type="checkbox" name="joinAsParticipant" defaultChecked />
              <span>
                <b>{gift ? "🙋 Yo también participo" : "🙋 Yo también juego"}</b>
                <span className="block text-sm text-ink-soft">
                  {gift
                    ? "Apúntame en la sala para poder pedirme regalos (o poner mi lista)."
                    : "Apúntame como participante (no veré las asignaciones de los demás)."}
                </span>
              </span>
            </label>
          </>
        )}
      </Section>
      )}

      <div className="flex justify-end">
        <SubmitButton className="btn px-8">{isNew ? "Crear sala ✦" : "Guardar cambios"}</SubmitButton>
      </div>
    </ActionForm>
  );
}
