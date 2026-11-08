import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/session";
import { hasAccess, needsSetup } from "@/lib/services/auth";
import { listGamesForUser } from "@/lib/services/games";
import { GameCard } from "@/components/GameCard";
import { Lantern } from "@/components/Logo";

export const dynamic = "force-dynamic";

function Landing() {
  const steps = [
    ["01", "Crea la sala", "Fecha, presupuesto, adultos y peques… tú decides las reglas."],
    ["02", "Cada uno su lista", "Ideas con enlaces de compra, tallas y gustos. Y, si quieres, «sorpréndeme 🥰»."],
    ["03", "Sorteo mágico", "Nadie se toca a sí mismo, ni a su pareja, ni repite el del año pasado."],
    ["04", "Abre tu sobre", "Descubre a quién regalas y pregúntale cosas de forma anónima."],
  ];
  return (
    <div className="pt-6 sm:pt-12">
      <section className="text-center rise">
        <p className="dot-label justify-center">Amigo invisible · edición familiar</p>
        <h1 className="mt-4 font-dot text-[3.4rem] sm:text-[5.5rem] font-bold leading-[0.95]">
          REGALOS
          <br />
          CON ALMA
        </h1>
        <p className="story mx-auto mt-5 max-w-xl text-xl sm:text-2xl text-ink-soft">
          Un rincón tranquilo del bosque donde cada farolillo guarda una sorpresa.
        </p>
        <div className="mt-8 flex justify-center gap-3">
          <Link href="/entrar" className="btn text-base px-7">Entrar</Link>
        </div>
      </section>
      <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map(([n, t, d], i) => (
          <div key={n} className={`card-soft p-5 rise rise-${Math.min(i + 1, 4)}`}>
            <span className="font-dot text-3xl font-bold text-red">{n}</span>
            <h3 className="mt-2 font-bold">{t}</h3>
            <p className="mt-1 text-sm text-ink-soft">{d}</p>
          </div>
        ))}
      </section>
    </div>
  );
}

export default async function Home() {
  const user = await getCurrentUser();
  if (!user) {
    if (await needsSetup()) redirect("/setup");
    return <Landing />;
  }
  if (!hasAccess(user)) redirect("/acceso");
  const { participating, managed } = await listGamesForUser(user);
  const participatingIds = new Set(participating.map((g) => g.id));
  const onlyManaged = managed.filter((g) => !participatingIds.has(g.id));
  const hour = Number(new Intl.DateTimeFormat("es-ES", { hour: "numeric", hour12: false, timeZone: process.env.APP_TIMEZONE || "Europe/Madrid" }).format(new Date()));
  const greeting = hour < 7 ? "Buenas noches" : hour < 14 ? "Buenos días" : hour < 21 ? "Buenas tardes" : "Buenas noches";

  return (
    <div className="pt-2">
      <section className="rise flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="dot-label">{greeting}</p>
          <h1 className="mt-2 font-dot text-5xl sm:text-6xl font-bold leading-none">
            {user.name.split(" ")[0].toUpperCase()} <span className="not-italic">{user.avatar}</span>
          </h1>
        </div>
        {user.role === "ADMIN" && (
          <Link href="/admin/nueva" className="btn">+ Nueva sala</Link>
        )}
      </section>

      <section className="mt-10">
        <h2 className="dot-label">Mis amigos invisibles</h2>
        {participating.length === 0 ? (
          <div className="card-soft mt-4 flex items-center gap-4 p-6">
            <Lantern size={30} />
            <p className="text-ink-soft">
              Todavía no estás en ninguna sala. Cuando te inviten, aparecerá aquí.
              {user.role === "ADMIN" && " Como admin, puedes crear la primera."}
            </p>
          </div>
        ) : (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {participating.map((g, i) => (
              <div key={g.id} className={`rise rise-${Math.min(i + 1, 4)}`}>
                <GameCard game={g} href={`/sala/${g.id}`} count={g._count.participants} />
              </div>
            ))}
          </div>
        )}
      </section>

      {user.role === "ADMIN" && (
        <section className="mt-12">
          <div className="flex items-center justify-between">
            <h2 className="dot-label">Salas que organizo</h2>
            <Link href="/admin/usuarios" className="link text-sm">Personas y admins</Link>
          </div>
          {managed.length === 0 ? (
            <p className="mt-4 text-ink-soft">Aún no hay salas creadas.</p>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...participating.filter((g) => managed.some((m) => m.id === g.id)), ...onlyManaged].map((g) => (
                <GameCard key={g.id} game={g} href={`/sala/${g.id}/admin`} count={g._count.participants} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
