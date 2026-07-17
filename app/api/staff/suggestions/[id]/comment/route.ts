import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireEncadrantOrAbove } from "@/lib/guards";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { getUserDiscordIdFromSession } from "@/server/auth/discord";

/**
 * POST /api/staff/suggestions/[id]/comment — ajoute un commentaire staff au fil
 * d'une suggestion (plusieurs possibles, horodatés, non écrasés). Encadrant+.
 */
export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireEncadrantOrAbove();
  if (guard instanceof Response) return guard;
  const session = (guard as any).session;

  const { id } = await params;
  const body = await req.json().catch(() => null);
  const message = String(body?.message ?? "").trim().slice(0, 2000);
  if (!message) return NextResponse.json({ ok: false, error: "MESSAGE_VIDE" }, { status: 400 });

  const familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const sug = await prisma.suggestion.findFirst({ where: { id, familyId }, select: { id: true } });
  if (!sug) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  // Nom d'auteur = RP name du staff (via son Discord), sinon nom de session.
  const actorId = session?.user?.id ?? null;
  const discordId = await getUserDiscordIdFromSession(session).catch(() => null);
  let authorName: string = session?.user?.name ?? "Staff";
  if (discordId) {
    const m = await prisma.member
      .findFirst({ where: { familyId, discordId }, select: { rpName: true } })
      .catch(() => null);
    if (m?.rpName) authorName = m.rpName;
  }

  const comment = await prisma.suggestionComment.create({
    data: { familyId, suggestionId: id, authorId: actorId, authorName, message },
    select: { id: true, authorName: true, message: true, createdAt: true },
  });

  return NextResponse.json({ ok: true, comment });
}
