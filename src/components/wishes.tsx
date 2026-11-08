"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ActionButton, ActionForm, SubmitButton } from "./forms";
import { deleteWishAction, saveWishAction, setWantsSurpriseAction, togglePurchasedAction, toggleSurpriseAction } from "@/app/actions/wishes";

export interface WishLinkView {
  id: string;
  url: string;
  title: string | null;
  imageUrl: string | null;
  siteName: string | null;
  priceText: string | null;
}

export interface WishView {
  id: string;
  title: string;
  details: string | null;
  priority: number;
  priceCents: number | null;
  imageUrl: string | null;
  links: WishLinkView[];
  purchased?: boolean;
}

export interface Budget {
  min: number | null;
  max: number | null;
  currency: string;
}

const PRIORITY: Record<number, { label: string; emoji: string; cls: string }> = {
  1: { label: "Me encantaría", emoji: "⭐", cls: "chip-ochre" },
  2: { label: "Me gustaría", emoji: "👍", cls: "chip-moss" },
  3: { label: "Si acaso", emoji: "🤷", cls: "" },
};

function euros(cents: number, currency: string) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function PriceChip({ cents, budget }: { cents: number | null; budget: Budget }) {
  if (cents == null) return null;
  const above = budget.max != null && cents > budget.max;
  const below = budget.min != null && cents < budget.min;
  return (
    <span className={`chip ${above ? "chip-red" : below ? "chip-sky" : ""}`} title={above ? "Por encima del presupuesto" : below ? "Por debajo del presupuesto" : undefined}>
      ≈ {euros(cents, budget.currency)} {above ? "⚠️" : ""}
    </span>
  );
}

export function WishCard({
  wish,
  budget,
  owner,
  gameId,
  giver,
  onEdit,
}: {
  wish: WishView;
  budget: Budget;
  owner?: boolean;
  giver?: boolean;
  gameId: string;
  onEdit?: () => void;
}) {
  const p = PRIORITY[wish.priority] ?? PRIORITY[2];
  const [pending, start] = useTransition();
  const router = useRouter();
  const purchased = Boolean(wish.purchased);
  return (
    <article
      className={`card grid grid-cols-[3.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 p-4 transition-opacity sm:grid-cols-[5rem_minmax(0,1fr)] sm:gap-x-4 ${giver && purchased ? "opacity-70" : ""}`}
    >
      {wish.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={wish.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-14 w-14 rounded-2xl object-cover bg-paper-3 border border-line sm:row-span-2 sm:h-20 sm:w-20" />
      ) : (
        <div className="grid h-14 w-14 place-items-center rounded-2xl bg-paper-3 text-2xl border border-line sm:row-span-2 sm:h-20 sm:w-20 sm:text-3xl" aria-hidden>🎁</div>
      )}
      <div className="flex flex-wrap items-start justify-between gap-2 self-center sm:self-start">
        <h4 className={`font-bold leading-snug ${giver && purchased ? "line-through decoration-2 decoration-moss" : ""}`}>{wish.title}</h4>
        <div className="flex flex-wrap gap-1.5">
          <span className={`chip ${p.cls}`}>{p.emoji} {p.label}</span>
          <PriceChip cents={wish.priceCents} budget={budget} />
        </div>
      </div>
      <div className="col-span-2 empty:hidden sm:col-span-1 sm:col-start-2">
        {wish.details && <p className="mt-1 whitespace-pre-line text-sm text-ink-soft">{wish.details}</p>}
        {wish.links.length > 0 && (
          <ul className="mt-2 flex flex-col gap-1.5">
            {wish.links.map((l) => (
              <li key={l.id}>
                <a href={l.url} target="_blank" rel="noopener noreferrer nofollow" className="group flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-1.5 text-sm hover:border-moss">
                  <span aria-hidden>🛍️</span>
                  <span className="min-w-0 flex-1 truncate">
                    <b className="font-semibold">{l.siteName || hostOf(l.url)}</b>
                    {l.title && <span className="text-ink-soft"> · {l.title}</span>}
                  </span>
                  {l.priceText && <span className="font-mono text-xs">{l.priceText}</span>}
                  <span aria-hidden className="text-ink-faint group-hover:text-moss">↗</span>
                </a>
              </li>
            ))}
          </ul>
        )}
        {(owner || giver) && (
          <div className="mt-3 flex flex-wrap gap-2">
            {owner && (
              <>
                <button type="button" className="btn btn-ghost btn-sm" onClick={onEdit}>Editar</button>
                <ActionButton action={() => deleteWishAction(gameId, wish.id)} confirm="¿Borrar esta idea?">
                  Borrar
                </ActionButton>
              </>
            )}
            {giver && (
              <label className="switch text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={purchased}
                  disabled={pending}
                  onChange={(e) => {
                    const v = e.target.checked;
                    start(async () => {
                      await togglePurchasedAction(gameId, wish.id, v);
                      router.refresh();
                    });
                  }}
                />
                {purchased ? "¡Comprado! ✓" : "Marcar como comprado"}
              </label>
            )}
          </div>
        )}
      </div>
    </article>
  );
}

/** Vista de quien regala: solo aparece si la otra persona marcó "sorpréndeme". */
export function SurpriseCard({
  giver,
  gameId,
  receiverId,
  purchased,
}: {
  giver?: boolean;
  gameId: string;
  receiverId?: string;
  purchased?: boolean;
}) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <article className="relative overflow-hidden rounded-3xl border-2 border-dashed border-ochre bg-ochre-soft/60 p-4">
      <div className="flex items-center gap-4">
        <span className="grid h-12 w-12 flex-none place-items-center rounded-2xl bg-paper-2 text-2xl sm:h-14 sm:w-14 sm:text-3xl" aria-hidden>🥰</span>
        <div className="flex-1">
          <h4 className="font-bold">Lo que quieras, sorpréndeme</h4>
          <p className="text-sm text-ink-soft">Lo importante es el detalle.</p>
        </div>
      </div>
      {giver && receiverId && (
        <label className="switch mt-3 text-sm font-semibold">
          <input
            type="checkbox"
            checked={Boolean(purchased)}
            disabled={pending}
            onChange={(e) => {
              const v = e.target.checked;
              start(async () => {
                await toggleSurpriseAction(gameId, receiverId, v);
                router.refresh();
              });
            }}
          />
          {purchased ? "¡Sorpresa comprada! ✓" : "Voy a por una sorpresa"}
        </label>
      )}
    </article>
  );
}

/** Mi lista: la opción "sorpréndeme" es una casilla que marco o no. */
export function SurpriseToggle({ gameId, checked, editable }: { gameId: string; checked: boolean; editable: boolean }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  // Optimista: cambia al tocar y vuelve atrás si el servidor no lo permite
  const [value, setValue] = useState(checked);
  useEffect(() => setValue(checked), [checked]);
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2">
      <label
        className={`flex cursor-pointer items-center gap-4 rounded-3xl border-2 border-dashed p-4 transition-colors ${
          value ? "border-ochre bg-ochre-soft/70" : "border-line bg-paper-2"
        } ${editable ? "" : "cursor-default"}`}
      >
        <input
          type="checkbox"
          name="wantsSurprise"
          className="h-6 w-6 flex-none accent-[var(--moss)]"
          checked={value}
          disabled={pending || !editable}
          onChange={(e) => {
            const v = e.target.checked;
            setValue(v);
            setError(null);
            start(async () => {
              const r = await setWantsSurpriseAction(gameId, v);
              if (!r.ok) {
                setValue(!v);
                setError(r.error);
              }
              router.refresh();
            });
          }}
        />
        <span className="hidden h-12 w-12 flex-none place-items-center rounded-2xl bg-paper text-2xl min-[400px]:grid" aria-hidden>🥰</span>
        <span className="min-w-0 flex-1">
          <span className="block font-bold">Lo que quieras, sorpréndeme</span>
          <span className="block text-sm text-ink-soft">Lo importante es el detalle.</span>
        </span>
      </label>
      {error && <p className="notice notice-err" role="alert">{error}</p>}
    </div>
  );
}

export function WishForm({ gameId, wish, onDone }: { gameId: string; wish?: WishView; onDone?: () => void }) {
  const [links, setLinks] = useState<string[]>(wish?.links.map((l) => l.url) ?? [""]);
  const [preview, setPreview] = useState<string | null>(wish?.imageUrl ?? null);
  const [removeImage, setRemoveImage] = useState(false);
  const formKey = wish?.id ?? "new";
  return (
    <ActionForm
      key={formKey}
      action={saveWishAction.bind(null, gameId, wish?.id ?? null)}
      resetOnSuccess={!wish}
      onSuccess={() => {
        if (!wish) {
          setLinks([""]);
          setPreview(null);
        }
        onDone?.();
      }}
      className="card flex flex-col gap-4 p-5"
    >
      <label className="field">
        <span>¿Qué te gustaría?</span>
        <input name="title" required maxLength={120} defaultValue={wish?.title} className="input" placeholder="Ej.: Un libro de setas del bosque" />
      </label>

      <fieldset>
        <legend className="label">¿Cuánta ilusión te haría?</legend>
        <div className="mt-2 grid grid-cols-1 gap-2 min-[400px]:grid-cols-3">
          {[1, 2, 3].map((n) => (
            <label key={n} className="option p-2.5 text-sm min-[400px]:justify-center min-[400px]:text-center">
              <input type="radio" name="priority" value={n} defaultChecked={(wish?.priority ?? 2) === n} className="sr-only" />
              <span className="flex items-center gap-2 min-[400px]:block">
                <span className="text-xl min-[400px]:block">{PRIORITY[n].emoji}</span>
                {PRIORITY[n].label}
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-[160px_1fr]">
        <label className="field">
          <span>Precio aprox. (€)</span>
          <input name="price" inputMode="decimal" defaultValue={wish?.priceCents != null ? String(wish.priceCents / 100).replace(".", ",") : ""} className="input" placeholder="19,99" />
        </label>
        <label className="field">
          <span>Detalles</span>
          <input name="details" maxLength={600} defaultValue={wish?.details ?? ""} className="input" placeholder="Talla, color, modelo, edición…" />
        </label>
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="label">Enlaces de compra (opcional)</legend>
        {links.map((l, i) => (
          <div key={i} className="flex gap-2">
            <input
              name="links"
              value={l}
              onChange={(e) => setLinks((ls) => ls.map((x, j) => (j === i ? e.target.value : x)))}
              className="input"
              inputMode="url"
              placeholder="https://tienda.com/producto"
            />
            {links.length > 1 && (
              <button type="button" className="btn btn-ghost btn-sm" aria-label="Quitar enlace" onClick={() => setLinks((ls) => ls.filter((_, j) => j !== i))}>
                ✕
              </button>
            )}
          </div>
        ))}
        {links.length < 5 && (
          <button type="button" className="btn btn-ghost btn-sm self-start" onClick={() => setLinks((ls) => [...ls, ""])}>
            + Otro enlace
          </button>
        )}
        <span className="hint">Sacamos solos la foto, el nombre y el precio de la tienda cuando se puede.</span>
      </fieldset>

      <div className="flex flex-wrap items-center gap-3">
        {preview && !removeImage ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-xl object-cover border border-line" />
        ) : null}
        <label className="btn btn-ghost btn-sm cursor-pointer">
          📷 {preview && !removeImage ? "Cambiar foto" : "Añadir foto"}
          <input
            type="file"
            name="image"
            accept="image/jpeg,image/png,image/webp,image/gif"
            className="sr-only"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                setPreview(URL.createObjectURL(f));
                setRemoveImage(false);
              }
            }}
          />
        </label>
        {wish?.imageUrl && <input type="hidden" name="currentImage" value={wish.imageUrl} />}
        {preview && !removeImage && wish?.imageUrl && (
          <label className="switch text-sm">
            <input type="checkbox" name="removeImage" checked={removeImage} onChange={(e) => setRemoveImage(e.target.checked)} /> Quitar foto
          </label>
        )}
      </div>

      <div className="flex flex-wrap justify-end gap-2">
        {wish && (
          <button type="button" className="btn btn-ghost" onClick={onDone}>Cancelar</button>
        )}
        <SubmitButton pendingText="Guardando…">{wish ? "Guardar cambios" : "Añadir a mi lista"}</SubmitButton>
      </div>
    </ActionForm>
  );
}

export function MyWishList({
  gameId,
  wishes,
  budget,
  editable,
  wantsSurprise,
}: {
  gameId: string;
  wishes: WishView[];
  budget: Budget;
  editable: boolean;
  wantsSurprise: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(wishes.length === 0 && !wantsSurprise);
  const empty = wishes.length === 0 && !wantsSurprise;
  return (
    <div className="flex flex-col gap-3">
      {empty && (
        <div className="notice notice-warn flex gap-3" role="alert">
          <span aria-hidden className="text-xl leading-none">⚠️</span>
          <span>
            <b>Tu lista está vacía.</b> No hay ninguna idea ni has marcado «Lo que quieras, sorpréndeme». Algo tiene que haber para que
            quien te regale sepa por dónde tirar: añade una idea o marca la casilla.
          </span>
        </div>
      )}
      <SurpriseToggle gameId={gameId} checked={wantsSurprise} editable={editable} />
      {wishes.map((w) =>
        editing === w.id ? (
          <WishForm key={w.id} gameId={gameId} wish={w} onDone={() => setEditing(null)} />
        ) : (
          <WishCard key={w.id} wish={w} budget={budget} gameId={gameId} owner={editable} onEdit={() => setEditing(w.id)} />
        ),
      )}
      {editable &&
        (adding ? (
          <WishForm gameId={gameId} />
        ) : (
          <button type="button" className="btn self-start" onClick={() => setAdding(true)}>+ Añadir una idea</button>
        ))}
    </div>
  );
}
