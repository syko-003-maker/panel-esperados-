/**
 * Database Bootstrap Helper
 * 
 * Detects if DB is empty and provides helper to check sync state.
 * Used by staff pages to display CTA "Sync Now" instead of empty tables.
 */

import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

export type BootstrapState = {
  isEmpty: boolean;
  memberCount: number;
  bankLogCount: number;
  lastSyncAt?: Date | null;
};

/**
 * Check if database needs initial sync
 */
export async function checkBootstrapState(
  familyId: string = DEFAULT_FAMILY_ID
): Promise<BootstrapState> {
  const [memberCount, bankLogCount] = await Promise.all([
    prisma.member.count({ where: { familyId } }),
    prisma.bankLog.count({ where: { familyId } }),
  ]);

  const isEmpty = memberCount === 0 && bankLogCount === 0;

  // Try to get last sync timestamp from SyncState table
  let lastSyncAt: Date | null = null;
  try {
    const syncState = await prisma.syncState.findFirst({
      where: { key: { in: ["infos", "banklogs", "members"] } },
      orderBy: { syncedAt: "desc" },
      select: { syncedAt: true },
    });
    lastSyncAt = syncState?.syncedAt ?? null;
  } catch {
    // SyncState table might not exist, ignore
  }

  return {
    isEmpty,
    memberCount,
    bankLogCount,
    lastSyncAt,
  };
}
