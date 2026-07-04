import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireEncadrantOrAbove, requireRecruiterOrAbove } from "@/lib/guards";
import { getSession } from "@/auth";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { createAuditLog } from "@/lib/audit";
import { listRecruitmentModels, normalizeQuestions, sumPoints } from "@/lib/recruitment/models";

/**
 * Modèles de recrutement (questionnaires d'entretien).
 * GET  : liste (recruteurs et + — sert aussi au sélecteur de la fiche)
 * POST : création (EM/Chef uniquement)
 */

export async function GET(req: Request) {
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) return guard;

  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("active") === "1";
  const withQuestions = url.searchParams.get("questions") === "1";

  const models = await listRecruitmentModels({ activeOnly });

  if (!withQuestions) {
    return NextResponse.json({ ok: true, models });
  }

  // Variante "gestion" : renvoyer aussi les questions complètes.
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const rows = await prisma.recruitmentModel.findMany({
    where: { familyId: familyDbId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  const byId = new Map(rows.map((r) => [r.id, normalizeQuestions(r.questions)]));
  return NextResponse.json({
    ok: true,
    models: models.map((m) => ({ ...m, questions: byId.get(m.id) ?? [] })),
  });
}

export async function POST(req: Request) {
  const guard = await requireEncadrantOrAbove();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const actorDiscordId = (session?.user as any)?.discordId ?? null;
  const actorName = (session?.user as any)?.name ?? actorDiscordId ?? "panel";

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const name = String((body as any).name ?? "").trim();
  const description = String((body as any).description ?? "").trim() || null;
  const minOn20Raw = Number((body as any).minOn20);
  const minOn20 = Number.isFinite(minOn20Raw) ? Math.min(Math.max(minOn20Raw, 0), 20) : 14;
  const questions = normalizeQuestions((body as any).questions);

  if (name.length < 3) {
    return NextResponse.json({ ok: false, error: "NAME_TOO_SHORT" }, { status: 400 });
  }
  if (questions.length === 0) {
    return NextResponse.json({ ok: false, error: "NO_QUESTIONS" }, { status: 400 });
  }

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const created = await prisma.recruitmentModel.create({
    data: {
      familyId: familyDbId,
      name,
      description,
      questions: questions as any,
      minOn20,
    },
  });

  await createAuditLog({
    actorType: "staff",
    actorId: actorDiscordId,
    actorName,
    action: "RECRUITMENT_MODEL_CREATED",
    entity: "RecruitmentModel",
    entityId: created.id,
    entityName: name,
    meta: { questionCount: questions.length, totalMaxPoints: sumPoints(questions), minOn20 },
  });

  return NextResponse.json({ ok: true, id: created.id });
}
