import type { Metadata } from "next";
import { requireAdmin } from "@/lib/session";
import { GameForm } from "@/components/GameForm";
import { createGameAction } from "@/app/actions/games";

export const metadata: Metadata = { title: "Nueva sala" };

export default async function NuevaSalaPage() {
  await requireAdmin();
  return (
    <div className="mx-auto max-w-3xl">
      <p className="dot-label rise">Nueva sala</p>
      <h1 className="font-dot text-5xl font-bold rise">ENCENDER UN FAROLILLO</h1>
      <p className="story mt-2 text-lg text-ink-soft rise">Configura las reglas del juego. Podrás cambiarlas hasta el sorteo.</p>
      <div className="mt-6">
        <GameForm action={createGameAction} isNew />
      </div>
    </div>
  );
}
