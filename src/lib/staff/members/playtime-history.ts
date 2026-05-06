/**
 * Lecture du playtime de la semaine précédente pour chaque member.
 * Tolérant : si le model n'existe pas (migration pas appliquée) ou si la
 * lecture échoue, retourne map vide + flags d'analytics.
 *
 * Extrait de app/api/staff/members/route.ts (Lot 7).
 */

import { prisma } from "@/lib/db";
import { logWarn } from "@/lib/obs";
import { getPreviousPlaytimeWeekStart } from "@/lib/playtime-insights";

export interface PlaytimeHistoryResult {
  previousWeekMap: Map<string, number>;
  analyticsAvailable: boolean;
  historyReadFailed: boolean;
  historyModelAvailable: boolean;
}

export async function loadPreviousWeekPlaytime(params: {
  memberIds: string[];
  familySlug: string;
}): Promise<PlaytimeHistoryResult> {
  const { memberIds, familySlug } = params;

  const historyModel = (prisma as any).memberPlaytimeHistory;
  const historyModelAvailable = typeof historyModel?.findMany === "function";
  const previousWeekMap = new Map<string, number>();

  let analyticsAvailable = false;
  let historyReadFailed = false;

  if (!historyModelAvailable || memberIds.length === 0) {
    return { previousWeekMap, analyticsAvailable, historyReadFailed, historyModelAvailable };
  }

  try {
    const previousWeekStart = getPreviousPlaytimeWeekStart();
    const playtimeHistory = await historyModel.findMany({
      where: {
        memberId: { in: memberIds },
        weekStart: previousWeekStart,
      },
      select: {
        memberId: true,
        weekStart: true,
        playtime7d: true,
      },
    });

    for (const history of playtimeHistory as Array<{
      memberId: string;
      weekStart: Date;
      playtime7d: number;
    }>) {
      if (history.weekStart.getTime() === previousWeekStart.getTime()) {
        previousWeekMap.set(history.memberId, history.playtime7d);
      }
    }

    analyticsAvailable = true;
  } catch (error) {
    historyReadFailed = true;
    logWarn("staff_members_history_read_failed", {
      familySlug,
      details: error instanceof Error ? error.message : String(error),
    });
  }

  return { previousWeekMap, analyticsAvailable, historyReadFailed, historyModelAvailable };
}
