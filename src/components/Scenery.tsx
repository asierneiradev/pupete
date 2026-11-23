/**
 * Fondo de la app: un cielo que cambia de luz, sol que respira, nubes que
 * cruzan, pájaros de paso, colinas en capas con borde de acuarela, el farol de
 * la casita y motas de luz flotando.
 * Ilustración original en SVG (sin imágenes externas).
 *
 * Todo se mueve solo con `transform` y `opacity` (lo compone la GPU: va fino en
 * el móvil) y nunca dentro del SVG de las colinas, que lleva un filtro caro de
 * repintar. Con «reducir movimiento» activado en el sistema, queda quieto.
 */
// Dos planos: las nubes grandes van delante y más rápido; las pequeñas, lejos y lentas.
// `delay` negativo: al cargar ya están repartidas por el cielo.
const clouds = [
  { top: "7%", scale: 1, dur: 46, delay: -8, opacity: 1, bob: 7 },
  { top: "19%", scale: 0.6, dur: 78, delay: -52, opacity: 0.8, bob: 9 },
  { top: "3%", scale: 0.75, dur: 64, delay: -30, opacity: 0.9, bob: 8 },
  { top: "27%", scale: 0.45, dur: 96, delay: -70, opacity: 0.65, bob: 11 },
  { top: "13%", scale: 0.85, dur: 56, delay: -41, opacity: 0.95, bob: 6 },
];

// Bandadas que cruzan de vez en cuando (la mayor parte del ciclo están fuera de la pantalla)
const flocks = [
  { top: "15%", dur: 38, delay: -3, scale: 1 },
  { top: "25%", dur: 55, delay: -30, scale: 0.7 },
];
const birds = [
  { x: 0, y: 8, flap: 0.52 },
  { x: 26, y: 0, flap: 0.6 },
  { x: 50, y: 12, flap: 0.47 },
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

      {/* La luz del cielo va y viene entre la mañana y el atardecer */}
      <div className="sky-warm" />

      {/* Sol de tarde: el halo respira y los rayos giran despacio */}
      <div className="sun">
        <svg className="sun-rays" width="150" height="150" viewBox="0 0 150 150">
          <circle cx="75" cy="75" r="66" fill="none" stroke="var(--glow)" strokeWidth="9" strokeDasharray="5 21" strokeLinecap="round" opacity="0.75" />
        </svg>
        <svg className="sun-halo" width="150" height="150" viewBox="0 0 150 150">
          <circle cx="75" cy="75" r="52" fill="var(--glow)" opacity="0.6" />
        </svg>
        <svg width="150" height="150" viewBox="0 0 150 150">
          <circle cx="75" cy="75" r="30" fill="#fbe3a6" />
        </svg>
      </div>

      <div>
        {clouds.map((c, i) => (
          <div
            key={i}
            className="cloud"
            style={{ position: "absolute", top: c.top, left: 0, opacity: c.opacity, animationDuration: `${c.dur}s`, animationDelay: `${c.delay}s` }}
          >
            <div className="cloud-bob" style={{ scale: String(c.scale), animationDuration: `${c.bob}s` }}>
              <Cloud />
            </div>
          </div>
        ))}
      </div>

      {flocks.map((f, i) => (
        <div key={i} className="flock" style={{ top: f.top, animationDuration: `${f.dur}s`, animationDelay: `${f.delay}s` }}>
          <div style={{ scale: String(f.scale) }}>
            {birds.map((b, j) => (
              <svg key={j} className="bird" style={{ left: b.x, top: b.y, animationDuration: `${b.flap}s` }} width="22" height="10" viewBox="0 0 22 10">
                <path d="M1 8 Q6 0 11 7 Q16 0 21 8" fill="none" stroke="var(--ink-faint)" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            ))}
          </div>
        </div>
      ))}

      {/* Colinas en capas */}
      <div className="hills">
      <svg viewBox="0 0 1440 400" preserveAspectRatio="none">
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
        {/* El farol de la casita parpadea (fuera del SVG: así no se repinta el filtro) */}
        <span className="lantern" />
      </div>

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
