"use client";

import { useEffect, useState } from "react";
import { removePushSubscriptionAction, savePushSubscriptionAction, testPushAction } from "@/app/actions/wishes";

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
 * `hint`: de qué se avisa (cambia según la pantalla).
 */
export function PushToggle({
  publicKey,
  compact = false,
  hint = "Te llegará un aviso cuando tu amigo invisible (o la persona a la que regalas) te escriba.",
  title = "Que no se te escape ningún mensaje",
}: {
  publicKey: string;
  compact?: boolean;
  hint?: string;
  title?: string;
}) {
  const [state, setState] = useState<State>("loading");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);

  const sendTest = async () => {
    setBusy(true);
    setTest(null);
    try {
      const r = await testPushAction();
      setTest({ ok: r.ok, text: r.ok ? (r.message ?? "Aviso enviado.") : r.error });
    } finally {
      setBusy(false);
    }
  };

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
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="chip chip-moss">🔔 Avisos activados en este dispositivo</span>
              <button type="button" className="btn btn-sm" onClick={sendTest} disabled={busy}>Enviarme un aviso de prueba</button>
              <button type="button" className="btn btn-ghost btn-sm" onClick={disable} disabled={busy}>Desactivar</button>
            </div>
            {test && <p role="status" className={`notice ${test.ok ? "notice-ok" : "notice-err"}`}>{test.text}</p>}
            <details className="text-sm text-ink-soft">
              <summary className="cursor-pointer font-semibold">¿No te llegan los avisos?</summary>
              <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5">
                <li>Pulsa «Enviarme un aviso de prueba» y espera unos segundos con el móvil bloqueado.</li>
                <li>
                  <b>Android:</b> en Ajustes → Aplicaciones → Chrome (o Pupete) → Notificaciones, comprueba que están permitidas. En Ajustes →
                  Batería, quita el ahorro de batería para Chrome: algunos móviles (Xiaomi, Huawei, Samsung) frenan los avisos.
                </li>
                <li>
                  <b>Instala Pupete en la pantalla de inicio</b> (menú ⋮ de Chrome → «Añadir a pantalla de inicio» o «Instalar aplicación»): los
                  avisos llegan mejor y con el icono de Pupete.
                </li>
                <li><b>iPhone:</b> solo funcionan abriendo Pupete desde el icono de la pantalla de inicio.</li>
                <li>Si sigue sin llegar, pulsa «Desactivar» y vuelve a activarlos.</li>
              </ul>
            </details>
          </div>
        );
      case "off":
        return (
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className="btn btn-sm" onClick={enable} disabled={busy}>
              🔔 {busy ? "Activando…" : "Avisarme en este móvil"}
            </button>
            <span className="hint">{hint}</span>
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
      {compact && <p className="dot-label">{title}</p>}
      {body}
      {error && <p className="notice notice-err">{error}</p>}
    </div>
  );
}
