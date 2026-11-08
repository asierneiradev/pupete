"use client";

import { useState } from "react";
import { ActionForm, SubmitButton } from "@/components/forms";
import { NameField, PinField } from "@/components/AccessFields";
import { loginWithCodeAction, loginWithPinAction } from "@/app/actions/auth";

type Mode = "pin" | "code" | "forgot";

export function LoginForms({ next, initial = "pin" }: { next: string; initial?: Mode }) {
  const [mode, setMode] = useState<Mode>(initial);
  return (
    <div className="mt-6">
      {mode === "pin" && (
        <ActionForm action={loginWithPinAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <NameField autoFocus placeholder="Ej.: Maite" hint="No importan las mayúsculas ni las tildes." />
          <PinField label="Tu PIN" />
          <SubmitButton className="btn w-full">Entrar ✦</SubmitButton>
        </ActionForm>
      )}

      {mode === "code" && (
        <ActionForm action={loginWithCodeAction} className="flex flex-col gap-4">
          <input type="hidden" name="next" value={next} />
          <label className="field">
            <span>Tu código de invitación</span>
            <input
              name="code"
              required
              autoFocus
              autoComplete="off"
              autoCapitalize="characters"
              autoCorrect="off"
              spellCheck={false}
              placeholder="PINO-4821"
              className="input input-code"
            />
            <span className="hint">El que te dio quien organiza. Después crearás tu PIN.</span>
          </label>
          <SubmitButton className="btn w-full">Continuar ✦</SubmitButton>
        </ActionForm>
      )}

      {mode === "forgot" && (
        <p className="notice notice-info">
          No pasa nada: pide a quien organiza que te <b>resetee el acceso</b>. Te dará un código de invitación nuevo y con él eliges otro PIN.
        </p>
      )}

      <div className="mt-5 flex flex-col items-center gap-2 text-sm">
        {mode !== "pin" && (
          <button type="button" className="link" onClick={() => setMode("pin")}>Entrar con mi nombre y PIN</button>
        )}
        {mode !== "code" && (
          <button type="button" className="link" onClick={() => setMode("code")}>¿Es tu primera vez? Usa tu código de invitación</button>
        )}
        {mode !== "forgot" && (
          <button type="button" className="link" onClick={() => setMode("forgot")}>He olvidado mi PIN</button>
        )}
      </div>
    </div>
  );
}
