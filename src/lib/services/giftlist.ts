/**
 * Salas de "lista de regalos" (cumpleaños, boda, Reyes…): sin sorteo.
 *
 * Quien recibe (honoree) tiene su lista. Los demás la ven, se piden qué regalan
 * ("yo lo regalo", solos o entre varios) y pueden proponer ideas secretas.
 *
 * La lista de cada uno nace como borrador (`Participant.listPublishedAt` a null):
 * hasta que su dueño la publica, los demás no ven sus ideas ni pueden pedírselas.
 *
 * Regla de oro: NADIE ve, sobre su propia lista, ni quién se ha pedido qué, ni
 * qué está comprado, ni las ideas secretas. Todo lo que devuelve este fichero
 * excluye la lista de quien pregunta.
 *
 * Única excepción: `getThanks`, y solo con la sala cerrada, la celebración ya
 * pasada y si quien organiza lo activó al cerrar ("agradecimientos").
 */
import type { Game, Participant, User } from "@prisma/client";
import { db } from "../db";
import { AppError } from "../errors";
import { fetchPreview, type LinkPreview } from "../og";
import { deleteUnusedUploads } from "../uploads";
import { canManage } from "./games";
import { buildWishLinks, cleanWish, type WishInput } from "./wishes";

export const MAX_SECRET_WISHES = 30;

type PreviewFn = (url: string) => Promise<LinkPreview>;

async function giftGame(gameId: string): Promise<Game> {
  const game = await db.game.findUnique({ where: { id: gameId } });
  if (!game) throw new AppError("La sala no existe.");
  if (game.kind !== "GIFT_LIST") throw new AppError("Esta sala no es una lista de regalos.");
  return game;
}

function assertActive(game: Game) {
  if (game.status === "FINISHED") throw new AppError("Esta sala ya está cerrada.");
}

async function participantOf(userId: string, gameId: string): Promise<Participant | null> {
  return db.participant.findUnique({ where: { gameId_userId: { gameId, userId } } });
}

/**
 * Las listas de los demás, con quién se ha pedido cada regalo.
 * Nunca incluye la lista de quien pregunta.
 */
export async function getGiftLists(user: User, gameId: string) {
  const game = await giftGame(gameId);
  const me = await participantOf(user.id, gameId);
  const manager = canManage(user, game);
  if (!me && !manager) throw new AppError("No participas en esta sala.");
  const honorees = await db.participant.findMany({
    where: { gameId, honoree: true, userId: { not: user.id } },
    include: {
      user: true,
      wishes: {
        include: {
          links: true,
          addedBy: { select: { name: true } },
          claims: { include: { participant: { include: { user: { select: { name: true, avatar: true } } } } }, orderBy: { createdAt: "asc" } },
        },
        orderBy: [{ priority: "asc" }, { position: "asc" }, { createdAt: "asc" }],
      },
    },
    orderBy: { joinedAt: "asc" },
  });
  return honorees.map((h) => {
    const u = h.user;
    return {
      participantId: h.id,
      name: u.name,
      avatar: u.avatar,
      profile: {
        shirtSize: u.shirtSize,
        pantsSize: u.pantsSize,
        shoeSize: u.shoeSize,
        favoriteColors: u.favoriteColors,
        likes: u.likes,
        dislikes: u.dislikes,
        allergies: u.allergies,
      },
      /** false = su lista sigue en borrador: solo se ven las ideas propuestas por otros */
      published: Boolean(h.listPublishedAt),
      wishes: h.wishes.filter((w) => w.secret || h.listPublishedAt).map((w) => {
        const mine = me ? w.claims.some((c) => c.participantId === me.id) : false;
        return {
          id: w.id,
          title: w.title,
          details: w.details,
          priority: w.priority,
          priceCents: w.priceCents,
          imageUrl: w.imageUrl,
          links: w.links,
          purchased: w.purchased,
          secret: w.secret,
          addedByName: w.secret ? (w.addedBy?.name ?? null) : null,
          /** Puedo editarla/borrarla: la propuse yo o gestiono la sala */
          canEdit: w.secret && (w.addedById === user.id || manager),
          joint: w.claims.some((c) => c.joint),
          mine,
          /** Bote común (regalo entre varios): lo que llevan puesto entre todos */
          potCents: w.claims.reduce((sum, c) => sum + (c.joint ? (c.amountCents ?? 0) : 0), 0),
          claimers: w.claims.map((c) => ({
            name: c.participant.user.name,
            avatar: c.participant.user.avatar,
            me: me ? c.participantId === me.id : false,
            amountCents: c.joint ? c.amountCents : null,
          })),
        };
      }),
    };
  });
}

/** Lo que yo me he pedido en esta sala (mi "lista de la compra"). */
export async function myClaims(user: User, gameId: string) {
  const me = await participantOf(user.id, gameId);
  if (!me) return [];
  const claims = await db.wishClaim.findMany({
    where: { participantId: me.id, wish: { participant: { gameId } } },
    include: { wish: { include: { participant: { include: { user: { select: { name: true, avatar: true } } } } } } },
    orderBy: { createdAt: "asc" },
  });
  return claims.map((c) => ({
    wishId: c.wishId,
    title: c.wish.title,
    priceCents: c.wish.priceCents,
    purchased: c.wish.purchased,
    joint: c.joint,
    /** Lo que pongo yo en un regalo entre varios */
    amountCents: c.joint ? c.amountCents : null,
    forName: c.wish.participant.user.name,
    forAvatar: c.wish.participant.user.avatar,
    forParticipantId: c.wish.participantId,
  }));
}

/** Carga un regalo de una lista AJENA en la que puedo actuar como invitado. */
async function othersWish(user: User, wishId: string) {
  const wish = await db.wish.findUnique({
    where: { id: wishId },
    include: { participant: { include: { game: true } }, links: true },
  });
  if (!wish || wish.participant.game.kind !== "GIFT_LIST") throw new AppError("Ese regalo no existe.");
  // Mismo mensaje que si no existiera: no confirmar ideas secretas a su dueño
  if (wish.participant.userId === user.id) throw new AppError("Ese regalo no existe.");
  // Lista en borrador: sus ideas propias todavía no existen para nadie más
  if (!wish.secret && !wish.participant.listPublishedAt) throw new AppError("Ese regalo no existe.");
  const game = wish.participant.game;
  const me = await participantOf(user.id, game.id);
  const manager = canManage(user, game);
  if (!me && !manager) throw new AppError("No participas en esta sala.");
  return { wish, game, me, manager };
}

/**
 * "Yo lo regalo". `joint` = regalo entre varios: otros se pueden sumar.
 * Un regalo individual queda bloqueado para los demás.
 */
export async function claimWish(user: User, wishId: string, joint: boolean) {
  const { wish, game, me } = await othersWish(user, wishId);
  assertActive(game);
  if (!me) throw new AppError("Para pedirte un regalo tienes que estar apuntado en la sala.");
  if (!wish.participant.honoree) throw new AppError("Ese regalo no existe.");
  // `joined`: me he sumado a un regalo entre varios que ya tenía gente (para avisarles)
  return db.$transaction(async (tx) => {
    // Bloqueo de fila: dos personas pulsando a la vez no se lo piden las dos
    await tx.$queryRaw`SELECT id FROM "Wish" WHERE id = ${wish.id} FOR UPDATE`;
    const claims = await tx.wishClaim.findMany({
      where: { wishId: wish.id },
      include: { participant: { include: { user: { select: { name: true } } } } },
    });
    if (claims.some((c) => c.participantId === me.id)) return { joined: false };
    if (claims.length > 0) {
      const names = claims.map((c) => c.participant.user.name).join(", ");
      if (!claims[0].joint) throw new AppError(`Ese regalo ya se lo ha pedido ${names}.`);
      if (!joint) throw new AppError(`Es un regalo entre varios (${names}): puedes sumarte, pero no pedírtelo en solitario.`);
    }
    await tx.wishClaim.create({ data: { wishId: wish.id, participantId: me.id, joint } });
    return { joined: claims.length > 0 };
  });
}

/** Soltar un regalo que me había pedido. */
export async function unclaimWish(user: User, wishId: string) {
  const { wish, game, me } = await othersWish(user, wishId);
  assertActive(game);
  if (!me) return;
  await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM "Wish" WHERE id = ${wish.id} FOR UPDATE`;
    await tx.wishClaim.deleteMany({ where: { wishId: wish.id, participantId: me.id } });
    const left = await tx.wishClaim.findMany({ where: { wishId: wish.id } });
    if (left.length === 0) await tx.wish.update({ where: { id: wish.id }, data: { purchased: false } });
    // Si de un grupo solo queda una persona, sigue siendo "entre varios" (abierto a que se sumen)
  });
}

/** Quien se lo ha pedido marca que ya está comprado. */
export async function setClaimPurchased(user: User, wishId: string, purchased: boolean) {
  const { wish, game, me } = await othersWish(user, wishId);
  assertActive(game);
  const mine = me ? await db.wishClaim.findUnique({ where: { wishId_participantId: { wishId: wish.id, participantId: me.id } } }) : null;
  if (!mine) throw new AppError("Solo quien se ha pedido el regalo puede marcarlo como comprado.");
  await db.wish.update({ where: { id: wish.id }, data: { purchased } });
}

export const MAX_POT_CENTS = 100_000_00;

/**
 * Bote común: cuánto pongo yo en un regalo entre varios (null = sin decidir).
 * Lo ven los demás que regalan; el dueño de la lista, nunca.
 */
export async function setClaimAmount(user: User, wishId: string, amountCents: number | null) {
  const { wish, game, me } = await othersWish(user, wishId);
  assertActive(game);
  const mine = me ? await db.wishClaim.findUnique({ where: { wishId_participantId: { wishId: wish.id, participantId: me.id } } }) : null;
  if (!mine) throw new AppError("Primero apúntate al regalo.");
  if (!mine.joint) throw new AppError("El bote es solo para los regalos entre varios.");
  if (amountCents != null && (!Number.isInteger(amountCents) || amountCents < 0 || amountCents > MAX_POT_CENTS)) {
    throw new AppError("Esa cantidad no es válida.");
  }
  await db.wishClaim.update({ where: { id: mine.id }, data: { amountCents } });
}

/** ¿Se enseña ya a quien recibe quién le regaló cada cosa? */
export function thanksVisible(game: Pick<Game, "kind" | "status" | "revealGivers" | "eventDate">, now = new Date()): boolean {
  return (
    game.kind === "GIFT_LIST" &&
    game.status === "FINISHED" &&
    game.revealGivers &&
    // Nunca antes de la celebración, aunque la sala se cierre pronto
    (!game.eventDate || game.eventDate.getTime() <= now.getTime())
  );
}

/**
 * Agradecimientos: con la sala cerrada, quien recibe ve quién le regaló cada
 * cosa (también las ideas secretas, que ya no son sorpresa). Nunca importes.
 * Devuelve null si todavía no toca o si no recibo regalos en esta sala.
 */
export async function getThanks(user: User, gameId: string, now = new Date()) {
  const game = await db.game.findUnique({ where: { id: gameId } });
  if (!game || !thanksVisible(game, now)) return null;
  const me = await participantOf(user.id, gameId);
  if (!me?.honoree) return null;
  const wishes = await db.wish.findMany({
    where: { participantId: me.id, claims: { some: {} } },
    include: { claims: { include: { participant: { include: { user: { select: { name: true, avatar: true } } } } }, orderBy: { createdAt: "asc" } } },
    orderBy: [{ secret: "asc" }, { priority: "asc" }, { position: "asc" }, { createdAt: "asc" }],
  });
  return wishes.map((w) => ({
    id: w.id,
    title: w.title,
    imageUrl: w.imageUrl,
    /** No estaba en mi lista: fue una idea de los demás */
    surprise: w.secret,
    givers: w.claims.map((c) => ({ name: c.participant.user.name, avatar: c.participant.user.avatar })),
  }));
}

/** Proponer una idea para la lista de otra persona. Ella nunca la verá. */
export async function addSecretWish(
  user: User,
  gameId: string,
  honoreeParticipantId: string,
  input: WishInput,
  preview: PreviewFn = fetchPreview,
) {
  const game = await giftGame(gameId);
  assertActive(game);
  const me = await participantOf(user.id, gameId);
  if (!me && !canManage(user, game)) throw new AppError("No participas en esta sala.");
  const honoree = await db.participant.findUnique({ where: { id: honoreeParticipantId } });
  if (!honoree || honoree.gameId !== game.id || !honoree.honoree) throw new AppError("Esa persona no tiene lista en esta sala.");
  if (honoree.userId === user.id) throw new AppError("En tu propia lista añade las ideas desde «Mi lista».");
  const data = cleanWish(input);
  if ((await db.wish.count({ where: { participantId: honoree.id, secret: true } })) >= MAX_SECRET_WISHES) {
    throw new AppError(`Máximo ${MAX_SECRET_WISHES} ideas propuestas por lista.`);
  }
  const links = await buildWishLinks(data.links, [], preview);
  const position = (await db.wish.aggregate({ where: { participantId: honoree.id }, _max: { position: true } }))._max.position ?? 0;
  return db.wish.create({
    data: {
      participantId: honoree.id,
      secret: true,
      addedById: user.id,
      title: data.title,
      details: data.details,
      priority: data.priority,
      priceCents: data.priceCents,
      imageUrl: data.imageUrl ?? links.find((l) => l.imageUrl)?.imageUrl ?? null,
      position: position + 1,
      links: { create: links },
    },
    include: { links: true },
  });
}

async function editableSecretWish(user: User, wishId: string) {
  const { wish, game, manager } = await othersWish(user, wishId);
  assertActive(game);
  if (!wish.secret) throw new AppError("Esa idea la puso su dueño: solo él puede cambiarla.");
  if (wish.addedById !== user.id && !manager) throw new AppError("Solo quien propuso la idea (o quien organiza) puede cambiarla.");
  return wish;
}

export async function updateSecretWish(user: User, wishId: string, input: WishInput, preview: PreviewFn = fetchPreview) {
  const wish = await editableSecretWish(user, wishId);
  const data = cleanWish(input);
  const links = await buildWishLinks(data.links, wish.links, preview);
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

export async function deleteSecretWish(user: User, wishId: string) {
  const wish = await editableSecretWish(user, wishId);
  await db.wish.delete({ where: { id: wish.id } });
  await deleteUnusedUploads([wish.imageUrl]);
}
