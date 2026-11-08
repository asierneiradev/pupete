import Link from "next/link";

/** Logotipo: farolillo + "PUPETE" en matriz de puntos. */
export function Lantern({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size * 1.25} viewBox="0 0 32 40" aria-hidden className="sway">
      <line x1="16" y1="0" x2="16" y2="6" stroke="var(--ink-soft)" strokeWidth="1.5" />
      <rect x="10" y="5" width="12" height="4" rx="2" fill="var(--ink)" />
      <path d="M8 12 Q16 6 24 12 L24 30 Q16 36 8 30 Z" fill="var(--red)" />
      <path d="M12 12 Q16 9 20 12 L20 30 Q16 33 12 30 Z" fill="var(--glow)" opacity="0.75" />
      <rect x="10" y="31" width="12" height="4" rx="2" fill="var(--ink)" />
      <line x1="16" y1="35" x2="16" y2="40" stroke="var(--ink-soft)" strokeWidth="1.5" />
    </svg>
  );
}

export function Logo() {
  return (
    <Link href="/" className="inline-flex items-end gap-2 group" aria-label="Pupete, inicio">
      <Lantern size={24} />
      <span className="font-dot text-[1.7rem] font-bold leading-none tracking-wide text-ink group-hover:text-moss-deep transition-colors">
        PUPETE
      </span>
    </Link>
  );
}
