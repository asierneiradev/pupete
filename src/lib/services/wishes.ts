/** Listas de deseos. El dueño nunca ve qué se ha comprado. */
import type { User } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { fetchPreview, normalizeUrl, type LinkPreview } from "../og";
import { deleteUnusedUploads } from "../uploads";

export const MAX_WISHES = 30;
export const MAX_LINKS = 5;

export const PRIORITIES = {
  1: { label: "Me encantaría", emoji: "⭐" },
  2: { label: "Me gustaría", emoji: "👍" },
  3: { label: "Si acaso", emoji: "🤷" },
} as const;

export const SURPRISE_WISH = {
  title: "Lo que quieras, sorpréndeme",
  emoji: "🥰",
} as const;

export const EMPTY_LIST_ERROR =
  "Tu lista no puede quedarse vacía: añade alguna idea o marca «Lo que quieras, sorpréndeme».";

export interface WishInput {
  title: string;
  details?: string | null;
  priority?: number;
  priceCents?: number | null;
  imageUrl?: string | null;
  links?: string[];
}

type PreviewFn = (url: string) => Promise<LinkPreview>;

async function participantFor(userId: string, gameId: string) {
  const p = await db.participant.findUnique({ where: { gameId_userId: { gameId, userId } }, include: { game: true } });
  if (!p) throw new AppError("No participas en esta sala.");
  if (p.game.status === "FINISHED") throw new AppError("Esta sala ya está cerrada.");
  return p;
}

function clean(input: WishInput) {
  const title = input.title?.trim().replace(/\s+/g, " ");
  if (!title) throw new AppError("Escribe qué te gustaría.");
  if (title.length > 120) throw new AppError("El nombre del regalo es demasiado largo (máx. 120).");
  const details = input.details?.trim() || null;
  if (details && details.length > 600) throw new AppError("Los detalles son demasiado largos (máx. 600).");
  const priority = [1, 2, 3].includes(Number(input.priority)) ? Number(input.priority) : 2;
  if (input.priceCents != null && (input.priceCents < 0 || input.priceCents > 100_000_00)) {
    throw new AppError("Precio no válido.");
  }
  const rawLinks = (input.links ?? []).map((l) => l.trim()).filter(Boolean);
  if (rawLinks.length > MAX_LINKS) throw new AppError(`Máximo ${MAX_LINKS} enlaces por regalo.`);
  const links = rawLinks.map((l) => {
    const u = normalizeUrl(l);
    if (!u) throw new AppError(`El enlace «${l.slice(0, 40)}» no es válido.`);
    return u;
  });
  const imageUrl = input.imageUrl?.trim() || null;
  if (imageUrl && !imageUrl.startsWith("/api/uploads/") && !normalizeUrl(imageUrl)) {
    throw new AppError("La imagen no es válida.");
  }
  return { title, details, priority, priceCents: input.priceCents ?? null, imageUrl, links: [...new Set(links)] };
}

async function buildLinks(urls: string[], previous: Array<{ url: string; title: string | null; imageUrl: string | null; siteName: string | null; priceText: string | null }>, preview: PreviewFn) {
  return Promise.all(
    urls.map(async (url) => {
      const old = previous.find((p) => p.url === url);
      if (old) return { url, title: old.title, imageUrl: old.imageUrl, siteName: old.siteName, priceText: old.priceText };
      const p = await preview(url).catch(() => ({ url }) as LinkPreview);
      return { url, title: p.title ?? null, imageUrl: p.imageUrl ?? null, siteName: p.siteName ?? null, priceText: p.priceText ?? null };
    }),
  );
}

export async function addWish(user: User, gameId: string, input: WishInput, preview: PreviewFn = fetchPreview) {
  const p = await participantFor(user.id, gameId);
  const data = clean(input);
  if ((await db.wish.count({ where: { participantId: p.id } })) >= MAX_WISHES) {
    throw new AppError(`Máximo ${MAX_WISHES} ideas por persona.`);
  }
  const links = await buildLinks(data.links, [], preview);
  const position = (await db.wish.aggregate({ where: { participantId: p.id }, _max: { position: true } }))._max.position ?? 0;
  // Si no se ha puesto foto, usar la de la primera tienda que tenga
  const imageUrl = data.imageUrl ?? links.find((l) => l.imageUrl)?.imageUrl ?? null;
  return db.wish.create({
    data: {
      participantId: p.id,
      title: data.title,
      details: data.details,
      priority: data.priority,
      priceCents: data.priceCents,
      imageUrl,
      position: position + 1,
      links: { create: links },
    },
    include: { links: true },
  });
}

async function ownWish(user: User, wishId: string) {
  const wish = await db.wish.findUnique({ where: { id: wishId }, include: { participant: { include: { game: true } }, links: true } });
  if (!wish || wish.participant.userId !== user.id) throw new AppError("Esa idea no es tuya.");
  if (wish.participant.game.status === "FINISHED") throw new AppError("Esta sala ya está cerrada.");
  return wish;
}

export async function updateWish(user: User, wishId: string, input: WishInput, preview: PreviewFn = fetchPreview) {
  const wish = await ownWish(user, wishId);
  const data = clean(input);
  const links = await buildLinks(data.links, wish.links, preview);
  const updated = await db.$transaction(async (tx) => {
    await tx.wishLink.deleteMany({ where: { wishId } });
    return tx.wish.update({
      where: { id: wishId },
      data: {
        title: data.title,
        details: data.details,
        priority: data.priority,
        priceCents: data.priceCents,
        imageUrl: data.imageUrl ?? links.find((l) => l.imageUrl)?.imageUrl ?? null,
        links: { create: links },
      },
      include: { links: true },
    });
  });
  if (wish.imageUrl !== updated.imageUrl) await deleteUnusedUploads([wish.imageUrl]);
  return updated;
}

export async function deleteWish(user: User, wishId: string) {
  const wish = await ownWish(user, wishId);
  // No dejar la lista vacía: o hay alguna idea o "sorpréndeme" está marcado
  if (!wish.participant.wantsSurprise && (await db.wish.count({ where: { participantId: wish.participantId } })) <= 1) {
    throw new AppError(EMPTY_LIST_ERROR);
  }
  await db.wish.delete({ where: { id: wishId } });
  await deleteUnusedUploads([wish.imageUrl]);
}

/** El dueño marca o desmarca "Lo que quieras, sorpréndeme" en su lista. */
export async function setWantsSurprise(user: User, gameId: string, value: boolean) {
  const p = await participantFor(user.id, gameId);
  if (!value && (await db.wish.count({ where: { participantId: p.id } })) === 0) {
    throw new AppError(EMPTY_LIST_ERROR);
  }
  await db.participant.update({ where: { id: p.id }, data: { wantsSurprise: value } });
}

/** Estado de mi lista en una sala (para el aviso de lista vacía). */
export async function myListState(user: User, gameId: string) {
  const p = await db.participant.findUnique({
    where: { gameId_userId: { gameId, userId: user.id } },
    include: { _count: { select: { wishes: true } } },
  });
  if (!p) return null;
  return { wantsSurprise: p.wantsSurprise, wishCount: p._count.wishes, empty: !p.wantsSurprise && p._count.wishes === 0 };
}

/** Lista propia: sin el campo "purchased" (sorpresa garantizada). */
export async function listMyWishes(user: User, gameId: string) {
  const p = await db.participant.findUnique({ where: { gameId_userId: { gameId, userId: user.id } } });
  if (!p) return [];
  const wishes = await db.wish.findMany({
    where: { participantId: p.id },
    include: { links: true },
    orderBy: [{ priority: "asc" }, { position: "asc" }],
  });
  return wishes.map(({ purchased: _hidden, ...w }) => w);
}

/** Copia las ideas de otra sala en la que participé (p. ej. el año anterior). */
export async function copyWishesFrom(user: User, gameId: string, fromGameId: string): Promise<number> {
  if (gameId === fromGameId) throw new AppError("Elige otra sala.");
  const target = await participantFor(user.id, gameId);
  const source = await db.participant.findUnique({
    where: { gameId_userId: { gameId: fromGameId, userId: user.id } },
    include: { wishes: { include: { links: true } } },
  });
  if (!source) throw new AppError("No participaste en esa sala.");
  const current = await db.wish.count({ where: { participantId: target.id } });
  if (source.wantsSurprise && !target.wantsSurprise) {
    await db.participant.update({ where: { id: target.id }, data: { wantsSurprise: true } });
  }
  const toCopy = source.wishes.slice(0, Math.max(0, MAX_WISHES - current));
  for (const w of toCopy) {
    await db.wish.create({
      data: {
        participantId: target.id,
        title: w.title,
        details: w.details,
        priority: w.priority,
        priceCents: w.priceCents,
        imageUrl: w.imageUrl,
        position: w.position,
        links: { create: w.links.map(({ url, title, imageUrl, siteName, priceText }) => ({ url, title, imageUrl, siteName, priceText })) },
      },
    });
  }
  return toCopy.length;
}

/** Quien regala marca una idea como comprada (el dueño no lo ve nunca). */
export async function setWishPurchased(user: User, wishId: string, purchased: boolean) {
  const wish = await db.wish.findUnique({ where: { id: wishId }, include: { participant: true } });
  if (!wish) throw new AppError("Esa idea no existe.");
  await assertIsGiverOf(user.id, wish.participant.gameId, wish.participantId);
  await db.wish.update({ where: { id: wishId }, data: { purchased } });
}

export async function setSurprisePurchased(user: User, receiverParticipantId: string, purchased: boolean) {
  const receiver = await db.participant.findUnique({ where: { id: receiverParticipantId } });
  if (!receiver) throw new AppError("Esa persona no existe.");
  if (!receiver.wantsSurprise) throw new AppError("Esa persona no ha marcado «sorpréndeme».");
  await assertIsGiverOf(user.id, receiver.gameId, receiver.id);
  await db.participant.update({ where: { id: receiver.id }, data: { surprisePurchased: purchased } });
}

async function assertIsGiverOf(userId: string, gameId: string, receiverParticipantId: string) {
  const a = await db.assignment.findFirst({
    where: { gameId, receiverId: receiverParticipantId, giver: { userId } },
  });
  if (!a) throw new AppError("Solo quien le regala puede marcar esto.");
}
