/** Selector adulto/niño (solo si la sala separa grupos). */
export function GroupPicker({ defaultValue = "ADULT", name = "group" }: { defaultValue?: "ADULT" | "CHILD"; name?: string }) {
  return (
    <fieldset>
      <legend className="label">¿Quién participa?</legend>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <label className="option">
          <input type="radio" name={name} value="ADULT" defaultChecked={defaultValue === "ADULT"} />
          <span><b>🧑 Adulto</b></span>
        </label>
        <label className="option">
          <input type="radio" name={name} value="CHILD" defaultChecked={defaultValue === "CHILD"} />
          <span><b>🧒 Peque</b></span>
        </label>
      </div>
    </fieldset>
  );
}
