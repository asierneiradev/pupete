import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/session";
import { getChatThread } from "@/lib/services/chat";
import { AppError } from "@/lib/errors";
import { ChatBox } from "@/components/ChatBox";
import { appTimeZone } from "@/lib/dates";
import { PushToggle } from "@/components/PushToggle";
import { vapidPublicKey } from "@/lib/push";

export const metadata: Metadata = { title: "Buzón secreto" };

export default async function ChatPage({ params }: { params: Promise<{ id: string; assignmentId: string }> }) {
  const { id, assignmentId } = await params;
  const user = await requireUser(`/sala/${id}/chat/${assignmentId}`);
  const game = await db.game.findUnique({ where: { id } });
  if (!game) notFound();
  let thread;
  try {
    thread = await getChatThread(user, assignmentId);
  } catch (e) {
    if (e instanceof AppError) notFound();
    throw e;
  }
  const pushKey = vapidPublicKey();
  return (
    <div className="mx-auto max-w-2xl">
      <Link href={`/sala/${id}?zona=${thread.role === "GIVER" ? "regalo" : "mia"}`} className="link text-sm">← Volver a {game.name}</Link>
      <section className={`zone mt-4 rise ${thread.role === "GIVER" ? "zone-give" : "zone-mine"}`}>
        <div className="zone-head">
          <span className="avatar h-14 w-14 text-3xl">{thread.otherAvatar}</span>
          <div className="min-w-0">
            <p className="dot-label">{thread.role === "GIVER" ? "Tú regalas a · le escribes en secreto" : "Te escribe en secreto"}</p>
            <h1 className="font-dot text-3xl font-bold">{thread.otherName.toUpperCase()}</h1>
          </div>
        </div>
        <p className="px-5 py-3 text-sm text-ink-soft sm:px-7">
          {thread.role === "GIVER"
            ? "Tu nombre no aparece nunca. ¡Cuidado con las pistas!"
            : "No sabrás quién es hasta el día del intercambio."}
        </p>
      </section>
      {pushKey && (
        <div className="mt-4">
          <PushToggle publicKey={pushKey} compact />
        </div>
      )}
      <div className="mt-4 rise rise-2">
        <ChatBox gameId={id} assignmentId={assignmentId} messages={thread.messages} canWrite={game.status === "DRAWN"} otherAvatar={thread.otherAvatar} timeZone={appTimeZone()} />
      </div>
    </div>
  );
}
