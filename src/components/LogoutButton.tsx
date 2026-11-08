"use client";

import { useTransition } from "react";
import { logoutAction } from "@/app/actions/auth";

/**
 * Botón "Salir". Antes era un <form action={logoutAction}> pintado desde el
 * Header (componente de servidor) y, en producción, a veces fallaba la
 * hidratación (React #418) por el input oculto de la acción.
 */
export function LogoutButton() {
  const [pending, start] = useTransition();
  return (
    <button type="button" className="btn btn-ghost btn-sm" disabled={pending} onClick={() => start(() => logoutAction())}>
      Salir
    </button>
  );
}
