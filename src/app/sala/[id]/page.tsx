import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManage } from "@/lib/services/games";
import { listMyWishes } from "@/lib/services/wishes";
import { getMyReceivers } from "@/lib/services/drawing";
import { listMyChats } from "@/lib/services/chat";
import { formatDate } from "@/lib/dates";
import { budgetLabel } from "@/lib/money";
import { Cover } from "@/components/Cover";
import { Countdown } from "@/components/Countdown";
import { Reveal } from "@/components/Reveal";
import { MyWishList, SurpriseCard, WishCard, type Budget } from "@/components/wishes";
import { ActionButton, CopyButton } from "@/components/forms";
import { STATUS } from "@/components/GameCard";
import { copyWishesAction } from "@/app/actions/wishes";
import { leaveGameAction } from "@/app/actions/games";
import { PushToggle } from "@/components/PushToggle";
import { vapidPublicKey } from "@/lib/push";

export const metadata: Metadata = { title: "Sala" };

const PROFILE_LABELS: Array<[string, string]> = [
  ["shirtSize", "👕 Camiseta"],
  ["pantsSize", "👖 Pantalón"],
  ["shoeSize", "👟 Calzado"],
  ["favoriteColors", "🎨 Colores"],
  ["likes", "💚 Le encanta"],
  ["dislikes", "🚫 Mejor no"],
  ["allergies", "⚠️ Alergias"],
];

export default async function SalaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ bienvenida?: string; zona?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/sala/${id}`);
  const game = await db.game.findUnique({
    where: { id },
    include: { participants: { include: { user: { select: { name: true, avatar: true } } }, orderBy: { joinedAt: "asc" } } },
  });
  if (!game) notFound();
  const me = game.participants.find((p) => p.userId === user.id);
  const manager = canManage(user, game);
  if (!me && !manager) notFound();

  const budget: Budget = { min: game.budgetMin, max: game.budgetMax, currency: game.currency };
  const budgetText = budgetLabel(game.budgetMin, game.budgetMax, game.currency);
  const myWishes = me ? await listMyWishes(user, game.id) : [];
  const drawn = game.status !== "OPEN";
  const receivers = me && drawn ? (await getMyReceivers(user, game.id)).receivers : [];
  const chats = me && drawn && game.anonChat ? await listMyChats(user, game.id) : null;

  // ¿Participé en la edición anterior y puedo copiar mi lista?
  const prevParticipation =
    me && game.previousGameId && myWishes.length === 0
      ? await db.participant.findUnique({
          where: { gameId_userId: { gameId: game.previousGameId, userId: user.id } },
          include: { _count: { select: { wishes: true } }, game: { select: { name: true } } },
        })
      : null;

  const status = STATUS[game.status];
  // Dos zonas bien separadas: a quién regalo (rojo) y mi lista (musgo)
  const canGive = Boolean(me && drawn && receivers.length > 0);
  const zona: "regalo" | "mia" = canGive && sp.zona !== "mia" ? "regalo" : "mia";
  const revealed = Boolean(me?.revealedAt);
  const pushKey = chats ? vapidPublicKey() : null;
  const first = (n: string) => n.split(" ")[0];
  const myListEmpty = Boolean(me && !me.wantsSurprise && myWishes.length === 0);
  const future = game.eventDate && game.eventDate.getTime() > Date.now() - 86400_000;

  return (
    <div className="flex flex-col gap-8">
      {/* Cabecera de la sala */}
      <section className="card overflow-hidden rise">
        <div className="relative h-44 sm:h-56">
          <Cover cover={game.cover} className="absolute inset-0 h-full w-full" />
          <div className="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-paper-2 to-transparent" />
          <span className={`chip ${status.cls} absolute right-4 top-4`}>{status.label}</span>
        </div>
        <div className="-mt-10 relative p-5 sm:p-7">
          <p className="dot-label">Amigo invisible</p>
          <h1 className="mt-1 text-3xl sm:text-4xl font-bold leading-tight">{game.name}</h1>
          {game.description && <p className="story mt-2 text-lg text-ink-soft">{game.description}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {game.eventDate && <span className="chip">📅 {formatDate(game.eventDate)}</span>}
            {game.location && <span className="chip">📍 {game.location}</span>}
            {budgetText && <span className="chip chip-ochre">💶 {budgetText}</span>}
            {game.groupMode === "SEPARATE" && <span className="chip chip-sky chip-wrap">Adultos con adultos · peques con peques</span>}
            {game.groupMode === "KIDS_FROM_ADULTS" && <span className="chip chip-sky chip-wrap">Los mayores regalan a los peques</span>}
            {game.wishlistDeadline && game.status === "OPEN" && <span className="chip chip-red">⏳ Lista antes del {formatDate(game.wishlistDeadline, { weekday: undefined })}</span>}
          </div>
          {future && game.eventDate && (
            <div className="mt-5">
              <Countdown to={game.eventDate.toISOString()} />
            </div>
          )}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <div className="flex -space-x-2">
              {game.participants.slice(0, 14).map((p) => (
                <span key={p.id} className="avatar h-9 w-9 text-lg" title={p.user.name}>{p.user.avatar}</span>
              ))}
            </div>
            <span className="text-sm text-ink-soft">{game.participants.length} personas</span>
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

      {!me && manager && (
        <p className="notice notice-info">No participas en esta sala, solo la gestionas.</p>
      )}

      {me && drawn && receivers.length === 0 && (
        <section className="card p-6 text-center rise rise-2">
          <p className="font-dot text-3xl font-bold">ESTE AÑO RECIBES 🎁</p>
          <p className="mt-2 text-ink-soft">En esta sala los mayores regalan a los peques. ¡Tú solo tienes que esperar la sorpresa!</p>
        </section>
      )}

      {me && !drawn && (
        <section className="card-soft flex items-center gap-4 p-5 rise rise-2">
          <span className="font-dot text-4xl font-bold text-red pulse-dot" aria-hidden>●</span>
          <p className="text-ink-soft">
            El sorteo aún no se ha hecho. Mientras tanto, completa tu lista y tu{" "}
            <Link className="link" href="/perfil">ficha de tallas y gustos</Link> para ponérselo fácil a quien te toque.
          </p>
        </section>
      )}

      {pushKey && <PushToggle publicKey={pushKey} compact />}

      {myListEmpty && zona === "regalo" && (
        <p className="notice notice-warn" role="alert">
          ⚠️ <b>Tu lista está vacía</b>: ni ideas ni «sorpréndeme».{" "}
          <Link className="link" href={`/sala/${game.id}?zona=mia`} scroll={false}>Complétala aquí</Link>.
        </p>
      )}

      {/* Selector de zona */}
      {canGive && (
        <nav className="zone-tabs rise rise-2" aria-label="Zonas de la sala">
          <Link href={`/sala/${game.id}?zona=regalo`} scroll={false} className="zone-tab zone-tab-give" aria-current={zona === "regalo" ? "page" : undefined}>
            <small>Yo regalo a</small>
            <span className="text-lg">
              {revealed ? receivers.map((r) => `${r.avatar} ${first(r.name)}`).join(" + ") : "✉️ ¿Quién será?"}
            </span>
          </Link>
          <Link href={`/sala/${game.id}?zona=mia`} scroll={false} className="zone-tab zone-tab-mine" aria-current={zona === "mia" ? "page" : undefined}>
            <small>Lo que yo pido</small>
            <span className="text-lg">
              {user.avatar} Mi lista{myListEmpty && <span aria-label=" (vacía)" title="Tu lista está vacía"> ⚠️</span>}
            </span>
          </Link>
        </nav>
      )}

      {/* ZONA ROJA · a quién regalo */}
      {canGive && zona === "regalo" && (
        <section className="zone zone-give rise rise-3" aria-label="A quién regalo">
          <RevealOrShow revealed={revealed} gameId={game.id} names={receivers.map((r) => r.name)}>
            {receivers.map((r) => (
              <div key={r.participantId}>
                <div className="zone-head">
                  <span className="avatar h-16 w-16 text-4xl">{r.avatar}</span>
                  <div className="min-w-0">
                    <p className="dot-label">Tú regalas a</p>
                    <h2 className="font-dot text-4xl sm:text-5xl font-bold leading-none">{r.name.toUpperCase()}</h2>
                  </div>
                  {chats && game.status === "DRAWN" && (
                    <Link href={`/sala/${game.id}/chat/${r.assignmentId}`} className="btn btn-ghost btn-sm ml-auto">
                      💬 Preguntarle en secreto
                    </Link>
                  )}
                </div>
                <div className="zone-body">
                  <p className="story text-lg text-ink-soft">
                    Esto es lo que ha pedido {first(r.name)}. Lo que marques como comprado solo lo ves tú; {first(r.name)} nunca lo sabrá 🤫
                  </p>
                  {PROFILE_LABELS.some(([k]) => r.profile[k as keyof typeof r.profile]) && (
                    <div>
                      <h3 className="dot-label">Su ficha</h3>
                      <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {PROFILE_LABELS.filter(([k]) => r.profile[k as keyof typeof r.profile]).map(([k, label]) => (
                          <div key={k} className="rounded-2xl bg-paper-2 px-4 py-2.5 border border-line">
                            <dt className="text-xs font-semibold text-ink-faint">{label}</dt>
                            <dd className="mt-0.5 whitespace-pre-line">{r.profile[k as keyof typeof r.profile]}</dd>
                          </div>
                        ))}
                      </dl>
                    </div>
                  )}
                  <div>
                    <h3 className="dot-label">Su lista de deseos</h3>
                    <div className="mt-3 flex flex-col gap-3">
                      {r.wishes.length === 0 && !r.wantsSurprise && (
                        <p className="notice notice-warn">
                          {first(r.name)} todavía no ha apuntado nada. Pregúntale en secreto o échale un ojo a su ficha.
                        </p>
                      )}
                      {r.wishes.map((w) => (
                        <WishCard key={w.id} wish={w} budget={budget} gameId={game.id} giver={game.status === "DRAWN"} />
                      ))}
                      {r.wantsSurprise && (
                        <SurpriseCard gameId={game.id} giver={game.status === "DRAWN"} receiverId={r.participantId} purchased={r.surprisePurchased} />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </RevealOrShow>
        </section>
      )}

      {/* ZONA VERDE · lo que yo pido */}
      {me && zona === "mia" && (
        <section className="zone zone-mine rise rise-3" aria-label="Mi lista de deseos">
          <div className="zone-head">
            <span className="avatar h-14 w-14 text-3xl">{user.avatar}</span>
            <div className="min-w-0">
              <p className="dot-label">Mi lista de deseos</p>
              <h2 className="text-2xl sm:text-3xl font-bold leading-tight">Lo que yo pido</h2>
            </div>
            {prevParticipation && prevParticipation._count.wishes > 0 && game.status !== "FINISHED" && (
              <ActionButton action={copyWishesAction.bind(null, game.id, prevParticipation.gameId)} className="btn btn-ghost btn-sm ml-auto">
                ↺ Copiar mi lista de «{prevParticipation.game.name}»
              </ActionButton>
            )}
          </div>
          <div className="zone-body">
            <p className="text-ink-soft">
              Esto es lo que verá quien te regale.{budgetText ? ` Presupuesto de la sala: ${budgetText.toLowerCase()}.` : ""}
            </p>

            {/* Mensajes anónimos que he recibido */}
            {chats?.asReceiver && (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-3xl border-2 border-dashed border-sky bg-sky-soft/70 p-4">
                <div className="flex items-center gap-3">
                  <span className="avatar h-11 w-11 text-2xl" aria-hidden>🎭</span>
                  <div>
                    <p className="dot-label">Buzón secreto</p>
                    <p className="mt-0.5">
                      {chats.asReceiver.count > 0
                        ? `Tu amigo invisible te ha escrito (${chats.asReceiver.count} mensaje${chats.asReceiver.count === 1 ? "" : "s"}).`
                        : "Si tu amigo invisible te pregunta algo, lo verás aquí."}
                    </p>
                  </div>
                </div>
                <Link href={`/sala/${game.id}/chat/${chats.asReceiver.assignmentId}`} className="btn btn-ghost btn-sm bg-paper-2">🎭 Abrir buzón</Link>
              </div>
            )}

            <MyWishList
              gameId={game.id}
              budget={budget}
              editable={game.status !== "FINISHED"}
              wantsSurprise={Boolean(me.wantsSurprise)}
              wishes={myWishes.map((w) => ({ ...w, links: w.links }))}
            />
          </div>
        </section>
      )}

      {me && game.status === "OPEN" && (
        <section className="text-center">
          <ActionButton action={leaveGameAction.bind(null, game.id)} confirm="¿Seguro que quieres salir de esta sala? Se borrará tu lista." className="btn btn-ghost btn-sm bg-paper-2 text-ink-soft">
            Salir de la sala
          </ActionButton>
        </section>
      )}
    </div>
  );
}

function RevealOrShow({ revealed, gameId, names, children }: { revealed: boolean; gameId: string; names: string[]; children: React.ReactNode }) {
  if (revealed) return <>{children}</>;
  return (
    <Reveal gameId={gameId} names={names}>
      {children}
    </Reveal>
  );
}
