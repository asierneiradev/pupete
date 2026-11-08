import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { canManage } from "@/lib/services/games";
import { listParticipantsForAdmin } from "@/lib/services/participants";
import { appUrl } from "@/lib/env";
import { Lantern } from "@/components/Logo";
import { PrintButton } from "./PrintButton";

export const metadata: Metadata = { title: "Tarjetas de invitación" };

export default async function CodigosPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await requireUser(`/sala/${id}/admin/codigos`);
  const game = await db.game.findUnique({ where: { id } });
  if (!game) notFound();
  if (!canManage(user, game)) redirect(`/sala/${id}`);
  const people = (await listParticipantsForAdmin(user, id)).filter((p) => p.code);
  const host = appUrl().replace(/^https?:\/\//, "");
  return (
    <div>
      <div className="no-print mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/sala/${id}/admin`} className="link text-sm">← Volver al panel</Link>
          <h1 className="mt-2 font-dot text-4xl font-bold">TARJETAS</h1>
          <p className="text-ink-soft">Solo salen quienes aún no han creado su PIN. Imprímelas, recórtalas y dale a cada uno la suya (o haz captura y envíala).</p>
        </div>
        <PrintButton />
      </div>
      <div className="print-grid grid grid-cols-1 gap-4 sm:grid-cols-2">
        {people.map((p) => (
          <div key={p.id} className="card flex items-center gap-4 p-5">
            <Lantern size={28} />
            <div className="min-w-0 flex-1">
              <p className="font-mono text-[0.65rem] uppercase tracking-[0.22em] text-ink-faint">{game.name}</p>
              <p className="mt-1 text-lg font-bold">{p.avatar} {p.name}</p>
              <p className="mt-2 font-dot text-3xl font-bold tracking-wider">{p.code}</p>
              <p className="mt-1 text-xs text-ink-soft">Entra en <b>{host}</b>, pulsa «primera vez», escribe este código y crea tu PIN</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
