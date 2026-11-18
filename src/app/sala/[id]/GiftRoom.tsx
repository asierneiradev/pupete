import Link from "next/link";
import type { Game, Participant, User } from "@prisma/client";
import { db } from "@/lib/db";
import { getGiftLists, getThanks, myClaims } from "@/lib/services/giftlist";
import { vapidPublicKey } from "@/lib/push";
import { PushToggle } from "@/components/PushToggle";
import { listMyWishes } from "@/lib/services/wishes";
import { formatDate } from "@/lib/dates";
import { budgetLabel } from "@/lib/money";
import { Cover } from "@/components/Cover";
import { Countdown } from "@/components/Countdown";
import { MyWishList, type Budget } from "@/components/wishes";
import { GiftWishList } from "@/components/giftlist";
import { ActionButton } from "@/components/forms";
import { statusOf } from "@/components/GameCard";
import { copyWishesAction } from "@/app/actions/wishes";
import { leaveGameAction } from "@/app/actions/games";

type RoomGame = Game & { participants: Array<Participant & { user: { name: string; avatar: string } }> };

const PROFILE_LABELS: Array<[string, string]> = [
  ["shirtSize", "👕 Camiseta"],
  ["pantsSize", "👖 Pantalón"],
  ["shoeSize", "👟 Calzado"],
  ["favoriteColors", "🎨 Colores"],
  ["likes", "💚 Le encanta"],
  ["dislikes", "🚫 Mejor no"],
  ["allergies", "⚠️ Alergias"],
];

const first = (n: string) => n.split(" ")[0];

function euros(cents: number, currency: string) {
  return new Intl.NumberFormat("es-ES", { style: "currency", currency, minimumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

/**
 * Sala de lista de regalos. Dos zonas, como en el amigo invisible:
 * roja = las listas de los demás (qué regalo yo), musgo = mi lista (si recibo).
 * Quien recibe no ve aquí nada sobre quién le regala qué.
 */
export async function GiftRoom({
  game,
  user,
  me,
  manager,
  sp,
}: {
  game: RoomGame;
  user: User;
  me: RoomGame["participants"][number] | undefined;
  manager: boolean;
  sp: { bienvenida?: string; zona?: string; de?: string };
}) {
  const budget: Budget = { min: game.budgetMin, max: game.budgetMax, currency: game.currency };
  const budgetText = budgetLabel(game.budgetMin, game.budgetMax, game.currency);
  const status = statusOf(game);
  const active = game.status !== "FINISHED";
  const iReceive = Boolean(me?.honoree);

  const lists = await getGiftLists(user, game.id);
  const claims = me ? await myClaims(user, game.id) : [];
  const myWishes = iReceive ? await listMyWishes(user, game.id) : [];
  const anyHonoree = game.participants.some((p) => p.honoree);
  // Agradecimientos: solo con la sala cerrada, pasada la fecha y si se activó al cerrar
  const thanks = iReceive ? await getThanks(user, game.id) : null;
  const pushKey = me && active ? vapidPublicKey() : null;

  const canGive = lists.length > 0;
  const zona: "regalo" | "mia" = iReceive && (sp.zona === "mia" || !canGive || (thanks && sp.zona !== "regalo")) ? "mia" : "regalo";
  const selected = lists.find((l) => l.participantId === sp.de) ?? lists[0];
  const future = game.eventDate && game.eventDate.getTime() > Date.now() - 86400_000;
  // A quien recibe (y no es "todos con todos") no le enseñamos quién está en la sala
  const hidePeople = iReceive && !game.allHonorees && !manager;

  const prevParticipation =
    iReceive && game.previousGameId && myWishes.length === 0
      ? await db.participant.findUnique({
          where: { gameId_userId: { gameId: game.previousGameId, userId: user.id } },
          include: { _count: { select: { wishes: { where: { secret: false } } } }, game: { select: { name: true } } },
        })
      : null;

  // En los regalos entre varios cuenta lo que pongo yo en el bote, no el precio entero
  const claimTotal = claims.reduce((s, c) => s + (c.joint ? (c.amountCents ?? 0) : (c.priceCents ?? 0)), 0);

  return (
    <div className="flex flex-col gap-8">
      <section className="card overflow-hidden rise">
        <div className="relative h-44 sm:h-56">
          <Cover cover={game.cover} image={game.coverImage} className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-paper-2 to-transparent" />
          <span className={`chip ${status.cls} absolute right-4 top-4`}>{status.label}</span>
        </div>
        <div className="-mt-10 relative p-5 sm:p-7">
          <p className="dot-label">Lista de regalos</p>
          <h1 className="mt-1 text-3xl sm:text-4xl font-bold leading-tight">{game.name}</h1>
          {game.description && <p className="story mt-2 text-lg text-ink-soft">{game.description}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {game.eventDate && <span className="chip">📅 {formatDate(game.eventDate)}</span>}
            {game.location && <span className="chip">📍 {game.location}</span>}
            {budgetText && <span className="chip chip-ochre">💶 {budgetText}</span>}
            {game.allHonorees && <span className="chip chip-sky chip-wrap">Todos con todos</span>}
          </div>
          {future && game.eventDate && (
            <div className="mt-5">
              <Countdown to={game.eventDate.toISOString()} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            {hidePeople ? (
              <span className="text-sm text-ink-soft">{active ? "🤫 Hay gente preparando sorpresas…" : "🎉 ¡Ya está celebrado!"}</span>
            ) : (
              <>
                <div className="flex -space-x-2">
                  {game.participants.slice(0, 14).map((p) => (
                    <span key={p.id} className="avatar h-9 w-9 text-lg" title={p.user.name}>{p.user.avatar}</span>
                  ))}
                </div>
                <span className="text-sm text-ink-soft">{game.participants.length} personas</span>
              </>
            )}
            {manager && (
              <Link href={`/sala/${game.id}/admin`} className="btn btn-sm ml-auto">⚙ Gestionar sala</Link>
            )}
          </div>
        </div>
      </section>

      {sp.bienvenida && me && (
        <section className="notice notice-ok rise">
          <b>¡Ya estás dentro! 🎉</b> Para volver a entrar desde cualquier móvil u ordenador usa tu nombre y tu PIN.
        </section>
      )}

      {pushKey && (
        <PushToggle
          publicKey={pushKey}
          compact
          title="Entérate sin tener que entrar"
          hint="Te avisaremos cuando haya novedades en las listas y cuando se acerque la fecha."
        />
      )}

      {!me && manager && (
        <p className="notice notice-info">No estás apuntado en esta sala, solo la gestionas: puedes proponer ideas, pero no pedirte regalos.</p>
      )}

      {!anyHonoree && (
        <p className="notice notice-warn" role="alert">
          Todavía no se ha indicado para quién son los regalos.{" "}
          {manager ? (
            <Link className="link" href={`/sala/${game.id}/admin`}>Márcalo en «Participantes»</Link>
          ) : (
            "Quien organiza la sala lo marcará pronto."
          )}
        </p>
      )}

      {/* Selector de zona: solo si recibo y además hay otras listas */}
      {iReceive && canGive && (
        <nav className="zone-tabs rise rise-2" aria-label="Zonas de la sala">
          <Link href={`/sala/${game.id}?zona=regalo`} scroll={false} className="zone-tab zone-tab-give" aria-current={zona === "regalo" ? "page" : undefined}>
            <small>Yo regalo</small>
            <span className="text-lg">🎁 Sus listas</span>
          </Link>
          <Link href={`/sala/${game.id}?zona=mia`} scroll={false} className="zone-tab zone-tab-mine" aria-current={zona === "mia" ? "page" : undefined}>
            <small>Lo que yo pido</small>
            <span className="text-lg">{user.avatar} Mi lista</span>
          </Link>
        </nav>
      )}

      {/* ZONA ROJA · las listas de los demás */}
      {canGive && zona === "regalo" && selected && (
        <>
          {lists.length > 1 && (
            <nav className="flex flex-wrap gap-2 rise rise-2" aria-label="¿De quién quieres ver la lista?">
              {lists.map((l) => (
                <Link
                  key={l.participantId}
                  href={`/sala/${game.id}?zona=regalo&de=${l.participantId}`}
                  scroll={false}
                  aria-current={l.participantId === selected.participantId ? "page" : undefined}
                  className={`btn btn-sm ${l.participantId === selected.participantId ? "btn-red" : "btn-ghost bg-paper-2"}`}
                >
                  {l.avatar} {first(l.name)}
                </Link>
              ))}
            </nav>
          )}

          <section className="zone zone-give rise rise-3" aria-label={`Lista de ${selected.name}`}>
            <div className="zone-head">
              <span className="avatar h-16 w-16 text-4xl">{selected.avatar}</span>
              <div className="min-w-0">
                <p className="dot-label">Regalos para</p>
                <h2 className="font-dot text-4xl sm:text-5xl font-bold leading-none">{selected.name.toUpperCase()}</h2>
              </div>
            </div>
            <div className="zone-body">
              <p className="story text-lg text-ink-soft">
                Pídete lo que vayas a regalar para que nadie repita. {first(selected.name)} no ve quién se pide cada cosa, ni qué está comprado, ni las
                ideas que propongáis 🤫 Cuando pase la celebración, quien organiza puede enseñarle quién le regaló cada cosa para que dé las gracias.
              </p>
              {PROFILE_LABELS.some(([k]) => selected.profile[k as keyof typeof selected.profile]) && (
                <div>
                  <h3 className="dot-label">Su ficha</h3>
                  <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                    {PROFILE_LABELS.filter(([k]) => selected.profile[k as keyof typeof selected.profile]).map(([k, label]) => (
                      <div key={k} className="rounded-2xl bg-paper-2 px-4 py-2.5 border border-line">
                        <dt className="text-xs font-semibold text-ink-faint">{label}</dt>
                        <dd className="mt-0.5 whitespace-pre-line">{selected.profile[k as keyof typeof selected.profile]}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}
              <div>
                <h3 className="dot-label">Su lista</h3>
                <div className="mt-3">
                  <GiftWishList
                    key={selected.participantId}
                    gameId={game.id}
                    honoreeId={selected.participantId}
                    honoreeName={selected.name}
                    wishes={selected.wishes}
                    budget={budget}
                    active={active}
                    canClaim={Boolean(me)}
                  />
                </div>
              </div>
            </div>
          </section>

          {claims.length > 0 && (
            <section className="card p-5 sm:p-6 rise rise-3" aria-label="Lo que regalo yo">
              <h3 className="dot-label">Lo que regalo yo</h3>
              <ul className="mt-3 flex flex-col divide-y divide-line">
                {claims.map((c) => (
                  <li key={c.wishId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                    <span aria-hidden>{c.purchased ? "✅" : "🛒"}</span>
                    <span className={`min-w-0 flex-1 font-semibold ${c.purchased ? "line-through decoration-2 decoration-moss" : ""}`}>{c.title}</span>
                    <span className="text-sm text-ink-soft">
                      para {c.forAvatar} {first(c.forName)}
                      {c.joint ? " · entre varios" : ""}
                    </span>
                    {c.joint
                      ? c.amountCents != null && <span className="chip">pongo {euros(c.amountCents, game.currency)}</span>
                      : c.priceCents != null && <span className="chip">≈ {euros(c.priceCents, game.currency)}</span>}
                  </li>
                ))}
              </ul>
              {claimTotal > 0 && (
                <p className="mt-3 text-sm text-ink-soft">
                  Total aproximado: <b>{euros(claimTotal, game.currency)}</b>
                  {claims.some((c) => c.joint) ? " (en los regalos entre varios cuenta lo que pones tú)" : ""}
                </p>
              )}
            </section>
          )}
        </>
      )}

      {/* ZONA MUSGO · mi lista (solo si recibo regalos) */}
      {iReceive && zona === "mia" && (
        <section className="zone zone-mine rise rise-3" aria-label="Mi lista">
          <div className="zone-head">
            <span className="avatar h-14 w-14 text-3xl">{user.avatar}</span>
            <div className="min-w-0">
              <p className="dot-label">Mi lista</p>
              <h2 className="text-2xl sm:text-3xl font-bold leading-tight">Lo que yo pido</h2>
            </div>
            {prevParticipation && prevParticipation._count.wishes > 0 && active && (
              <ActionButton action={copyWishesAction.bind(null, game.id, prevParticipation.gameId)} className="btn btn-ghost btn-sm ml-auto">
                ↺ Copiar mi lista de «{prevParticipation.game.name}»
              </ActionButton>
            )}
          </div>
          <div className="zone-body">
            {thanks && (
              <div className="rounded-3xl border-2 border-dashed border-ochre bg-ochre-soft/60 p-4 sm:p-5">
                <h3 className="text-xl font-bold">💌 Quién te regaló cada cosa</h3>
                {thanks.length === 0 ? (
                  <p className="mt-2 text-ink-soft">Nadie apuntó sus regalos en la app, así que aquí no hay nada que enseñar.</p>
                ) : (
                  <>
                    <p className="mt-1 text-ink-soft">Ya no es secreto: aquí tienes a quién dar las gracias.</p>
                    <ul className="mt-3 flex flex-col divide-y divide-line">
                      {thanks.map((t) => (
                        <li key={t.id} className="flex items-center gap-3 py-3">
                          {t.imageUrl ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={t.imageUrl} alt="" referrerPolicy="no-referrer" loading="lazy" className="h-12 w-12 flex-none rounded-xl border border-line bg-paper-3 object-cover" />
                          ) : (
                            <span className="grid h-12 w-12 flex-none place-items-center rounded-xl border border-line bg-paper-2 text-xl" aria-hidden>🎁</span>
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="font-bold leading-snug">{t.title}</p>
                            <p className="text-sm text-ink-soft">
                              {t.surprise ? "✨ Sorpresa · " : ""}
                              de {t.givers.map((g) => `${g.avatar} ${first(g.name)}`).join(", ")}
                            </p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </>
                )}
              </div>
            )}
            {active && (
              <p className="text-ink-soft">
                Apunta aquí lo que te haría ilusión, con enlaces y fotos. Los demás se lo repartirán sin que tú veas quién regala qué: la sorpresa
                está a salvo 🤫{budgetText ? ` Presupuesto orientativo: ${budgetText.toLowerCase()}.` : ""}
              </p>
            )}
            <MyWishList gameId={game.id} budget={budget} editable={active} wantsSurprise={false} simple wishes={myWishes} />
          </div>
        </section>
      )}

      {me && game.status === "OPEN" && (
        <section className="text-center">
          <ActionButton
            action={leaveGameAction.bind(null, game.id)}
            confirm="¿Seguro que quieres salir de esta sala? Se borrará tu lista y se soltarán los regalos que te hubieras pedido."
            className="btn btn-ghost btn-sm bg-paper-2 text-ink-soft"
          >
            Salir de la sala
          </ActionButton>
        </section>
      )}
    </div>
  );
}
