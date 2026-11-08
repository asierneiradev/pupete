/**
 * Fondo de la app: cielo, nubes que pasan despacio, colinas en capas con borde
 * de acuarela y motas de luz flotando.
 * Ilustración original en SVG (sin imágenes externas).
 */
const clouds = [
  { top: "8%", scale: 1, dur: 140, delay: -20 },
  { top: "18%", scale: 0.65, dur: 190, delay: -110 },
  { top: "4%", scale: 0.8, dur: 230, delay: -60 },
];

const motes = Array.from({ length: 14 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  bottom: `${8 + ((i * 23) % 38)}%`,
  size: 3 + (i % 3),
  dur: 5 + (i % 5),
  delay: -(i * 0.9),
}));

function Cloud() {
  return (
    <svg width="260" height="90" viewBox="0 0 260 90" aria-hidden>
      <g fill="var(--paper-2)" opacity="0.92" filter="url(#wc-soft)">
        <ellipse cx="80" cy="60" rx="70" ry="26" />
        <ellipse cx="130" cy="42" rx="56" ry="34" />
        <ellipse cx="185" cy="58" rx="62" ry="24" />
        <ellipse cx="105" cy="38" rx="34" ry="24" />
      </g>
    </svg>
  );
}

export function Scenery() {
  return (
    <div className="scenery" aria-hidden>
      <div className="sky" />
      <svg width="0" height="0">
        <defs>
          <filter id="wc-soft">
            <feTurbulence type="fractalNoise" baseFrequency="0.02" numOctaves="2" seed="3" />
            <feDisplacementMap in="SourceGraphic" scale="9" />
            <feGaussianBlur stdDeviation="0.6" />
          </filter>
          <filter id="wc-edge">
            <feTurbulence type="fractalNoise" baseFrequency="0.012 0.04" numOctaves="3" seed="8" />
            <feDisplacementMap in="SourceGraphic" scale="14" />
          </filter>
        </defs>
      </svg>

      {/* Sol de tarde */}
      <svg style={{ right: "9%", top: "9%" }} width="120" height="120" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r="52" fill="var(--glow)" opacity="0.55" />
        <circle cx="60" cy="60" r="30" fill="#fbe3a6" />
      </svg>
      <div>
        {clouds.map((c, i) => (
          <div
            key={i}
            className="cloud"
            style={{ position: "absolute", top: c.top, left: 0, scale: String(c.scale), animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
          >
            <Cloud />
          </div>
        ))}
      </div>

      {/* Colinas en capas */}
      <svg className="hills" viewBox="0 0 1440 400" preserveAspectRatio="none">
        <g filter="url(#wc-edge)">
          <path d="M0 210 C 180 150 320 170 480 200 S 820 140 1000 175 S 1300 150 1440 185 L1440 400 L0 400Z" fill="var(--hill-1)" opacity="0.75" />
          <path d="M0 280 C 220 230 380 250 560 270 S 900 225 1120 255 S 1360 245 1440 260 L1440 400 L0 400Z" fill="var(--hill-2)" opacity="0.85" />
          <path d="M0 340 C 260 310 520 330 760 345 S 1200 315 1440 335 L1440 400 L0 400Z" fill="var(--hill-3)" />
        </g>
        {/* Arbolitos redondos */}
        <g opacity="0.9">
          {[
            [120, 248, 1], [168, 256, 0.75], [1180, 238, 0.9], [1230, 246, 0.7], [700, 262, 0.6],
          ].map(([x, y, s], i) => (
            <g key={i} transform={`translate(${x} ${y}) scale(${s})`}>
              <rect x="-3" y="0" width="6" height="22" rx="3" fill="var(--hill-3)" />
              <ellipse cx="0" cy="-8" rx="18" ry="24" fill="var(--hill-3)" />
              <ellipse cx="-5" cy="-14" rx="8" ry="11" fill="var(--hill-1)" opacity="0.35" />
            </g>
          ))}
        </g>
        {/* Casita con farol */}
        <g transform="translate(980 268)">
          <path d="M-22 0 L0 -20 L22 0 Z" fill="var(--blush)" />
          <rect x="-17" y="0" width="34" height="22" fill="var(--paper-2)" />
          <rect x="-5" y="8" width="8" height="10" fill="var(--glow)" />
        </g>
      </svg>

      {motes.map((m, i) => (
        <span
          key={i}
          className="mote"
          style={{
            position: "absolute", left: m.left, bottom: m.bottom, width: m.size, height: m.size, borderRadius: 9,
            background: "var(--glow)", boxShadow: "0 0 10px 3px color-mix(in oklab, var(--glow) 70%, transparent)",
            animationDuration: `${m.dur}s`, animationDelay: `${m.delay}s`,
          }}
        />
      ))}
    </div>
  );
}
