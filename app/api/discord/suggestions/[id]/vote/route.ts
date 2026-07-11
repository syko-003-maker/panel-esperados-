import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { checkWorkerAuth, memberByDiscord } from "@/lib/suggestions-discord";

/**
 * POST /api/discord/suggestions/[id]/vote — toggle du vote depuis un bouton
 * Discord (body { voterDiscordId }). Auth worker. Même contrainte 1/membre que
 * le site (DB partagée).
 */

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!checkWorkerAuth(req)) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  const { id } = await params;
  const body = await req.json().catch(() => null);
  const voterDiscordId = String(body?.voterDiscordId ?? "").trim();
  if (!voterDiscordId) return NextResponse.json({ ok: false, error: "voterDiscordId requis" }, { status: 400 });

  const member = await memberByDiscord(voterDiscordId);
  if (!member)
    return NextResponse.json({ ok: false, error: "NOT_MEMBER", message: "Tu dois être membre de la famille pour voter." }, { status: 403 });

  const suggestion = await prisma.suggestion.findUnique({ where: { id }, select: { id: true } });
  if (!suggestion) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  const existing = await prisma.suggestionVote.findUnique({
    where: { suggestionId_memberId: { suggestionId: id, memberId: member.id } },
    select: { id: true },
  });
  if (existing) {
    await prisma.suggestionVote.delete({ where: { id: existing.id } });
  } else {
    await prisma.suggestionVote.create({ data: { suggestionId: id, memberId: member.id } }).catch(() => {});
  }

  const votes = await prisma.suggestionVote.count({ where: { suggestionId: id } });
  return NextResponse.json({ ok: true, voted: !existing, votes });
}
