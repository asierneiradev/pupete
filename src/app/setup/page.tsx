import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { needsSetup, setupTokenRequired } from "@/lib/services/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { setupAction } from "@/app/actions/auth";
import { Lantern } from "@/components/Logo";
import { NameField, NewPinFields } from "@/components/AccessFields";

export const metadata: Metadata = { title: "Primer arranque" };
export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (!(await needsSetup())) redirect("/");
  return (
    <div className="mx-auto max-w-md pt-6">
      <div className="card p-6 sm:p-8 rise">
        <Lantern size={36} />
        <p className="dot-label mt-3">Primer arranque</p>
        <h1 className="font-dot text-4xl font-bold">HOLA 👋</h1>
        <p className="story mt-2 text-lg text-ink-soft">
          Vamos a encender el primer farolillo. Crea tu cuenta de administración: podrás crear salas, invitar a la familia y lanzar el sorteo.
        </p>
        <ActionForm action={setupAction} className="mt-6 flex flex-col gap-4">
          {setupTokenRequired() && (
            <label className="field">
              <span>Token de primer arranque</span>
              <input name="setupToken" type="password" required autoComplete="off" spellCheck={false} />
              <span className="hint">Es el valor de SETUP_TOKEN en el .env del servidor.</span>
            </label>
          )}
          <NameField placeholder="Maite" hint="Con tu nombre y tu PIN entrarás desde cualquier móvil u ordenador." />
          <NewPinFields />
          <SubmitButton className="btn w-full">Crear mi cuenta</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
