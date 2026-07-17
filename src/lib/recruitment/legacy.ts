export type RecruitmentLegacyNotes = {
  staffNotes?: string | null;
  claimedById?: string | null;
  claimedAt?: string | null;
  /** Modèle de recrutement choisi pour ce ticket (RecruitmentModel.id). */
  modelId?: string | null;
  answersJson?: Record<string, string>;
  scoresJson?: Record<string, number>;
};

type RecruitmentEvaluationData = {
  answersJson: Record<string, string>;
  scoresJson: Record<string, number>;
};

type QuestionSection = "GENERAL" | "TRAP";

const QUESTION_KEYS = [
  "id",
  "questionId",
  "key",
  "slug",
  "code",
  "name",
  "label",
  "question",
  "title",
  "questionText",
  "prompt",
  "intitule",
] as const;

const ANSWER_KEYS = [
  "answer",
  "answers",
  "response",
  "responses",
  "reponse",
  "reponses",
  "value",
  "text",
  "content",
  "candidateAnswer",
  "userAnswer",
  "candidateResponse",
  "userResponse",
  "reply",
  "reponseCandidat",
] as const;

const SCORE_KEYS = ["score", "note", "points", "rating", "staffScore", "awardedPoints"] as const;

const SECTION_ALIASES: Record<QuestionSection, string[]> = {
  GENERAL: ["GENERAL", "QUESTIONS_GENERALES", "QUESTION_GENERALES", "GENERAL_QUESTIONS", "GENERAL_SECTION"],
  TRAP: ["TRAP", "QUESTIONS_PIEGES", "QUESTION_PIEGES", "TRAP_QUESTIONS", "PIEGES", "PIEGES_QUESTIONS"],
};

function normalizeLookupKey(value: string | null | undefined) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isScalar(value: unknown) {
  return ["string", "number", "boolean"].includes(typeof value);
}

function coerceAnswer(value: unknown) {
  if (!isScalar(value)) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function coerceScore(value: unknown) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildQuestionLookup() {
  const { questionBank } = require("@/lib/recruitment/questionBank") as typeof import("@/lib/recruitment/questionBank");
  const lookup = new Map<string, string>();
  const sections: Record<QuestionSection, Array<(typeof questionBank)[number]>> = {
    GENERAL: [],
    TRAP: [],
  };

  for (const question of questionBank) {
    lookup.set(normalizeLookupKey(question.id), question.id);
    lookup.set(normalizeLookupKey(question.label), question.id);
    sections[question.section].push(question);
  }

  return { lookup, sections };
}

function resolveQuestionId(rawKey: unknown, lookup: Map<string, string>) {
  const key = normalizeLookupKey(typeof rawKey === "string" ? rawKey : String(rawKey ?? ""));
  return key ? lookup.get(key) ?? null : null;
}

function resolveSection(rawKey: string) {
  const normalized = normalizeLookupKey(rawKey);
  if (!normalized) return null;

  for (const [section, aliases] of Object.entries(SECTION_ALIASES) as Array<[QuestionSection, string[]]>) {
    if (aliases.some((alias) => normalized.includes(alias))) {
      return section;
    }
  }

  return null;
}

// `notes.answersJson` / `notes.scoresJson` sont DÉJÀ indexés sur les IDs de
// questions du modèle du ticket (V1…V4, modèles custom). On garde donc les
// clés telles quelles, on ne coerce que la valeur. On NE filtre PAS via le
// questionBank historique : ça supprimait toutes les notes des modèles dont les
// IDs ne figurent pas dans le bank codé en dur (V3/V4 → fiche à 0 point).
function normalizeAnswerMap(value: unknown) {
  if (!isPlainObject(value)) return {};

  const next: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    const questionId = String(key ?? "").trim();
    const answer = coerceAnswer(raw);
    if (questionId && answer !== null) next[questionId] = answer;
  }
  return next;
}

function normalizeScoreMap(value: unknown) {
  if (!isPlainObject(value)) return {};

  const next: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const questionId = String(key ?? "").trim();
    const score = coerceScore(raw);
    if (questionId && score !== null) next[questionId] = score;
  }
  return next;
}

function hydrateQuestionFromSectionItem(
  questionId: string,
  item: unknown,
  answers: Record<string, string>,
  scores: Record<string, number>
) {
  if (isPlainObject(item)) {
    for (const key of ANSWER_KEYS) {
      const answer = coerceAnswer(item[key]);
      if (answer !== null && !answers[questionId]) {
        answers[questionId] = answer;
        break;
      }
    }

    for (const key of SCORE_KEYS) {
      const score = coerceScore(item[key]);
      if (score !== null && scores[questionId] === undefined) {
        scores[questionId] = score;
        break;
      }
    }
    return;
  }

  const answer = coerceAnswer(item);
  if (answer !== null && !answers[questionId]) {
    answers[questionId] = answer;
  }
}

function extractSectionArrays(
  node: unknown,
  sections: Record<QuestionSection, Array<{ id: string }>>,
  answers: Record<string, string>,
  scores: Record<string, number>
) {
  if (!isPlainObject(node)) return;

  for (const [key, value] of Object.entries(node)) {
    const section = resolveSection(key);
    if (!section || !Array.isArray(value)) continue;

    const sectionQuestions = sections[section];
    value.forEach((item, index) => {
      const question = sectionQuestions[index];
      if (!question) return;
      hydrateQuestionFromSectionItem(question.id, item, answers, scores);
    });
  }
}

function extractFromNode(
  node: unknown,
  lookup: Map<string, string>,
  sections: Record<QuestionSection, Array<{ id: string }>>,
  answers: Record<string, string>,
  scores: Record<string, number>,
  depth = 0
) {
  if (depth > 6 || node == null) return;

  if (Array.isArray(node)) {
    for (const item of node) extractFromNode(item, lookup, sections, answers, scores, depth + 1);
    return;
  }

  if (!isPlainObject(node)) return;

  extractSectionArrays(node, sections, answers, scores);

  let derivedQuestionId: string | null = null;
  for (const key of QUESTION_KEYS) {
    const value = node[key];
    if (value == null) continue;
    derivedQuestionId = resolveQuestionId(value, lookup);
    if (derivedQuestionId) break;
  }

  if (derivedQuestionId) {
    for (const key of ANSWER_KEYS) {
      const answer = coerceAnswer(node[key]);
      if (answer !== null && !answers[derivedQuestionId]) {
        answers[derivedQuestionId] = answer;
        break;
      }
    }

    for (const key of SCORE_KEYS) {
      const score = coerceScore(node[key]);
      if (score !== null && scores[derivedQuestionId] === undefined) {
        scores[derivedQuestionId] = score;
        break;
      }
    }
  }

  for (const [key, value] of Object.entries(node)) {
    const questionId = resolveQuestionId(key, lookup);
    if (questionId) {
      const answer = coerceAnswer(value);
      if (answer !== null && !answers[questionId]) answers[questionId] = answer;

      const score = coerceScore(value);
      if (score !== null && scores[questionId] === undefined) scores[questionId] = score;
    }

    extractFromNode(value, lookup, sections, answers, scores, depth + 1);
  }
}

function normalizeNoteString(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function parseRecruitmentNotes(notes: string | null): RecruitmentLegacyNotes {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === "object") return parsed as RecruitmentLegacyNotes;
  } catch {
    // ignore
  }
  return { staffNotes: notes };
}

export function buildRecruitmentNotes(
  existing: RecruitmentLegacyNotes,
  updates: RecruitmentLegacyNotes
) {
  const next: RecruitmentLegacyNotes = { ...existing, ...updates };
  const staffNotes = normalizeNoteString(next.staffNotes);
  const hasStructured =
    Boolean(next.claimedById) ||
    Boolean(next.claimedAt) ||
    Boolean(next.modelId) ||
    Boolean(next.answersJson && Object.keys(next.answersJson).length > 0) ||
    Boolean(next.scoresJson && Object.keys(next.scoresJson).length > 0);

  if (!hasStructured) {
    return staffNotes;
  }

  return JSON.stringify({
    staffNotes,
    claimedById: normalizeNoteString(next.claimedById),
    claimedAt: normalizeNoteString(next.claimedAt),
    modelId: normalizeNoteString(next.modelId),
    answersJson: next.answersJson ?? null,
    scoresJson: next.scoresJson ?? null,
  });
}

export function extractRecruitmentEvaluation(
  notes: RecruitmentLegacyNotes,
  payload: unknown
): RecruitmentEvaluationData {
  const { lookup, sections } = buildQuestionLookup();
  // Notes structurées (stockage moderne) : clés = IDs du modèle du ticket,
  // prises telles quelles. Voir normalizeScoreMap/normalizeAnswerMap.
  const answers = { ...normalizeAnswerMap(notes.answersJson) };
  const scores = { ...normalizeScoreMap(notes.scoresJson) };

  // Fallback legacy : anciens tickets sans notes structurées → extraction
  // depuis le payload Discord brut, résolue via le questionBank historique.
  extractFromNode(payload, lookup, sections, answers, scores);

  return { answersJson: answers, scoresJson: scores };
}
