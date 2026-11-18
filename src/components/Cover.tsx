/** Portadas ilustradas de sala (originales, SVG). */
type Props = { cover: string; className?: string; /** Foto propia: si hay, sustituye a la ilustración */ image?: string | null };

const palettes: Record<string, { sky: [string, string]; hills: [string, string, string]; accent: string }> = {
  bosque: { sky: ["#bfe0ea", "#f8eed8"], hills: ["#9dbf86", "#6f955c", "#486b3d"], accent: "#e2a65b" },
  nieve: { sky: ["#c9d9ec", "#f4f1ec"], hills: ["#ffffff", "#e6edf3", "#cfdbe6"], accent: "#d71921" },
  faroles: { sky: ["#2a3d5c", "#f0a96a"], hills: ["#3d4f5c", "#2d3b45", "#1f2a31"], accent: "#ffcf7a" },
  colinas: { sky: ["#f7d6b5", "#fbefdc"], hills: ["#e3c58f", "#c79f62", "#8f7444"], accent: "#5b7b4a" },
  globos: { sky: ["#f8cfd0", "#fdf3e3"], hills: ["#cfe3b8", "#a9cc92", "#7fae6b"], accent: "#d71921" },
  playa: { sky: ["#a5dbee", "#fdf0d0"], hills: ["#7fc8dc", "#4fa6c2", "#efd9a7"], accent: "#d71921" },
  estrellas: { sky: ["#161d3a", "#4b4f8c"], hills: ["#3a3f73", "#2a2e58", "#1b1e3d"], accent: "#ffe9a8" },
  flores: { sky: ["#cfe8d8", "#fdf6e0"], hills: ["#b9d99a", "#8fbf74", "#5f9450"], accent: "#e88aa6" },
};

const BALLOONS: Array<[number, number, string]> = [
  [90, 78, "#d71921"], [135, 52, "#e2a65b"], [180, 86, "#6fa7c9"],
  [420, 60, "#5b7b4a"], [465, 90, "#e88aa6"], [512, 54, "#d71921"],
];
const CONFETTI = ["#d71921", "#e2a65b", "#6fa7c9", "#5b7b4a", "#e88aa6"];
const FLOWERS: Array<[number, number, string, number]> = [
  [70, 196, "#e88aa6", 1], [130, 214, "#fff4cf", 0.8], [205, 200, "#d71921", 0.9], [290, 218, "#e2a65b", 0.8],
  [370, 204, "#e88aa6", 1], [440, 220, "#fff4cf", 0.85], [505, 200, "#d71921", 0.9], [565, 214, "#e2a65b", 0.8],
];

export function Cover({ cover, className = "", image }: Props) {
  if (image) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={image} alt="" className={`${className} object-cover`} />;
  }
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
      {cover === "estrellas" && (
        <>
          {Array.from({ length: 46 }, (_, i) => (
            <circle key={i} cx={(i * 83) % 600} cy={(i * 41) % 140} r={i % 5 === 0 ? 2 : i % 2 ? 0.9 : 1.4} fill="#fff6dc" opacity={0.55 + (i % 4) * 0.12} />
          ))}
          <circle cx="455" cy="66" r="30" fill={p.accent} />
          <circle cx="468" cy="58" r="27" fill="#252b55" />
        </>
      )}
      {cover !== "faroles" && cover !== "estrellas" && <circle cx={cover === "playa" ? 300 : 470} cy="70" r="34" fill="#fff4cf" opacity="0.8" />}
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
      {cover === "globos" && (
        <>
          {Array.from({ length: 34 }, (_, i) => (
            <rect key={i} x={(i * 67) % 600} y={(i * 29) % 130} width="6" height="3" rx="1" fill={CONFETTI[i % CONFETTI.length]} opacity="0.75" transform={`rotate(${(i * 47) % 180} ${(i * 67) % 600} ${(i * 29) % 130})`} />
          ))}
          {BALLOONS.map(([x, y, c], i) => (
            <g key={i}>
              <path d={`M${x} ${y + 24} q ${i % 2 ? 8 : -8} 30 0 70`} stroke="#8a7a66" strokeWidth="1.2" fill="none" />
              <ellipse cx={x} cy={y} rx="19" ry="24" fill={c} />
              <ellipse cx={x - 6} cy={y - 8} rx="4" ry="7" fill="#fff" opacity="0.35" />
              <path d={`M${x - 4} ${y + 23} L${x + 4} ${y + 23} L${x} ${y + 29}Z`} fill={c} />
            </g>
          ))}
        </>
      )}
      {cover === "playa" && (
        <>
          <path d="M0 204 q 30 -8 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0 t 60 0" stroke="#fff" strokeWidth="3" fill="none" opacity="0.7" strokeLinecap="round" />
          <g transform="translate(470 196)">
            <rect x="-1.5" y="-46" width="3" height="52" fill="#6b5847" />
            <path d="M-38 -40 Q 0 -78 38 -40Z" fill={p.accent} />
            <path d="M-13 -40 Q 0 -78 13 -40Z" fill="#fff4cf" />
          </g>
          <g transform="translate(110 150)">
            <path d="M0 0 L26 0 L20 9 L5 9Z" fill="#fff" />
            <path d="M12 -2 L12 -26 L27 -2Z" fill={p.accent} />
          </g>
        </>
      )}
      {cover === "flores" &&
        FLOWERS.map(([x, y, c, sc], i) => (
          <g key={i} transform={`translate(${x} ${y}) scale(${sc})`}>
            <path d="M0 0 L0 26" stroke="#3f6a35" strokeWidth="2.5" />
            {[0, 72, 144, 216, 288].map((a) => (
              <ellipse key={a} cx="0" cy="-9" rx="5.5" ry="9" fill={c} transform={`rotate(${a})`} />
            ))}
            <circle r="4.5" fill="#f2c14e" />
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
