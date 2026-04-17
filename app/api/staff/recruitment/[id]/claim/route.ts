import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRecruiterOrAbove } from "@/lib/guards";
import { getSession } from "@/auth";
import { buildRecruitmentNotes, extractRecruitmentEvaluation, parseRecruitmentNotes } from "@/lib/recruitment/legacy";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const userId = session?.user?.id ?? (session as any)?.userId;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const recruitment = await prisma.recruitment.findUnique({
    where: { id },
    select: {
      id: true,
      status: true,
      rpName: true,
      age: true,
      steamId: true,
      discordId: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!recruitment) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const notes = parseRecruitmentNotes(recruitment.notes ?? null);
  if (notes.claimedById) {
    return NextResponse.json({ ok: false, error: "ALREADY_CLAIMED" }, { status: 409 });
  }

  if (recruitment.status !== "PENDING") {
    return NextResponse.json({ ok: false, error: "NOT_OPEN" }, { status: 409 });
  }

  const claimedAt = new Date().toISOString();
  const updatedNotes = buildRecruitmentNotes(notes, { claimedById: userId, claimedAt });
  const updated = await prisma.recruitment.update({
    where: { id },
    data: { notes: updatedNotes },
    select: {
      id: true,
      status: true,
      rpName: true,
      age: true,
      steamId: true,
      discordId: true,
      notes: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  const evaluation = extractRecruitmentEvaluation(notes, null);

  return NextResponse.json({
    ok: true,
    ticket: {
      id: updated.id,
      status: "CLAIMED",
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      closedAt: null,
      candidateRpName: updated.rpName ?? updated.discordId ?? "Unknown",
      candidateAge: updated.age ?? null,
      candidateSteamId: updated.steamId ?? null,
      candidateDiscordId: updated.discordId ?? null,
      claimedById: userId,
      claimedAt,
      claimedBy: { id: userId, name: null },
      answersJson: Object.keys(evaluation.answersJson).length > 0 ? evaluation.answersJson : null,
      scoresJson: Object.keys(evaluation.scoresJson).length > 0 ? evaluation.scoresJson : null,
      totalPoints: null,
      totalOn20: null,
      staffNotes: notes.staffNotes ?? null,
    },
  });
}
