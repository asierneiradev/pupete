"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { revealAction } from "@/app/actions/wishes";

const LEAVES = ["🍂", "🍁", "✨", "🌿", "⭐", "🍃", "✨", "🍂", "🌟", "🍁", "🍃", "✨"];

/**
 * Sobre lacrado: al pulsarlo se abre la solapa, sube la carta con el nombre en
 * puntos y caen hojas. Después se muestra el contenido (la lista del receptor).
 */
export function Reveal({ gameId, names, children }: { gameId: string; names: string[]; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState(false);
  const [, start] = useTransition();
  const router = useRouter();

  const openIt = () => {
    if (open) return;
    setOpen(true);
    start(async () => {
      await revealAction(gameId);
    });
    setTimeout(() => {
      setDone(true);
      router.refresh();
    }, 2600);
  };

  if (done) return <>{children}</>;

  return (
    <div className="flex flex-col items-center px-4 py-6 text-center">
      <p className="dot-label">Tu sobre ha llegado</p>
      <h2 className="mt-2 font-dot text-4xl sm:text-5xl font-bold">{open ? "TE HA TOCADO…" : "¿A QUIÉN REGALAS?"}</h2>
      <div className="relative mt-12">
        <button type="button" className="envelope" data-open={open} onClick={openIt} aria-label="Abrir el sobre">
          <span className="env-back" />
          <span className="env-letter">
            <span className="px-3">
              <span className="block font-mono text-[0.6rem] tracking-[0.25em] text-ink-faint">REGALAS A</span>
              <span className="mt-1 block font-dot text-2xl sm:text-3xl font-bold leading-tight text-ink">{names.join(" + ").toUpperCase()}</span>
            </span>
          </span>
          <span className="env-front" />
          <span className="env-flap" />
          <span className="env-seal font-dot text-xl font-bold">P</span>
        </button>
        {open && (
          <div className="pointer-events-none absolute inset-x-0 -top-10 h-0" aria-hidden>
            {LEAVES.map((l, i) => (
              <span
                key={i}
                className="leaf text-2xl"
                style={{
                  left: `${(i * 8.5) % 100}%`,
                  animationDelay: `${0.4 + (i % 6) * 0.12}s`,
                  ["--dx" as string]: `${(i % 2 ? 1 : -1) * (20 + i * 4)}px`,
                  ["--rot" as string]: `${(i % 2 ? 1 : -1) * (180 + i * 20)}deg`,
                }}
              >
                {l}
              </span>
            ))}
          </div>
        )}
      </div>
      {!open && <p className="story mt-8 text-lg text-ink-soft">Pulsa el sello para abrirlo… y que no te vea nadie 🤫</p>}
    </div>
  );
}
