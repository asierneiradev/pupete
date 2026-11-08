import type { Metadata } from "next";
import { requireUser } from "@/lib/session";
import { AVATARS } from "@/lib/services/auth";
import { ActionForm, SubmitButton } from "@/components/forms";
import { setAccessAction, updateProfileAction } from "@/app/actions/auth";
import { NewPinFields } from "@/components/AccessFields";
import { PushToggle } from "@/components/PushToggle";
import { vapidPublicKey } from "@/lib/push";

export const metadata: Metadata = { title: "Mi perfil" };

export default async function PerfilPage({ searchParams }: { searchParams: Promise<{ bienvenida?: string }> }) {
  const user = await requireUser("/perfil");
  const sp = await searchParams;
  const pushKey = vapidPublicKey();
  const text = (name: keyof typeof user, label: string, placeholder: string, max = 20) => (
    <label className="field">
      <span>{label}</span>
      <input name={name} defaultValue={(user[name] as string | null) ?? ""} maxLength={max} className="input" placeholder={placeholder} />
    </label>
  );
  return (
    <div className="mx-auto max-w-3xl">
      <p className="dot-label rise">Mi perfil</p>
      <h1 className="font-dot text-5xl font-bold rise">{user.avatar} {user.name.split(" ")[0].toUpperCase()}</h1>

      {sp.bienvenida && (
        <p className="notice notice-ok mt-4 rise">¡Bienvenida/o! Para volver a entrar usa tu nombre y tu PIN.</p>
      )}

      <section className="card mt-6 p-5 sm:p-6 rise">
        <h2 className="font-bold text-lg">Mi acceso</h2>
        <p className="hint mt-1">
          Entras con tu nombre (<b>{user.name}</b>) y tu PIN. Aquí puedes cambiar el PIN; el nombre se cambia más abajo, en «Quién soy».
        </p>
        <ActionForm action={setAccessAction} resetOnSuccess className="mt-4 flex flex-col gap-4">
          <NewPinFields />
          <div className="flex justify-end">
            <SubmitButton pendingText="Guardando…">Cambiar PIN</SubmitButton>
          </div>
        </ActionForm>
      </section>

      {pushKey && (
        <section className="card mt-6 p-5 sm:p-6 rise rise-2">
          <h2 className="font-bold text-lg">Avisos en el móvil</h2>
          <p className="hint mt-1 mb-4">Actívalos en cada móvil u ordenador donde quieras enterarte de los mensajes del buzón secreto.</p>
          <PushToggle publicKey={pushKey} />
        </section>
      )}

      <ActionForm action={updateProfileAction} className="mt-6 flex flex-col gap-6">
        <section className="card p-5 sm:p-6 rise rise-2">
          <h2 className="font-bold text-lg">Quién soy</h2>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="field">
              <span>Nombre</span>
              <input name="name" required defaultValue={user.name} maxLength={60} className="input" />
              <span className="hint">Es también tu nombre para entrar.</span>
            </label>
          </div>
          <fieldset className="mt-5">
            <legend className="label">Mi avatar</legend>
            <div className="mt-2 flex flex-wrap gap-2">
              {AVATARS.map((a) => (
                <label key={a} className="cursor-pointer">
                  <input type="radio" name="avatar" value={a} defaultChecked={a === user.avatar} className="peer sr-only" />
                  <span className="avatar w-11 h-11 text-2xl transition-all peer-checked:ring-4 peer-checked:ring-moss peer-checked:scale-110 peer-focus-visible:ring-4 peer-focus-visible:ring-sky">
                    {a}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        </section>

        <section className="card p-5 sm:p-6 rise rise-3">
          <h2 className="font-bold text-lg">Mi ficha para quien me regale</h2>
          <p className="hint mt-1">Solo la verá la persona a la que le toque regalarte.</p>
          <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {text("shirtSize", "Talla de camiseta", "M")}
            {text("pantsSize", "Talla de pantalón", "40")}
            {text("shoeSize", "Número de calzado", "39")}
          </div>
          <div className="mt-4 grid grid-cols-1 gap-4">
            {text("favoriteColors", "Colores favoritos", "verde musgo, mostaza…", 120)}
            <label className="field">
              <span>Me encanta…</span>
              <textarea name="likes" defaultValue={user.likes ?? ""} maxLength={500} className="textarea" placeholder="Leer novela negra, el té, la montaña, los puzzles…" />
            </label>
            <label className="field">
              <span>Por favor, no me regales…</span>
              <textarea name="dislikes" defaultValue={user.dislikes ?? ""} maxLength={500} className="textarea" placeholder="Colonias, tazas (¡tengo 40!), figuritas…" />
            </label>
            {text("allergies", "Alergias o cosas a evitar", "frutos secos, lana…", 200)}
          </div>
        </section>

        <div className="flex justify-end">
          <SubmitButton>Guardar perfil</SubmitButton>
        </div>
      </ActionForm>
    </div>
  );
}
