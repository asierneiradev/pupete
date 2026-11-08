import Link from "next/link";
import type { Game } from "@prisma/client";
import { Cover } from "./Cover";
import { formatShortDate } from "@/lib/dates";
import { budgetLabel } from "@/lib/money";

export const STATUS: Record<Game["status"], { label: string; cls: string }> = {
  OPEN: { label: "Apuntándonos", cls: "chip-sky" },
  DRAWN: { label: "Sorteado", cls: "chip-moss" },
  FINISHED: { label: "Celebrado", cls: "" },
};

export function GameCard({ game, href, count }: { game: Game; href: string; count: number }) {
  const s = STATUS[game.status];
  const budget = budgetLabel(game.budgetMin, game.budgetMax, game.currency);
  return (
    <Link href={href} className="card group block overflow-hidden transition-transform hover:-translate-y-1">
      <div className="relative h-28 overflow-hidden">
        <Cover cover={game.cover} className="absolute inset-0 h-full w-full transition-transform duration-700 group-hover:scale-105" />
        <span className={`chip ${s.cls} absolute right-3 top-3`}>{s.label}</span>
      </div>
      <div className="p-4">
        <h3 className="text-lg font-bold leading-tight">{game.name}</h3>
        <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
          {game.eventDate && <span className="chip">📅 {formatShortDate(game.eventDate)}</span>}
          <span className="chip">👥 {count}</span>
          {budget && <span className="chip chip-ochre">💶 {budget}</span>}
        </div>
      </div>
    </Link>
  );
}
