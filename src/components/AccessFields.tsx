/**
 * Campos de nombre y PIN pensados para móvil (y para gente mayor):
 * - Nombre: es el usuario para entrar. Mayúscula inicial automática, sin
 *   autocorrector (cambiaría «Iñaki» por otra palabra). No importan mayúsculas,
 *   tildes ni signos al entrar.
 * - PIN: teclado numérico en iOS y Android (inputMode + pattern), oculto como
 *   contraseña para que el gestor de contraseñas lo pueda guardar.
 */
export function NameField({
  defaultValue,
  hint,
  autoFocus,
  label = "Tu nombre",
  placeholder = "Como te conoce la familia",
}: {
  defaultValue?: string | null;
  hint?: string;
  autoFocus?: boolean;
  label?: string;
  placeholder?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name="name"
        type="text"
        required
        autoFocus={autoFocus}
        autoComplete="username"
        autoCapitalize="words"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint="next"
        defaultValue={defaultValue ?? ""}
        maxLength={60}
        placeholder={placeholder}
        className="input"
      />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

export function PinField({
  name = "pin",
  label = "PIN (4 números)",
  isNew = false,
  hint,
}: {
  name?: string;
  label?: string;
  /** true al crear/cambiar el PIN (el gestor de contraseñas ofrece guardarlo). */
  isNew?: boolean;
  hint?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        name={name}
        type="password"
        required
        inputMode="numeric"
        pattern="[0-9]{4}"
        minLength={4}
        maxLength={4}
        autoComplete={isNew ? "new-password" : "current-password"}
        enterKeyHint={name === "pin2" || !isNew ? "go" : "next"}
        placeholder="••••"
        title="4 números"
        className="input input-pin"
      />
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

/** PIN + repetir PIN, para crearlo o cambiarlo. */
export function NewPinFields() {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <PinField isNew label="Elige un PIN" />
        <PinField isNew name="pin2" label="Repítelo" />
      </div>
      <p className="hint -mt-2">4 números que recuerdes. Nada de 1234 ni 0000 😉</p>
    </>
  );
}
