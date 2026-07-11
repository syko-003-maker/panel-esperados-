import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { getMemberScopeOrNull } from "@/server/member/scope";

/**
 * POST /api/member/suggestions/[id]/vote — bascule le vote du membre courant
 * (vote / retire son vote). 1 vote par membre par suggestion (contrainte
 * unique). Renvoie l'état + le total de votes.
 */

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session) return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  const scope = await getMemberScopeOrNull(session);
  if (!scope) return NextResponse.json({ ok: false, code: "MEMBER_NOT_LINKED" }, { status: 403 });

  const suggestion = await prisma.suggestion.findUnique({ where: { id }, select: { id: true } });
  if (!suggestion) return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });

  const existing = await prisma.suggestionVote.findUnique({
    where: { suggestionId_memberId: { suggestionId: id, memberId: scope.memberId } },
    select: { id: true },
  });

  if (existing) {
    await prisma.suggestionVote.delete({ where: { id: existing.id } });
  } else {
    await prisma.suggestionVote
      .create({ data: { suggestionId: id, memberId: scope.memberId } })
      .catch(() => {}); // course : ignore le doublon si double-clic
  }

  const votes = await prisma.suggestionVote.count({ where: { suggestionId: id } });
  return NextResponse.json({ ok: true, voted: !existing, votes });
}
