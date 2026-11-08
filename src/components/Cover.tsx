/** Portadas ilustradas de sala (originales, SVG). */
type Props = { cover: string; className?: string };

const palettes: Record<string, { sky: [string, string]; hills: [string, string, string]; accent: string }> = {
  bosque: { sky: ["#bfe0ea", "#f8eed8"], hills: ["#9dbf86", "#6f955c", "#486b3d"], accent: "#e2a65b" },
  nieve: { sky: ["#c9d9ec", "#f4f1ec"], hills: ["#ffffff", "#e6edf3", "#cfdbe6"], accent: "#d71921" },
  faroles: { sky: ["#2a3d5c", "#f0a96a"], hills: ["#3d4f5c", "#2d3b45", "#1f2a31"], accent: "#ffcf7a" },
  colinas: { sky: ["#f7d6b5", "#fbefdc"], hills: ["#e3c58f", "#c79f62", "#8f7444"], accent: "#5b7b4a" },
};

export function Cover({ cover, className = "" }: Props) {
  const p = palettes[cover] ?? palettes.bosque;
  const id = `cv-${cover}`;
  return (
    <svg className={className} viewBox="0 0 600 240" preserveAspectRatio="xMidYMid slice" aria-hidden role="img">
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.sky[0]} />
          <stop offset="1" stopColor={p.sky[1]} />
        </linearGradient>
        <filter id={`${id}-wc`}>
          <feTurbulence type="fractalNoise" baseFrequency="0.015 0.05" numOctaves="3" seed="4" />
          <feDisplacementMap in="SourceGraphic" scale="10" />
        </filter>
      </defs>
      <rect width="600" height="240" fill={`url(#${id}-sky)`} />
      {cover === "faroles" &&
        Array.from({ length: 22 }, (_, i) => (
          <circle key={i} cx={(i * 71) % 600} cy={(i * 37) % 110} r={i % 3 ? 1 : 1.6} fill="#fff6dc" opacity="0.8" />
        ))}
      {cover !== "faroles" && <circle cx="470" cy="70" r="34" fill="#fff4cf" opacity="0.8" />}
      <g filter={`url(#${id}-wc)`}>
        <path d="M0 150 C 120 110 220 130 330 145 S 520 110 600 130 L600 240 L0 240Z" fill={p.hills[0]} />
        <path d="M0 185 C 140 160 260 175 380 185 S 540 165 600 175 L600 240 L0 240Z" fill={p.hills[1]} />
        <path d="M0 215 C 160 200 320 210 460 218 S 560 205 600 210 L600 240 L0 240Z" fill={p.hills[2]} />
      </g>
      {cover === "bosque" &&
        [60, 100, 140, 430, 470, 520].map((x, i) => (
          <g key={i} transform={`translate(${x} ${150 + (i % 2) * 14}) scale(${0.8 + (i % 3) * 0.15})`}>
            <path d="M0 -40 L16 0 L-16 0Z" fill={p.hills[2]} />
            <path d="M0 -26 L20 14 L-20 14Z" fill={p.hills[2]} />
            <rect x="-2.5" y="14" width="5" height="10" fill="#5e4a36" />
          </g>
        ))}
      {cover === "nieve" && (
        <>
          {[80, 130, 470, 520].map((x, i) => (
            <g key={i} transform={`translate(${x} ${160 + (i % 2) * 10})`}>
              <path d="M0 -44 L18 0 L-18 0Z" fill="#7e9aa9" />
              <path d="M0 -44 L9 -22 L-9 -22Z" fill="#fff" />
              <rect x="-2.5" y="0" width="5" height="9" fill="#6b5847" />
            </g>
          ))}
          {Array.from({ length: 40 }, (_, i) => (
            <circle key={i} cx={(i * 47) % 600} cy={(i * 31) % 200} r={1.2 + (i % 3) * 0.7} fill="#fff" opacity="0.9" />
          ))}
        </>
      )}
      {cover === "faroles" &&
        [90, 180, 300, 410, 510].map((x, i) => (
          <g key={i} transform={`translate(${x} ${60 + (i % 3) * 22})`}>
            <circle r="22" fill={p.accent} opacity="0.18" />
            <rect x="-9" y="-12" width="18" height="24" rx="8" fill="#d71921" />
            <rect x="-5" y="-9" width="10" height="18" rx="5" fill={p.accent} opacity="0.85" />
          </g>
        ))}
      {cover === "colinas" && (
        <>
          <path d="M0 200 Q 300 170 600 196" stroke="#fff8ea" strokeWidth="5" fill="none" strokeDasharray="2 12" strokeLinecap="round" />
          {[150, 330, 500].map((x, i) => (
            <g key={i} transform={`translate(${x} ${168 + i * 4})`}>
              <ellipse cx="0" cy="-14" rx="16" ry="20" fill={p.accent} />
              <rect x="-2" y="2" width="4" height="10" fill="#6b5847" />
            </g>
          ))}
        </>
      )}
    </svg>
  );
}
