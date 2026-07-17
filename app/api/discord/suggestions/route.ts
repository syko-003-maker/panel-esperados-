import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { checkWorkerAuth, memberByDiscord } from "@/lib/suggestions-discord";

/**
 * Endpoints suggestions côté Discord (appelés par le worker, auth
 * x-ingest-secret). Le worker gère la commande /suggestion + les boutons de
 * vote + un reconciler qui poste/édite les embeds. Tout partage la même DB que
 * le site (1 vote/membre, site OU Discord).
 *
 * GET  — liste des suggestions + état (pour le reconciler d'embeds).
 * POST — créer depuis Discord (body { authorDiscordId, title, description }).
 */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!checkWorkerAuth(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const rows = await prisma.suggestion.findMany({
    where: { familyId: familyDbId },
    select: {
      id: true,
      title: true,
      description: true,
      status: true,
      staffNote: true,
      discordMessageId: true,
      discordChannelId: true,
      author: { select: { rpName: true } },
      _count: { select: { votes: true } },
      comments: {
        select: { id: true, authorName: true, message: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  const data = rows.map((s) => ({
    id: s.id,
    title: s.title,
    description: s.description,
    status: s.status,
    staffNote: s.staffNote,
    votes: s._count.votes,
    authorName: s.author?.rpName ?? "?",
    discordMessageId: s.discordMessageId,
    discordChannelId: s.discordChannelId,
    comments: s.comments.map((c) => ({ authorName: c.authorName, message: c.message })),
    commentCount: s.comments.length,
  }));
  return NextResponse.json({ ok: true, data });
}

export async function POST(req: Request) {
  if (!checkWorkerAuth(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const body = await req.json().catch(() => null);
  const authorDiscordId = String(body?.authorDiscordId ?? "").trim();
  const title = String(body?.title ?? "").trim();
  const description = String(body?.description ?? "").trim();

  if (!authorDiscordId) return NextResponse.json({ ok: false, error: "authorDiscordId requis" }, { status: 400 });
  if (title.length < 4 || title.length > 120)
    return NextResponse.json({ ok: false, error: "Titre 4-120 caractères." }, { status: 400 });
  if (description.length < 10 || description.length > 2000)
    return NextResponse.json({ ok: false, error: "Description 10-2000 caractères." }, { status: 400 });

  const member = await memberByDiscord(authorDiscordId);
  if (!member)
    return NextResponse.json({ ok: false, error: "NOT_MEMBER", message: "Tu dois être membre de la famille." }, { status: 403 });

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const userId = `discord:${authorDiscordId}`;
  const created = await prisma.suggestion.create({
    data: {
      familyId: familyDbId,
      author: { connect: { id: member.id } },
      title,
      description,
      status: "OPEN",
      createdBy: {
        connectOrCreate: {
          where: { id: userId },
          create: { id: userId, name: `Discord ${authorDiscordId}` },
        },
      },
    },
    select: { id: true },
  });
  await prisma.suggestionVote
    .create({ data: { suggestionId: created.id, memberId: member.id } })
    .catch(() => {});

  return NextResponse.json({ ok: true, id: created.id, authorName: member.rpName ?? "?", votes: 1 });
}
