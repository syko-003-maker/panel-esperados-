import "server-only";
import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { questionBank, MIN_ON20 } from "@/lib/recruitment/questionBank";
import type { Question } from "@/lib/recruitment/questionBank";

/**
 * Modèles de recrutement (questionnaires d'entretien) stockés en base.
 * Le questionBank historique reste le filet de sécurité si la table est vide.
 */

export type RecruitmentModelSummary = {
  id: string;
  name: string;
  description: string | null;
  minOn20: number;
  isDefault: boolean;
  isActive: boolean;
  questionCount: number;
  totalMaxPoints: number;
};

export type ResolvedRecruitmentModel = {
  id: string | null; // null = fallback questionBank codé en dur
  name: string;
  minOn20: number;
  questions: Question[];
  totalMaxPoints: number;
};

export function sumPoints(questions: Question[]): number {
  return Math.round(questions.reduce((acc, q) => acc + (Number(q.pointsMax) || 0), 0) * 100) / 100;
}

/** Valide/normalise un tableau de questions venant du JSON (DB ou client). */
export function normalizeQuestions(value: unknown): Question[] {
  if (!Array.isArray(value)) return [];
  const out: Question[] = [];
  const seen = new Set<string>();
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const q = raw as Record<string, unknown>;
    const label = String(q.label ?? "").trim();
    const pointsMax = Number(q.pointsMax);
    if (!label || !Number.isFinite(pointsMax) || pointsMax <= 0) continue;
    let id = String(q.id ?? "").trim();
    if (!id) {
      id = label
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || "QUESTION";
    }
    // Unicité des ids (les scores sont indexés dessus).
    let unique = id;
    let i = 2;
    while (seen.has(unique)) unique = `${id}_${i++}`;
    seen.add(unique);

    const section = q.section === "TRAP" ? "TRAP" : "GENERAL";
    const expectedAnswer = String(q.expectedAnswer ?? "").trim() || undefined;
    const hint = String(q.hint ?? "").trim() || undefined;
    const stepRaw = Number(q.step);
    const step = Number.isFinite(stepRaw) && stepRaw > 0 ? stepRaw : undefined;

    out.push({ id: unique, section, label, pointsMax, expectedAnswer, hint, step });
  }
  return out;
}

export async function listRecruitmentModels(opts?: {
  activeOnly?: boolean;
}): Promise<RecruitmentModelSummary[]> {
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const rows = await prisma.recruitmentModel.findMany({
    where: { familyId: familyDbId, ...(opts?.activeOnly ? { isActive: true } : {}) },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => {
    const questions = normalizeQuestions(r.questions);
    return {
      id: r.id,
      name: r.name,
      description: r.description,
      minOn20: r.minOn20,
      isDefault: r.isDefault,
      isActive: r.isActive,
      questionCount: questions.length,
      totalMaxPoints: sumPoints(questions),
    };
  });
}

/**
 * Résout le questionnaire d'un ticket : modèle choisi → modèle par défaut →
 * questionBank historique (si la table est vide / modèle introuvable).
 */
export async function resolveModelForRecruitment(
  modelId: string | null | undefined
): Promise<ResolvedRecruitmentModel> {
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);

  if (modelId) {
    const row = await prisma.recruitmentModel.findFirst({
      where: { id: modelId, familyId: familyDbId },
    });
    if (row) {
      const questions = normalizeQuestions(row.questions);
      if (questions.length > 0) {
        return {
          id: row.id,
          name: row.name,
          minOn20: row.minOn20,
          questions,
          totalMaxPoints: sumPoints(questions),
        };
      }
    }
  }

  const def = await prisma.recruitmentModel.findFirst({
    where: { familyId: familyDbId, isActive: true },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (def) {
    const questions = normalizeQuestions(def.questions);
    if (questions.length > 0) {
      return {
        id: def.id,
        name: def.name,
        minOn20: def.minOn20,
        questions,
        totalMaxPoints: sumPoints(questions),
      };
    }
  }

  return {
    id: null,
    name: "Recrutement standard",
    minOn20: MIN_ON20,
    questions: questionBank,
    totalMaxPoints: sumPoints(questionBank),
  };
}
