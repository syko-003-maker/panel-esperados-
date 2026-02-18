import { prisma } from "@/lib/db";

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

  return prisma.recruitment.create({
    data: {
      familyId,
      discordId: normalizeString(payload.candidateDiscordId) ?? "unknown",
      steamId: normalizeString(payload.candidateSteamId),
      rpName: candidateRpName,
      age: normalizeAge(payload.candidateAge),
      notes: null,
      status: "PENDING",
      createdById,
    },
  });
}
