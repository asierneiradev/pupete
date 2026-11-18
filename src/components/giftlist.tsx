"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/errors";
import { ActionButton } from "./forms";
import { WishCard, WishForm, type Budget, type WishView } from "./wishes";
import {
  claimPurchasedAction, claimWishAction, deleteSecretWishAction, saveSecretWishAction, setClaimAmountAction, unclaimWishAction,
} from "@/app/actions/wishes";

export interface GiftWishView extends WishView {
  /** Idea propuesta por otra persona: el dueño de la lista no la ve */
  secret: boolean;
  addedByName: string | null;
  canEdit: boolean;
  /** Regalo entre varios */
  joint: boolean;
  /** Me lo he pedido yo (solo o con más gente) */
  mine: boolean;
  /** Bote común: suma de lo que pone cada uno (solo entre varios) */
  potCents: number;
  claimers: Array<{ name: string; avatar: string; me: boolean; amountCents: number | null }>;
}

function euros(cents: number, currency: string) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

const amountText = (cents: number | null) => (cents == null ? "" : String(cents / 100).replace(".", ","));

/** Bote común de un regalo entre varios: cuánto pone cada uno y cuánto falta. */
function PotBox({ gameId, wish, currency, editable }: { gameId: string; wish: GiftWishView; currency: string; editable: boolean }) {
  const mine = wish.claimers.find((c) => c.me);
  const [value, setValue] = useState(amountText(mine?.amountCents ?? null));
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const router = useRouter();
  useEffect(() => setValue(amountText(mine?.amountCents ?? null)), [mine?.amountCents]);

  const goal = wish.priceCents;
  const missing = goal != null ? goal - wish.potCents : null;
  const pct = goal ? Math.min(100, Math.round((wish.potCents / goal) * 100)) : 0;
  const share = goal != null && wish.claimers.length > 0 ? Math.ceil(goal / wish.claimers.length) : null;
  return (
    <div className="rounded-2xl border border-line bg-paper px-3 py-3 text-sm">
      <p className="font-semibold">
        💰 Bote: {euros(wish.potCents, currency)}
        {goal != null && <> de {euros(goal, currency)}</>}
        {missing != null && (missing > 0 ? <span className="text-red"> · faltan {euros(missing, currency)}</span> : <span className="text-moss-deep"> · ¡completo! ✓</span>)}
      </p>
      {goal != null && goal > 0 && (
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-paper-3" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Bote reunido">
          <div className="h-full rounded-full bg-moss" style={{ width: `${pct}%` }} />
        </div>
      )}
      <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-ink-soft">
        {wish.claimers.map((c, i) => (
          <li key={i}>
            {c.avatar} {c.me ? "Tú" : first(c.name)}: <b>{c.amountCents != null ? euros(c.amountCents, currency) : "sin decir"}</b>
          </li>
        ))}
      </ul>
      {mine && editable && (
        <form
          className="mt-3 flex flex-wrap items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            setSaved(false);
            start(async () => {
              const r = await setClaimAmountAction(gameId, wish.id, value);
              setError(r.ok ? null : r.error);
              setSaved(r.ok);
              router.refresh();
            });
          }}
        >
          <label className="field w-32">
            <span>Yo pongo (€)</span>
            <input className="input" inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder={share != null ? amountText(share) : "20"} />
          </label>
          <button type="submit" className="btn btn-sm" disabled={pending}>{pending ? "Guardando…" : "Guardar"}</button>
          {saved && !pending && <span className="text-moss-deep font-semibold" role="status">Guardado ✓</span>}
          {share != null && wish.claimers.length > 1 && <span className="hint basis-full">A partes iguales tocaría a {euros(share, currency)} por persona.</span>}
        </form>
      )}
      {error && <p className="notice notice-err mt-2" role="alert">{error}</p>}
    </div>
  );
}

const first = (n: string) => n.split(" ")[0];

function names(claimers: GiftWishView["claimers"]) {
  const list = claimers.map((c) => (c.me ? "tú" : first(c.name)));
  if (list.length <= 1) return list[0] ?? "";
  return `${list.slice(0, -1).join(", ")} y ${list[list.length - 1]}`;
}

/** "Yo lo regalo" / "Entre varios" / soltar / comprado. Nunca se pinta al dueño de la lista. */
function ClaimControls({ gameId, wish, active, canClaim, currency }: { gameId: string; wish: GiftWishView; active: boolean; canClaim: boolean; currency: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const run = (fn: () => Promise<ActionResult>) =>
    start(async () => {
      const r = await fn();
      setError(r.ok ? null : r.error);
      router.refresh();
    });
  const taken = wish.claimers.length > 0;
  const who = names(wish.claimers);

  return (
    <div className="flex flex-col gap-2">
      {taken && (
        <p className={`rounded-2xl px-3 py-2 text-sm font-semibold ${wish.mine ? "bg-moss-soft text-moss-deep" : "bg-paper-3 text-ink-soft"}`}>
          {wish.joint ? "👥 Entre varios: " : wish.mine ? "🙋 " : "🔒 "}
          {wish.joint ? who : wish.mine ? "Lo regalas tú" : `Lo regala ${who}`}
          {wish.purchased ? " · ✓ ya comprado" : ""}
        </p>
      )}
      {taken && wish.joint && <PotBox gameId={gameId} wish={wish} currency={currency} editable={active && canClaim} />}
      {active && canClaim && (
        <div className="flex flex-wrap items-center gap-2">
          {!taken && (
            <>
              <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => claimWishAction(gameId, wish.id, false))}>
                🙋 Yo lo regalo
              </button>
              <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => run(() => claimWishAction(gameId, wish.id, true))}>
                👥 Entre varios
              </button>
            </>
          )}
          {taken && wish.joint && !wish.mine && (
            <button type="button" className="btn btn-sm" disabled={pending} onClick={() => run(() => claimWishAction(gameId, wish.id, true))}>
              👥 Me apunto
            </button>
          )}
          {wish.mine && (
            <>
              <label className="switch text-sm font-semibold">
                <input
                  type="checkbox"
                  checked={Boolean(wish.purchased)}
                  disabled={pending}
                  onChange={(e) => {
                    const v = e.target.checked;
                    run(() => claimPurchasedAction(gameId, wish.id, v));
                  }}
                />
                {wish.purchased ? "¡Comprado! ✓" : "Ya está comprado"}
              </label>
              <button
                type="button"
                className="btn btn-ghost btn-sm ml-auto"
                disabled={pending}
                onClick={() => {
                  if (!window.confirm(wish.joint ? "¿Salirte de este regalo?" : "¿Soltar este regalo para que otra persona pueda pedírselo?")) return;
                  run(() => unclaimWishAction(gameId, wish.id));
                }}
              >
                {wish.joint ? "Salirme" : "Soltarlo"}
              </button>
            </>
          )}
        </div>
      )}
      {error && <p className="notice notice-err" role="alert">{error}</p>}
    </div>
  );
}

/** La lista de otra persona vista por quien regala. */
export function GiftWishList({
  gameId,
  honoreeId,
  honoreeName,
  wishes,
  budget,
  active,
  canClaim,
}: {
  gameId: string;
  honoreeId: string;
  honoreeName: string;
  wishes: GiftWishView[];
  budget: Budget;
  /** La sala sigue abierta */
  active: boolean;
  /** Estoy apuntado en la sala (quien solo organiza no se pide regalos) */
  canClaim: boolean;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const name = first(honoreeName);
  return (
    <div className="flex flex-col gap-3">
      {wishes.length === 0 && (
        <p className="notice notice-warn">
          Todavía no hay nada en la lista de {name}. {active ? "Si sabes algo que le haría ilusión, proponlo aquí abajo." : ""}
        </p>
      )}
      {wishes.map((w) =>
        editing === w.id ? (
          <WishForm
            key={w.id}
            gameId={gameId}
            wish={w}
            forName={name}
            action={saveSecretWishAction.bind(null, gameId, honoreeId, w.id)}
            onDone={() => setEditing(null)}
          />
        ) : (
          <WishCard
            key={w.id}
            wish={{ ...w, purchased: undefined }}
            budget={budget}
            gameId={gameId}
            dimmed={w.claimers.length > 0 && !w.mine && !w.joint}
            badge={
              w.secret ? (
                <span className="chip chip-sky" title={`${name} no ve esta idea`}>
                  🤫 Idea{w.addedByName ? ` de ${first(w.addedByName)}` : " secreta"}
                </span>
              ) : undefined
            }
            footer={
              <div className="flex flex-col gap-2">
                <ClaimControls gameId={gameId} wish={w} active={active} canClaim={canClaim} currency={budget.currency} />
                {active && w.canEdit && (
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-ghost btn-sm" onClick={() => setEditing(w.id)}>Editar idea</button>
                    <ActionButton action={() => deleteSecretWishAction(gameId, w.id)} confirm="¿Borrar esta idea? Si alguien se la había pedido, se queda sin ella.">
                      Borrar
                    </ActionButton>
                  </div>
                )}
              </div>
            }
          />
        ),
      )}
      {active &&
        (adding ? (
          <div className="flex flex-col gap-2">
            <p className="notice notice-info">
              🤫 <b>Idea secreta:</b> la veréis todos los que regaláis, pero {name} no.
            </p>
            <WishForm
              gameId={gameId}
              forName={name}
              action={saveSecretWishAction.bind(null, gameId, honoreeId, null)}
              onDone={() => setAdding(false)}
              onCancel={() => setAdding(false)}
            />
          </div>
        ) : (
          <button type="button" className="btn btn-ghost self-start" onClick={() => setAdding(true)}>
            💡 Proponer una idea para {name}
          </button>
        ))}
    </div>
  );
}
