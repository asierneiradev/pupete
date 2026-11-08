"use client";

import { createContext, startTransition, useActionState, useContext, useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { useRouter } from "next/navigation";
import type { ActionResult } from "@/lib/errors";

type FormAction = (prev: unknown, fd: FormData) => Promise<ActionResult<unknown>>;

/** "Enviando…" de un ActionForm (ver por qué no basta useFormStatus más abajo). */
const PendingContext = createContext(false);

export function SubmitButton({
  children,
  className = "btn",
  pendingText = "Un momento…",
}: {
  children: ReactNode;
  className?: string;
  pendingText?: string;
}) {
  const status = useFormStatus();
  const pending = useContext(PendingContext) || status.pending;
  return (
    <button type="submit" className={className} disabled={pending} aria-disabled={pending}>
      {pending ? (
        <>
          <span className="inline-block w-2 h-2 rounded-full bg-current pulse-dot" aria-hidden />
          {pendingText}
        </>
      ) : (
        children
      )}
    </button>
  );
}

export function Notice({ result }: { result: ActionResult<unknown> | null | undefined }) {
  if (!result) return null;
  if (result.ok && !result.message) return null;
  return (
    <p role={result.ok ? "status" : "alert"} className={`notice ${result.ok ? "notice-ok" : "notice-err"}`}>
      {result.ok ? result.message : result.error}
    </p>
  );
}

/**
 * Formulario conectado a una server action, con mensajes de error/éxito.
 * `resetOnSuccess` limpia los campos (útil para "añadir").
 */
export function ActionForm({
  action,
  children,
  className = "",
  resetOnSuccess = false,
  onSuccess,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  resetOnSuccess?: boolean;
  onSuccess?: (r: ActionResult<unknown>) => void;
}) {
  const [state, formAction, isPending] = useActionState(action, null);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) {
      if (resetOnSuccess) ref.current?.reset();
      onSuccess?.(state);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);
  return (
    // Enviamos a mano en vez de usar <form action={serverAction}>:
    // - React 19 vacía el formulario tras cada envío con `action`, también si
    //   hay error: en el móvil obligaba a reescribirlo todo por un PIN mal repetido.
    // - Los campos ocultos que React pinta para "funcionar sin JavaScript"
    //   fallaban a veces al hidratar en producción (React #418).
    // method="post": si se envía antes de cargar el JS, nada (PIN incluido)
    // acaba en la URL.
    <form
      ref={ref}
      method="post"
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLElement | null;
        const fd = new FormData(e.currentTarget, submitter);
        startTransition(() => formAction(fd));
      }}
    >
      <PendingContext.Provider value={isPending}>{children}</PendingContext.Provider>
      <div aria-live="polite" className="empty:hidden">
        <Notice result={state} />
      </div>
    </form>
  );
}

/** Botón que ejecuta una acción directa (sin formulario), con confirmación opcional. */
export function ActionButton({
  action,
  children,
  className = "btn btn-ghost btn-sm",
  confirm,
  showResult = true,
}: {
  action: () => Promise<ActionResult<unknown>>;
  children: ReactNode;
  className?: string;
  confirm?: string;
  showResult?: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult<unknown> | null>(null);
  const router = useRouter();
  return (
    <span className="inline-flex flex-col gap-2">
      <button
        type="button"
        className={className}
        disabled={pending}
        onClick={() => {
          if (confirm && !window.confirm(confirm)) return;
          start(async () => {
            const r = await action();
            setResult(r);
            router.refresh();
          });
        }}
      >
        {pending ? <span className="inline-block w-2 h-2 rounded-full bg-current pulse-dot" aria-hidden /> : null}
        {children}
      </button>
      {showResult && result && (!result.ok || result.message) ? <Notice result={result} /> : null}
    </span>
  );
}

export function CopyButton({ text, label = "Copiar", className = "btn btn-ghost btn-sm" }: { text: string; label?: string; className?: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      className={className}
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
        } catch {
          const ta = document.createElement("textarea");
          ta.value = text;
          document.body.appendChild(ta);
          ta.select();
          document.execCommand("copy");
          ta.remove();
        }
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? "¡Copiado! ✓" : label}
    </button>
  );
}

export function ShareButton({ text, url, label = "Compartir" }: { text: string; url: string; label?: string }) {
  const [canShare, setCanShare] = useState(false);
  useEffect(() => setCanShare(typeof navigator !== "undefined" && "share" in navigator), []);
  const wa = `https://wa.me/?text=${encodeURIComponent(`${text} ${url}`)}`;
  return canShare ? (
    <button type="button" className="btn btn-ghost btn-sm" onClick={() => navigator.share({ text, url }).catch(() => {})}>
      {label}
    </button>
  ) : (
    <a className="btn btn-ghost btn-sm" href={wa} target="_blank" rel="noopener noreferrer">
      WhatsApp
    </a>
  );
}
