import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManage } from "@/lib/services/games";
import { joinUrl, listExclusions, listParticipantsForAdmin, listReusableUsers } from "@/lib/services/participants";
import { gameProgress } from "@/lib/services/drawing";
import { toLocalInput } from "@/lib/dates";
import { GameForm } from "@/components/GameForm";
import { ActionForm, SubmitButton } from "@/components/forms";
import { AddParticipant, DrawPanel, ExclusionsPanel, InvitePanel, ParticipantsTable } from "@/components/admin";
import { STATUS } from "@/components/GameCard";
import { deleteGameAction, nextEditionAction, updateGameAction } from "@/app/actions/games";

export const metadata: Metadata = { title: "Gestionar sala" };

function Panel({ n, title, children, id }: { n: string; title: string; children: React.ReactNode; id?: string }) {
  return (
    <section id={id} className="card p-5 sm:p-6 scroll-mt-6">
      <div className="flex items-baseline gap-3">
        <span className="font-dot text-2xl font-bold text-red">{n}</span>
        <h2 className="text-lg font-bold">{title}</h2>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default async function AdminSalaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nueva?: string }> }) {
  const { id } = await params;
  const sp = await searchParams;
  const user = await requireUser(`/sala/${id}/admin`);
  const game = await db.game.findUnique({ where: { id }, include: { previousGame: { select: { name: true } } } });
  if (!game) notFound();
  if (!canManage(user, game)) redirect(`/sala/${id}`);

  const [participants, exclusions, progress, reusable] = await Promise.all([
    listParticipantsForAdmin(user, id),
    listExclusions(id),
    gameProgress(id),
    listReusableUsers(user, id),
  ]);
  const open = game.status === "OPEN";
  const showGroups = game.groupMode !== "NONE";
  const canAdd = game.signupMode !== "INVITE";
  const canInvite = game.signupMode !== "ADMIN_CREATED";
  const s = STATUS[game.status];
  const amIn = participants.some((p) => p.userId === user.id);

  const stats: Array<[string | number, string]> = [
    [progress.total, "personas"],
    [`${progress.withWishes}/${progress.total}`, "con lista"],
    ...(showGroups ? ([[progress.kids, "peques"]] as Array<[number, string]>) : []),
    ...(game.status !== "OPEN" ? ([[`${progress.revealed}/${progress.total}`, "sobres abiertos"]] as Array<[string, string]>) : []),
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3 rise">
        <div>
          <p className="dot-label">Panel de organización</p>
          <h1 className="mt-1 text-3xl sm:text-4xl font-bold leading-tight">{game.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <span className={`chip ${s.cls}`}>{s.label}</span>
            {game.previousGame && <span className="chip">↺ viene de «{game.previousGame.name}»</span>}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {amIn && <Link href={`/sala/${id}`} className="btn btn-ghost btn-sm">Ver como participante</Link>}
          {participants.some((p) => p.code) && (
            <Link href={`/sala/${id}/admin/codigos`} className="btn btn-ghost btn-sm">🖨 Tarjetas de invitación</Link>
          )}
        </div>
      </div>

      {sp.nueva && (
        <p className="notice notice-ok rise">
          ¡Sala lista! Ahora {canAdd ? "añade a la gente" : ""}{canAdd && canInvite ? " o " : ""}{canInvite ? "comparte el enlace de invitación" : ""}.
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 rise rise-2">
        {stats.map(([v, l]) => (
          <div key={l} className="card-soft p-4">
            <p className="font-dot text-4xl font-bold leading-none">{v}</p>
            <p className="mt-1 font-mono text-[0.68rem] uppercase tracking-[0.2em] text-ink-faint">{l}</p>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="flex flex-col gap-6">
          <Panel n="01" title="Participantes">
            <ParticipantsTable gameId={id} participants={participants} open={open} showGroups={showGroups} drawn={!open} />
            {open && canAdd && (
              <>
                <div className="divider-dots my-5" />
                <AddParticipant gameId={id} showGroups={showGroups} reusable={reusable} />
              </>
            )}
          </Panel>

          {canInvite && (
            <Panel n="02" title="Invitar">
              <InvitePanel
                gameId={id}
                url={joinUrl(game)}
                joinOpen={game.joinOpen}
                canJoin={open}
                gameName={game.name}
              />
            </Panel>
          )}
        </div>

        <div className="flex flex-col gap-6">
          <Panel n="03" title="Exclusiones" id="exclusiones">
            <ExclusionsPanel
              gameId={id}
              open={open}
              participants={participants.map((p) => ({ id: p.id, name: p.name, avatar: p.avatar }))}
              exclusions={exclusions.map((e) => ({ id: e.id, a: `${e.a.user.avatar} ${e.a.user.name}`, b: `${e.b.user.avatar} ${e.b.user.name}` }))}
            />
          </Panel>

          <Panel n="04" title="Sorteo">
            <DrawPanel gameId={id} status={game.status} total={participants.length} />
          </Panel>

          {game.status !== "OPEN" && (
            <Panel n="05" title="El año que viene">
              <p className="mb-3 text-sm text-ink-soft">
                Crea una nueva edición con las mismas personas, grupos, exclusiones y reglas. El sorteo evitará repetir parejas de esta.
              </p>
              <ActionForm action={nextEditionAction.bind(null, id)} className="flex flex-wrap gap-2">
                <input name="name" className="input flex-1" defaultValue={game.name.replace(/\d{4}/, (y) => String(Number(y) + 1))} aria-label="Nombre de la nueva edición" />
                <SubmitButton className="btn">Crear edición</SubmitButton>
              </ActionForm>
            </Panel>
          )}
        </div>
      </div>

      <details className="card group p-5 sm:p-6">
        <summary className="flex cursor-pointer list-none items-center justify-between font-bold">
          <span className="flex items-baseline gap-3">
            <span className="font-dot text-2xl font-bold text-red">06</span> Configuración de la sala
          </span>
          <span className="text-ink-faint transition-transform group-open:rotate-180">⌄</span>
        </summary>
        <div className="mt-5">
          <GameForm
            action={updateGameAction.bind(null, id)}
            game={game}
            eventDateLocal={toLocalInput(game.eventDate)}
            deadlineLocal={toLocalInput(game.wishlistDeadline)}
            drawn={!open}
          />
        </div>
      </details>

      <details className="card p-5 sm:p-6">
        <summary className="cursor-pointer list-none font-bold text-red">Zona peligrosa</summary>
        <ActionForm action={deleteGameAction.bind(null, id)} className="mt-4 flex flex-col gap-3">
          <p className="text-sm text-ink-soft">
            Borrar la sala elimina listas, asignaciones y mensajes. Las cuentas de las personas se mantienen. Escribe <b>{game.name}</b> para confirmar.
          </p>
          <div className="flex flex-wrap gap-2">
            <input name="confirm" className="input flex-1" autoComplete="off" aria-label="Nombre de la sala para confirmar" />
            <SubmitButton className="btn btn-red">Borrar sala</SubmitButton>
          </div>
        </ActionForm>
      </details>
    </div>
  );
}
