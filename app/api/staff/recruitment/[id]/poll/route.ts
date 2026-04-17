import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRecruiterOrAbove } from "@/lib/guards";
import { extractRecruitmentEvaluation, parseRecruitmentNotes } from "@/lib/recruitment/legacy";
import { computeRecruitmentTotals } from "@/lib/recruitment/scoring";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const afterRaw = searchParams.get("after");

  let after: Date | null = null;
  if (afterRaw) {
    const parsed = new Date(afterRaw);
    if (Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ ok: false, error: "INVALID_AFTER" }, { status: 400 });
    }
    after = parsed;
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
      payload: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!recruitment) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  if (after && recruitment.updatedAt <= after) {
    return NextResponse.json({ ok: true, changed: false });
  }

  const notes = parseRecruitmentNotes(recruitment.notes ?? null);
  const evaluation = extractRecruitmentEvaluation(notes, recruitment.payload);
  const totals = computeRecruitmentTotals(evaluation.scoresJson);
  const statusLabel =
    recruitment.status === "ACCEPTED"
      ? "CLOSED_ACCEPTED"
      : recruitment.status === "REJECTED" || recruitment.status === "ARCHIVED"
        ? "CLOSED_REJECTED"
        : notes.claimedById
          ? "CLAIMED"
          : "OPEN";

  return NextResponse.json({
    ok: true,
    changed: true,
    ticket: {
      id: recruitment.id,
      status: statusLabel,
      createdAt: recruitment.createdAt.toISOString(),
      updatedAt: recruitment.updatedAt.toISOString(),
      closedAt:
        recruitment.status === "ACCEPTED" || recruitment.status === "REJECTED"
          ? recruitment.updatedAt.toISOString()
          : null,
      candidateRpName: recruitment.rpName ?? recruitment.discordId ?? "Unknown",
      candidateAge: recruitment.age ?? null,
      candidateSteamId: recruitment.steamId ?? null,
      candidateDiscordId: recruitment.discordId ?? null,
      claimedById: notes.claimedById ?? null,
      claimedAt: notes.claimedAt ?? null,
      claimedBy: notes.claimedById ? { id: notes.claimedById, name: null } : null,
      answersJson: Object.keys(evaluation.answersJson).length > 0 ? evaluation.answersJson : null,
      scoresJson: Object.keys(evaluation.scoresJson).length > 0 ? evaluation.scoresJson : null,
      totalPoints: totals.totalPoints,
      totalOn20: totals.totalOn20,
      staffNotes: notes.staffNotes ?? null,
    },
  });
}
