import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { getCurrentUser, safeNext } from "@/lib/session";
import { needsSetup } from "@/lib/services/auth";
import { LoginForms } from "./LoginForms";
import { Lantern } from "@/components/Logo";

export const metadata: Metadata = { title: "Entrar" };

export default async function EntrarPage({ searchParams }: { searchParams: Promise<{ next?: string; codigo?: string }> }) {
  const sp = await searchParams;
  if (await getCurrentUser()) redirect(safeNext(sp.next));
  if (await needsSetup()) redirect("/setup");
  return (
    <div className="mx-auto max-w-md pt-6">
      <div className="card p-6 sm:p-8 rise">
        <div className="flex items-center gap-3">
          <Lantern size={34} />
          <div>
            <p className="dot-label">Bienvenida</p>
            <h1 className="font-dot text-4xl font-bold leading-tight">ENTRAR</h1>
          </div>
        </div>
        <p className="story mt-3 text-lg text-ink-soft">Tu nombre y tu PIN son la llave de tu casita en el bosque.</p>
        <LoginForms next={sp.next ?? ""} initial={sp.codigo ? "code" : "pin"} />
      </div>
      <p className="mx-auto mt-5 w-fit rounded-2xl bg-paper/85 px-4 py-2 text-center text-sm text-ink-soft">
        ¿Te han pasado un enlace de invitación? Ábrelo directamente y podrás crear tu perfil.
      </p>
      <p className="mt-3 text-center text-sm">
        <Link className="link rounded-full bg-paper/85 px-3 py-1" href="/">Volver al inicio</Link>
      </p>
    </div>
  );
}
