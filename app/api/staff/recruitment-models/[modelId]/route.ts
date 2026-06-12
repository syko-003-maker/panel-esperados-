import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFullWriter } from "@/lib/guards";
import { getSession } from "@/auth";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { createAuditLog } from "@/lib/audit";
import { normalizeQuestions, sumPoints } from "@/lib/recruitment/models";

/** PATCH (édition / défaut / actif) + DELETE d'un modèle de recrutement. EM/Chef. */

async function getActor() {
  const session = await getSession();
  const actorDiscordId = (session?.user as any)?.discordId ?? null;
  const actorName = (session?.user as any)?.name ?? actorDiscordId ?? "panel";
  return { actorDiscordId, actorName };
}

export async function PATCH(req: Request, { params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  const guard = await requireFullWriter();
  if (guard instanceof Response) return guard;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const existing = await prisma.recruitmentModel.findFirst({
    where: { id: modelId, familyId: familyDbId },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const updates: Record<string, unknown> = {};

  if ("name" in body) {
    const name = String((body as any).name ?? "").trim();
    if (name.length < 3) return NextResponse.json({ ok: false, error: "NAME_TOO_SHORT" }, { status: 400 });
    updates.name = name;
  }
  if ("description" in body) {
    updates.description = String((body as any).description ?? "").trim() || null;
  }
  if ("minOn20" in body) {
    const v = Number((body as any).minOn20);
    if (!Number.isFinite(v)) return NextResponse.json({ ok: false, error: "INVALID_MIN" }, { status: 400 });
    updates.minOn20 = Math.min(Math.max(v, 0), 20);
  }
  if ("questions" in body) {
    const questions = normalizeQuestions((body as any).questions);
    if (questions.length === 0) {
      return NextResponse.json({ ok: false, error: "NO_QUESTIONS" }, { status: 400 });
    }
    updates.questions = questions;
  }
  if ("isActive" in body) {
    const isActive = Boolean((body as any).isActive);
    if (!isActive && existing.isDefault) {
      return NextResponse.json({ ok: false, error: "CANNOT_DISABLE_DEFAULT" }, { status: 400 });
    }
    updates.isActive = isActive;
  }

  // Définir par défaut : exclusif → on retire le flag des autres.
  if ((body as any).isDefault === true && !existing.isDefault) {
    await prisma.recruitmentModel.updateMany({
      where: { familyId: familyDbId, isDefault: true },
      data: { isDefault: false },
    });
    updates.isDefault = true;
    updates.isActive = true;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ ok: false, error: "NO_CHANGES" }, { status: 400 });
  }

  await prisma.recruitmentModel.update({ where: { id: existing.id }, data: updates as any });

  const { actorDiscordId, actorName } = await getActor();
  await createAuditLog({
    actorType: "staff",
    actorId: actorDiscordId,
    actorName,
    action: "RECRUITMENT_MODEL_UPDATED",
    entity: "RecruitmentModel",
    entityId: existing.id,
    entityName: (updates.name as string) ?? existing.name,
    meta: {
      fields: Object.keys(updates),
      ...(updates.questions
        ? { questionCount: (updates.questions as unknown[]).length, totalMaxPoints: sumPoints(updates.questions as any) }
        : {}),
    },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ modelId: string }> }) {
  const { modelId } = await params;
  const guard = await requireFullWriter();
  if (guard instanceof Response) return guard;

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const existing = await prisma.recruitmentModel.findFirst({
    where: { id: modelId, familyId: familyDbId },
  });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }
  if (existing.isDefault) {
    // Les tickets pointant ce modèle retomberaient sur... lui-même. On exige
    // de désigner un autre modèle par défaut avant suppression.
    return NextResponse.json({ ok: false, error: "CANNOT_DELETE_DEFAULT" }, { status: 400 });
  }

  await prisma.recruitmentModel.delete({ where: { id: existing.id } });

  const { actorDiscordId, actorName } = await getActor();
  await createAuditLog({
    actorType: "staff",
    actorId: actorDiscordId,
    actorName,
    action: "RECRUITMENT_MODEL_DELETED",
    entity: "RecruitmentModel",
    entityId: existing.id,
    entityName: existing.name,
  });

  return NextResponse.json({ ok: true });
}
