"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { ActionForm, SubmitButton } from "./forms";
import { sendMessageAction } from "@/app/actions/wishes";

export interface ChatMsg {
  id: string;
  body: string;
  mine: boolean;
  createdAt: Date | string;
}

export function ChatBox({
  gameId,
  assignmentId,
  messages,
  canWrite,
  otherAvatar,
  timeZone,
}: {
  gameId: string;
  assignmentId: string;
  messages: ChatMsg[];
  canWrite: boolean;
  otherAvatar: string;
  /** Zona horaria fija para que servidor y navegador formateen igual (evita errores de hidratación). */
  timeZone: string;
}) {
  const router = useRouter();
  const endRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);
  // Refresco suave cada 10 s mientras la pestaña está visible
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState === "visible") router.refresh();
    }, 10_000);
    return () => clearInterval(t);
  }, [router]);
  const fmt = new Intl.DateTimeFormat("es-ES", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone });
  return (
    <div className="card flex flex-col">
      <div className="flex max-h-[55vh] min-h-[240px] flex-col gap-3 overflow-y-auto p-4 sm:p-5">
        {messages.length === 0 && (
          <p className="m-auto max-w-xs text-center text-sm text-ink-faint">
            Aún no hay mensajes. Pregunta tallas, gustos o pistas sin desvelar nada 🤫
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`flex items-end gap-2 ${m.mine ? "flex-row-reverse" : ""}`}>
            {!m.mine && <span className="avatar h-8 w-8 flex-none text-base">{otherAvatar}</span>}
            <div className={`max-w-[78%] rounded-3xl px-4 py-2.5 ${m.mine ? "rounded-br-md bg-moss text-paper-2" : "rounded-bl-md bg-paper-3"}`}>
              <p className="whitespace-pre-line break-words">{m.body}</p>
              <p className={`mt-1 font-mono text-[0.62rem] ${m.mine ? "text-paper-2/75" : "text-ink-faint"}`}>{fmt.format(new Date(m.createdAt))}</p>
            </div>
          </div>
        ))}
        <div ref={endRef} />
      </div>
      {canWrite ? (
        <ActionForm action={sendMessageAction.bind(null, gameId, assignmentId)} resetOnSuccess onSuccess={() => router.refresh()} className="flex items-end gap-2 border-t border-line p-3">
          <textarea name="body" required maxLength={1000} rows={1} className="textarea min-h-[44px] flex-1 resize-none" placeholder="Tu mensaje…" />
          <SubmitButton pendingText="…">Enviar</SubmitButton>
        </ActionForm>
      ) : (
        <p className="border-t border-line p-3 text-center text-sm text-ink-faint">La conversación está cerrada.</p>
      )}
    </div>
  );
}
