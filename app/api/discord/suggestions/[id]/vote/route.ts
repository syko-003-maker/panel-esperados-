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
  // Avant : le create etait avale et la route repondait quand meme "voted: true"
  // — le vote etait perdu sans que personne ne le sache. Le delete, lui,
  // n'etait pas protege du tout : traitement incoherent des deux branches.
  try {
    if (existing) {
      await prisma.suggestionVote.delete({ where: { id: existing.id } });
    } else {
      await prisma.suggestionVote.create({ data: { suggestionId: id, memberId: member.id } });
    }
  } catch (err) {
    const code = (err as { code?: string })?.code;
    // Course entre deux clics : l'etat vise est deja atteint, ce n'est pas une erreur.
    const dejaFait = code === "P2002" || code === "P2025";
    if (!dejaFait) {
      console.error("[discord/suggestions/vote] ecriture echouee", { id, code });
      return NextResponse.json({ ok: false, error: "VOTE_FAILED" }, { status: 500 });
    }
  }

  const votes = await prisma.suggestionVote.count({ where: { suggestionId: id } });
  return NextResponse.json({ ok: true, voted: !existing, votes });
}
