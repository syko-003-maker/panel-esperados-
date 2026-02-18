import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRecruiterOrAbove } from "@/lib/guards";
import { getSession } from "@/auth";
import { enqueueRecruitmentDecision } from "@/lib/discord/discord";
import { parseRecruitmentNotes } from "@/lib/recruitment/legacy";
import { computeRecruitmentTotals } from "@/lib/recruitment/scoring";

const DECISIONS = ["ACCEPT", "REJECT"] as const;
const FAMILY_ID = process.env.FAMILY_ID ?? "esperados";

type Decision = (typeof DECISIONS)[number];

function isValidDecision(value: string) {
  return DECISIONS.includes(value as Decision);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const userId = session?.user?.id ?? (session as any)?.userId;
  const isChef = Boolean(session?.user?.isChef ?? (session as any)?.isChef);
  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  // Vérifier que l'acteur est un membre actif avec grade STAFF
  const { requireActiveMember, GRADE_LEVELS } = await import("@/lib/guards");
  const memberGuard = await requireActiveMember(GRADE_LEVELS.STAFF);
  if (memberGuard instanceof Response) return memberGuard;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const decisionRaw = String((body as any).decision ?? "").trim().toUpperCase();
  if (!isValidDecision(decisionRaw)) {
    return NextResponse.json({ ok: false, error: "INVALID_DECISION" }, { status: 400 });
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

  if (recruitment.status === "ACCEPTED" || recruitment.status === "REJECTED") {
    return NextResponse.json({ ok: false, error: "ALREADY_CLOSED" }, { status: 409 });
  }

  // SteamID is required for whitelist validation
  const steamId = (recruitment.steamId ?? "").trim();
  if (!steamId) {
    return NextResponse.json({ ok: false, error: "INVALID_STEAM_ID" }, { status: 400 });
  }

  const notes = parseRecruitmentNotes(recruitment.notes ?? null);
  const isClaimedByUser = notes.claimedById === userId;
  if (notes.claimedById && !isClaimedByUser && !isChef) {
    return NextResponse.json({ ok: false, error: "NOT_CLAIMED_BY_USER" }, { status: 403 });
  }

  const nextStatus = decisionRaw === "ACCEPT" ? "ACCEPTED" : "REJECTED";

  const updated = await prisma.recruitment.update({
    where: { id },
    data: {
      status: nextStatus,
    },
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

  const updatedNotes = parseRecruitmentNotes(updated.notes ?? null);
  const recruiterId = updatedNotes.claimedById ?? userId;
  const totals = computeRecruitmentTotals(updatedNotes.scoresJson);

  await enqueueRecruitmentDecision({
    familyId: FAMILY_ID,
    ticketId: updated.id,
    decision: decisionRaw as Decision,
    candidateRpName: updated.rpName ?? updated.discordId ?? "Unknown",
    candidateDiscordId: updated.discordId ?? undefined,
    candidateSteamId: updated.steamId ?? undefined,
    totalOn20: totals.totalOn20,
    totalPoints: totals.totalPoints,
    claimedByUserId: recruiterId,
  });

  const statusLabel = decisionRaw === "ACCEPT" ? "CLOSED_ACCEPTED" : "CLOSED_REJECTED";

  return NextResponse.json({
    ok: true,
    ticket: {
      id: updated.id,
      status: statusLabel,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      closedAt: updated.updatedAt.toISOString(),
      candidateRpName: updated.rpName ?? updated.discordId ?? "Unknown",
      candidateAge: updated.age ?? null,
      candidateSteamId: updated.steamId ?? null,
      candidateDiscordId: updated.discordId ?? null,
      claimedById: updatedNotes.claimedById ?? null,
      claimedAt: updatedNotes.claimedAt ?? null,
      claimedBy: updatedNotes.claimedById ? { id: updatedNotes.claimedById, name: null } : null,
      answersJson: updatedNotes.answersJson ?? null,
      scoresJson: updatedNotes.scoresJson ?? null,
      totalPoints: totals.totalPoints,
      totalOn20: totals.totalOn20,
      staffNotes: updatedNotes.staffNotes ?? null,
    },
  });
}
