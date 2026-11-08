import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser, safeNext } from "@/lib/session";
import { hasAccess } from "@/lib/services/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { NameField, NewPinFields } from "@/components/AccessFields";
import { setAccessAction } from "@/app/actions/auth";
import { Lantern } from "@/components/Logo";

export const metadata: Metadata = { title: "Crea tu PIN" };

/** Tras entrar con el código de invitación: confirmar el nombre y crear el PIN (obligatorio). */
export default async function AccesoPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const sp = await searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/entrar");
  const next = safeNext(sp.next);
  if (hasAccess(user)) redirect(next);
  return (
    <div className="mx-auto max-w-md pt-6">
      <div className="card p-6 sm:p-8 rise">
        <div className="flex items-center gap-3">
          <Lantern size={34} />
          <div>
            <p className="dot-label">Hola, {user.name.split(" ")[0]} {user.avatar}</p>
            <h1 className="font-dot text-4xl font-bold leading-tight">TU PIN</h1>
          </div>
        </div>
        <p className="story mt-3 text-lg text-ink-soft">
          Un último paso: elige tu PIN. A partir de ahora entrarás con tu nombre y estos 4 números.
        </p>
        <ActionForm action={setAccessAction} className="mt-6 flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <NameField
            defaultValue={user.name}
            label="Tu nombre para entrar"
            hint="Puedes dejarlo así. Si alguien de la familia se llama igual, añade una inicial (p. ej. «Maite G.»)."
          />
          <NewPinFields />
          <SubmitButton className="btn w-full">Guardar y entrar ✦</SubmitButton>
        </ActionForm>
      </div>
    </div>
  );
}
