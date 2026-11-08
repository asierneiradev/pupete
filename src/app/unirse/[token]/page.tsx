import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { getGameByJoinToken } from "@/lib/services/participants";
import { Cover } from "@/components/Cover";
import { ActionForm, SubmitButton } from "@/components/forms";
import { GroupPicker } from "@/components/GroupPicker";
import { joinAction, registerJoinAction } from "@/app/actions/games";
import { formatDate } from "@/lib/dates";
import { budgetLabel } from "@/lib/money";
import { hasAccess } from "@/lib/services/auth";
import { NameField, NewPinFields } from "@/components/AccessFields";

export const metadata: Metadata = { title: "Invitación" };

export default async function UnirsePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const game = await getGameByJoinToken(token);
  const user = await getCurrentUser();

  if (!game) {
    return (
      <div className="card mx-auto mt-10 max-w-md p-8 text-center">
        <p className="font-dot text-4xl font-bold">UPS</p>
        <p className="mt-3 text-ink-soft">Esta invitación no existe o el organizador la ha cambiado. Pídele el enlace nuevo.</p>
      </div>
    );
  }

  if (user && !hasAccess(user)) redirect(`/acceso?next=/unirse/${token}`);
  if (user && (await db.participant.findUnique({ where: { gameId_userId: { gameId: game.id, userId: user.id } } }))) {
    redirect(`/sala/${game.id}`);
  }

  const closed = !game.joinOpen || game.status !== "OPEN" || game.signupMode === "ADMIN_CREATED";
  const askGroup = game.groupMode !== "NONE";
  const budget = budgetLabel(game.budgetMin, game.budgetMax, game.currency);

  return (
    <div className="mx-auto max-w-lg pt-2">
      <div className="card overflow-hidden rise">
        <div className="relative h-40">
          <Cover cover={game.cover} className="absolute inset-0 h-full w-full" />
        </div>
        <div className="p-6 sm:p-8">
          <p className="dot-label">{game.owner.name} te invita</p>
          <h1 className="mt-2 text-3xl font-bold leading-tight">{game.name}</h1>
          {game.description && <p className="story mt-2 text-lg text-ink-soft">{game.description}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            {game.eventDate && <span className="chip">📅 {formatDate(game.eventDate)}</span>}
            {game.location && <span className="chip">📍 {game.location}</span>}
            {budget && <span className="chip chip-ochre">💶 {budget}</span>}
            <span className="chip">👥 {game._count.participants} apuntados</span>
          </div>

          <div className="divider-dots my-6" />

          {closed ? (
            <p className="notice notice-warn">
              {game.signupMode === "ADMIN_CREATED"
                ? "En esta sala el organizador da de alta a cada persona. Pídele tu código de invitación y entra con él."
                : game.status !== "OPEN"
                  ? "El sorteo ya se ha hecho: la inscripción está cerrada."
                  : "La inscripción está cerrada ahora mismo. Pide al organizador que la abra."}
            </p>
          ) : user ? (
            <ActionForm action={joinAction.bind(null, token)} className="flex flex-col gap-4">
              <p>
                Entras como <b>{user.avatar} {user.name}</b>.
              </p>
              {askGroup && <GroupPicker />}
              <SubmitButton className="btn w-full">¡Me apunto! 🎁</SubmitButton>
            </ActionForm>
          ) : (
            <>
              <ActionForm action={registerJoinAction.bind(null, token)} className="flex flex-col gap-4">
                <h2 className="font-bold">Crea tu perfil</h2>
                <NameField hint="Con tu nombre y tu PIN entrarás después. Si alguien de la familia se llama igual, añade una inicial." />
                <NewPinFields />
                {askGroup && <GroupPicker />}
                <SubmitButton className="btn w-full">Unirme</SubmitButton>
              </ActionForm>
              <p className="mt-4 text-center text-sm text-ink-soft">
                ¿Ya tienes cuenta? <Link className="link" href={`/entrar?next=/unirse/${token}`}>Entra con tu nombre y PIN</Link>
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
