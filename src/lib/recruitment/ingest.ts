import { prisma } from "@/lib/db";
import { buildRecruitmentNotes, extractRecruitmentEvaluation } from "@/lib/recruitment/legacy";

export type RecruitmentDiscordPayload = {
  createdById?: string;
  candidateRpName: string;
  candidateAge?: number;
  candidateSteamId?: string;
  candidateDiscordId?: string;
  discordGuildId?: string;
  discordChannelId?: string;
  discordMessageId?: string;
  raw?: unknown;
  motivation?: string;
  dispo?: string;
  answersJson?: Record<string, string>;
  scoresJson?: Record<string, number>;
  [key: string]: unknown;
};

function normalizeString(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizeAge(value: number | undefined) {
  if (value === undefined || value === null) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.floor(parsed);
}

function toPlainJson<T>(value: T): T | null {
  if (value === undefined) return null;
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return null;
  }
}

export function buildRecruitmentStorage(input: RecruitmentDiscordPayload) {
  const payload = toPlainJson(input) ?? {};
  const evaluation = extractRecruitmentEvaluation({}, payload);
  const notes =
    Object.keys(evaluation.answersJson).length > 0 || Object.keys(evaluation.scoresJson).length > 0
      ? buildRecruitmentNotes({}, {
          answersJson: evaluation.answersJson,
          scoresJson: evaluation.scoresJson,
        })
      : null;

  return {
    payload,
    notes,
    motivation: normalizeString((input as { motivation?: unknown }).motivation as string | null | undefined),
    availabilities: normalizeString((input as { dispo?: unknown }).dispo as string | null | undefined),
  };
}

export async function createRecruitmentFromDiscord(payload: RecruitmentDiscordPayload) {
  const candidateRpName = String(payload.candidateRpName ?? "").trim();
  if (!candidateRpName) {
    throw new Error("MISSING_CANDIDATE_RP_NAME");
  }

  const familyId = process.env.FAMILY_ID ?? "esperados";
  let createdById = normalizeString(payload.createdById);

  if (!createdById) {
    const fallback = await prisma.user.findFirst({
      where: { OR: [{ isChef: true }, { isStaff: true }] },
      select: { id: true },
    });
    createdById = fallback?.id ?? null;
  }

  if (!createdById) {
    throw new Error("MISSING_CREATED_BY_ID");
  }

  const storage = buildRecruitmentStorage(payload);

  return prisma.recruitment.create({
    data: {
      familyId,
      discordId: normalizeString(payload.candidateDiscordId) ?? "unknown",
      steamId: normalizeString(payload.candidateSteamId),
      rpName: candidateRpName,
      age: normalizeAge(payload.candidateAge),
      payload: storage.payload as any,
      notes: storage.notes,
      motivation: storage.motivation,
      availabilities: storage.availabilities,
      status: "PENDING",
      createdById,
    },
  });
}
