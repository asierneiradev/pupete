"use client";

import { useEffect, useState } from "react";
import { removePushSubscriptionAction, savePushSubscriptionAction } from "@/app/actions/wishes";

type State = "loading" | "unsupported" | "ios-install" | "denied" | "off" | "on";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

function isIos() {
  return /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
}

/**
 * Activa/desactiva los avisos push en este dispositivo.
 * `compact`: versión banner (se oculta sola si ya están activados o no se puede).
 */
export function PushToggle({ publicKey, compact = false }: { publicKey: string; compact?: boolean }) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
      if (!supported) {
        setState(isIos() && !isStandalone() ? "ios-install" : "unsupported");
        return;
      }
      if (Notification.permission === "denied") {
        setState("denied");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        // Re-guardamos por si la suscripción cambió o la sesión es de otra persona
        await savePushSubscriptionAction(sub.toJSON());
        setState("on");
      } else {
        setState("off");
      }
    })().catch(() => setState("unsupported"));
  }, []);

  const enable = async () => {
    setBusy(true);
    setError(null);
    try {
      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setState(perm === "denied" ? "denied" : "off");
        return;
      }
      const reg = await navigator.serviceWorker.register("/sw.js");
      await navigator.serviceWorker.ready;
      const sub =
        (await reg.pushManager.getSubscription()) ??
        (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(publicKey) }));
      const r = await savePushSubscriptionAction(sub.toJSON());
      if (!r.ok) throw new Error(r.error);
      setState("on");
    } catch (e) {
      setError((e as Error).message || "No se han podido activar los avisos.");
    } finally {
      setBusy(false);
    }
  };

  const disable = async () => {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      if (sub) {
        await removePushSubscriptionAction(sub.endpoint);
        await sub.unsubscribe();
      }
      setState("off");
    } finally {
      setBusy(false);
    }
  };

  if (state === "loading") return null;
  if (compact && (state === "on" || state === "unsupported" || state === "denied")) return null;

  const body = (() => {
    switch (state) {
      case "on":
        return (
          <div className="flex flex-wrap items-center gap-3">
            <span className="chip chip-moss">🔔 Avisos activados en este dispositivo</span>
            <button type="button" className="btn btn-ghost btn-sm" onClick={disable} disabled={busy}>Desactivar</button>
          </div>
        );
      case "off":
        return (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-sm" onClick={enable} disabled={busy}>
              🔔 {busy ? "Activando…" : "Avisarme en este móvil"}
            </button>
            <span className="hint">Te llegará un aviso cuando tu amigo invisible (o la persona a la que regalas) te escriba.</span>
          </div>
        );
      case "denied":
        return <p className="hint">Has bloqueado los avisos para Pupete. Puedes volver a permitirlos en los ajustes del navegador (icono del candado junto a la dirección).</p>;
      case "ios-install":
        return (
          <p className="hint">
            En iPhone los avisos solo funcionan con Pupete en la pantalla de inicio: pulsa <b>Compartir</b> → <b>Añadir a pantalla de inicio</b>, ábrela desde ese icono y activa aquí los avisos.
          </p>
        );
      default:
        return <p className="hint">Este navegador no admite avisos.</p>;
    }
  })();

  return (
    <div className={compact ? "card-soft flex flex-col gap-2 p-4" : "flex flex-col gap-2"}>
      {compact && <p className="dot-label">Que no se te escape ningún mensaje</p>}
      {body}
      {error && <p className="notice notice-err">{error}</p>}
    </div>
  );
}
