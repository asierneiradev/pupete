"use client";

import { useEffect, useState } from "react";

function parts(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  return { d: Math.floor(s / 86400), h: Math.floor((s % 86400) / 3600), m: Math.floor((s % 3600) / 60), s: s % 60 };
}

/** Cuenta atrás en matriz de puntos. */
export function Countdown({ to }: { to: string }) {
  const target = new Date(to).getTime();
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  if (now == null) return <div className="h-[72px]" />;
  if (target <= now) return <p className="font-dot text-3xl font-bold text-red">¡ES HOY!</p>;
  const p = parts(target - now);
  const cells: Array<[number, string]> = [[p.d, "días"], [p.h, "horas"], [p.m, "min"], [p.s, "seg"]];
  return (
    <div className="flex gap-2 sm:gap-3" role="timer" aria-label={`Faltan ${p.d} días y ${p.h} horas`}>
      {cells.map(([v, l]) => (
        <div key={l} className="flex flex-col items-center min-w-[58px] rounded-2xl bg-paper px-2 py-2 border border-line">
          <span className="font-dot text-[2rem] sm:text-[2.4rem] font-bold leading-none tabular-nums">{String(v).padStart(2, "0")}</span>
          <span className="font-mono text-[0.62rem] tracking-[0.2em] uppercase text-ink-faint mt-1">{l}</span>
        </div>
      ))}
    </div>
  );
}
