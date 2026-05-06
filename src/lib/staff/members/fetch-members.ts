/**
 * Prisma findMany sur les Member d'une famille, avec fallback en cas de
 * colonne playtime manquante (P2022) — préserve le comportement historique
 * du panel sur les bases qui n'ont pas encore la migration des colonnes
 * playtime7d / playtime7dUpdatedAt.
 *
 * Extrait de app/api/staff/members/route.ts (Lot 7).
 */

import { prisma } from "@/lib/db";
import { logWarn } from "@/lib/obs";

function isMissingColumnError(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as any).code === "P2022";
}

const BASE_SELECT = {
  id: true,
  steamId: true,
  discordId: true,
  rpName: true,
  discordDisplayName: true,
  discordUsername: true,
  grade: true,
  isActive: true,
  isGhost: true,
  discordInGuild: true,
  missingFromLygSince: true,
  discordRoleIds: true,
  rankRoleId: true,
  rankLabel: true,
  discordLastError: true,
  discordRolesUpdatedAt: true,
} as const;

const SELECT_WITH_PLAYTIME = {
  ...BASE_SELECT,
  playtime7d: true,
  playtime7dUpdatedAt: true,
} as const;

export async function fetchMembersForFamily(params: {
  familyId: string;
  familySlug: string;
  includeInactive: boolean;
}): Promise<any[]> {
  const where = {
    familyId: params.familyId,
    source: { not: "BANKLOG_GHOST" },
    ...(params.includeInactive ? {} : { isActive: true }),
  };

  try {
    return await prisma.member.findMany({
      where,
      orderBy: [{ rpName: "asc" }],
      select: SELECT_WITH_PLAYTIME as any,
    } as any);
  } catch (error) {
    if (!isMissingColumnError(error)) throw error;

    // Fallback : colonne playtime absente (DB pas encore migrée)
    logWarn("staff_members_missing_playtime_columns", {
      code: (error as any)?.code,
      familySlug: params.familySlug,
    });

    return await prisma.member.findMany({
      where,
      orderBy: [{ rpName: "asc" }],
      select: BASE_SELECT as any,
    } as any);
  }
}
