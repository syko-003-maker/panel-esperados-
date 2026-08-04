import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveStaffName } from "@/lib/staff-display-name";
import { requireRecruiterOrAbove, requireEncadrantOrAbove } from "@/lib/guards";
import { getSession } from "@/auth";
import { computeRecruitmentTotals } from "@/lib/recruitment/scoring";
import { listRecruitmentModels, resolveModelForRecruitment } from "@/lib/recruitment/models";
import { buildRecruitmentNotes, extractRecruitmentEvaluation, parseRecruitmentNotes } from "@/lib/recruitment/legacy";

const INVALID_JSON = Symbol("INVALID_JSON");

function toPlainJson(value: unknown) {
  if (value === undefined) return undefined;
  if (value === null) return null;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return INVALID_JSON;
  }
}

function getViewer(session: any) {
  const userId = session?.user?.id ?? session?.userId ?? null;
  const isChef = Boolean(session?.user?.isChef ?? session?.isChef);
  return { userId, isChef };
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const viewer = getViewer(session);

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
      ticketKey: true,
      discordThreadId: true,
      motivation: true,
      availabilities: true,
      payload: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!recruitment) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const notes = parseRecruitmentNotes(recruitment.notes ?? null);
  const evaluation = extractRecruitmentEvaluation(notes, recruitment.payload);
  // Modèle de recrutement : celui choisi pour ce ticket, sinon le défaut.
  const model = await resolveModelForRecruitment(notes.modelId ?? null);
  const activeModels = await listRecruitmentModels({ activeOnly: true });
  const totals = computeRecruitmentTotals(evaluation.scoresJson, model.questions);
  const statusLabel =
    recruitment.status === "ACCEPTED"
      ? "CLOSED_ACCEPTED"
      : recruitment.status === "REJECTED" || recruitment.status === "ARCHIVED"
        ? "CLOSED_REJECTED"
        : notes.claimedById
          ? "CLAIMED"
          : "OPEN";

  const ticket = {
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
    ticketKey: (recruitment as any).ticketKey ?? null,
    discordThreadId: (recruitment as any).discordThreadId ?? null,
    motivation: (recruitment as any).motivation ?? null,
    availabilities: (recruitment as any).availabilities ?? null,
    claimedById: notes.claimedById ?? null,
    claimedAt: notes.claimedAt ?? null,
    claimedBy: notes.claimedById
      ? { id: notes.claimedById, name: await resolveStaffName(notes.claimedById) }
      : null,
    answersJson: Object.keys(evaluation.answersJson).length > 0 ? evaluation.answersJson : null,
    scoresJson: Object.keys(evaluation.scoresJson).length > 0 ? evaluation.scoresJson : null,
    totalPoints: totals.totalPoints,
    totalOn20: totals.totalOn20,
    staffNotes: notes.staffNotes ?? null,
  };

  return NextResponse.json({
    ok: true,
    ticket,
    totals,
    questionBank: model.questions,
    model: {
      id: model.id,
      name: model.name,
      minOn20: model.minOn20,
      totalMaxPoints: model.totalMaxPoints,
      // chosen = explicitement sélectionné pour CE ticket (sinon défaut implicite)
      chosen: Boolean(notes.modelId),
    },
    activeModels,
    viewer,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const actorId = session?.user?.id ?? (session as any)?.userId;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const existing = await prisma.recruitment.findUnique({
    where: { id },
    select: { id: true, notes: true },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const existingNotes = parseRecruitmentNotes(existing.notes ?? null);
  const updates: Record<string, unknown> = {};
  let scoresJsonNext = existingNotes.scoresJson;
  let shouldUpdateTotals = false;

  if ("answersJson" in body) {
    const value = toPlainJson((body as any).answersJson);
    if (value === INVALID_JSON) {
      return NextResponse.json({ ok: false, error: "INVALID_ANSWERS_JSON" }, { status: 400 });
    }
    updates.answersJson = value;
  }

  if ("scoresJson" in body) {
    const value = toPlainJson((body as any).scoresJson);
    if (value === INVALID_JSON) {
      return NextResponse.json({ ok: false, error: "INVALID_SCORES_JSON" }, { status: 400 });
    }
    scoresJsonNext = value as any;
    updates.scoresJson = value;
    shouldUpdateTotals = true;
  }

  if ("staffNotes" in body) {
    const raw = String((body as any).staffNotes ?? "").trim();
    updates.staffNotes = raw ? raw : null;
  }

  if ("modelId" in body) {
    const raw = (body as any).modelId;
    if (raw === null) {
      updates.modelId = null;
    } else {
      const modelId = String(raw ?? "").trim();
      const found = modelId
        ? await prisma.recruitmentModel.findFirst({
            where: { id: modelId, isActive: true },
            select: { id: true },
          })
        : null;
      if (!found) {
        return NextResponse.json({ ok: false, error: "MODEL_NOT_FOUND" }, { status: 404 });
      }
      updates.modelId = found.id;
    }
    shouldUpdateTotals = true;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: "NO_FIELDS" }, { status: 400 });
  }

  const nextNotes = buildRecruitmentNotes(existingNotes, updates);
  const updated = await prisma.recruitment.update({
    where: { id },
    data: { notes: nextNotes },
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

  const notes = parseRecruitmentNotes(updated.notes ?? null);
  const evaluation = extractRecruitmentEvaluation(notes, null);
  const model = await resolveModelForRecruitment(notes.modelId ?? null);
  const totals = computeRecruitmentTotals(
    shouldUpdateTotals ? scoresJsonNext : evaluation.scoresJson,
    model.questions
  );
  const statusLabel =
    updated.status === "ACCEPTED"
      ? "CLOSED_ACCEPTED"
      : updated.status === "REJECTED" || updated.status === "ARCHIVED"
        ? "CLOSED_REJECTED"
        : notes.claimedById
          ? "CLAIMED"
          : "OPEN";

  return NextResponse.json({
    ok: true,
    ticket: {
      id: updated.id,
      status: statusLabel,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
      closedAt:
        updated.status === "ACCEPTED" || updated.status === "REJECTED"
          ? updated.updatedAt.toISOString()
          : null,
      candidateRpName: updated.rpName ?? updated.discordId ?? "Unknown",
      candidateAge: updated.age ?? null,
      candidateSteamId: updated.steamId ?? null,
      candidateDiscordId: updated.discordId ?? null,
      claimedById: notes.claimedById ?? null,
      claimedAt: notes.claimedAt ?? null,
      claimedBy: notes.claimedById
      ? { id: notes.claimedById, name: await resolveStaffName(notes.claimedById) }
      : null,
      answersJson: Object.keys(evaluation.answersJson).length > 0 ? evaluation.answersJson : null,
      scoresJson: Object.keys(evaluation.scoresJson).length > 0 ? evaluation.scoresJson : null,
      totalPoints: totals.totalPoints,
      totalOn20: totals.totalOn20,
      staffNotes: notes.staffNotes ?? null,
    },
  });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireEncadrantOrAbove();
  if (guard instanceof Response) return guard;

  const existing = await prisma.recruitment.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  await prisma.recruitment.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
