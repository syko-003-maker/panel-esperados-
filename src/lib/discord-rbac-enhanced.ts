/**
 * Enhanced Discord RBAC with "last known good" fallback
 * Purpose: Never deny access due to transient Discord 429 errors
 * 
 * Policy:
 * - If Discord OK (fresh or cache < 15min): ALLOW
 * - If Discord 429 + lastOkAt < 24h: ALLOW WITH WARNING
 * - If Discord 429 + no lastKnownGood: DENY (but log for investigation)
 * 
 * For WRITES (role changes, sanctions):
 * - Require fresh check < 5min OR queue via DiscordRoleJob
 */

import { prisma } from "@/lib/db";
import { batchFetchDiscordMembers } from "@/lib/discord-batch-reliable";
import { debug, warn } from "@/lib/logger";
import { getStaffRoleIds } from "@/lib/discord-rbac";

const FRESH_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes
const LAST_KNOWN_GOOD_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours
const WRITE_FRESH_THRESHOLD_MS = 5 * 60 * 1000; // 5 minutes for writes

export type RBACCheckResult = {
  allowed: boolean;
  roles: string[];
  reason:
    | "fresh" // Live data < 15min
    | "cache" // In-memory cache
    | "lastKnownGood" // DB fallback < 24h
    | "denied" // No valid data
    | "notInGuild"; // Member not in Discord guild
  fetchedAt?: Date;
  lastOkAt?: Date;
  errorCode?: "RATE_LIMIT" | "CONFIG_MISSING" | "UNAVAILABLE";
};

/**
 * Check if user has staff privileges (READ operations)
 * Uses graceful degradation: allows access if lastOkAt < 24h
 */
export async function checkStaffAccess(
  discordId: string,
  requireRoles?: string[]
): Promise<RBACCheckResult> {
  if (!discordId) {
    return {
      allowed: false,
      roles: [],
      reason: "denied",
      errorCode: "CONFIG_MISSING",
    };
  }

  // Fetch from cache + DB fallback
  const statusMap = await batchFetchDiscordMembers([discordId]);
  const status = statusMap[discordId];

  if (!status) {
    return {
      allowed: false,
      roles: [],
      reason: "denied",
      errorCode: "UNAVAILABLE",
    };
  }

  // If not in guild, deny immediately
  if (status.ok && status.inGuild === false) {
    debug("[rbac-enhanced] User not in guild", { discordId });
    return {
      allowed: false,
      roles: [],
      reason: "notInGuild",
    };
  }

  const now = Date.now();
  const roles = status.roles || [];
  const staffRoleIds = requireRoles || getStaffRoleIds();
  const hasStaffRole = roles.some((r) => staffRoleIds.includes(r));

  // FRESH data (live or recent cache)
  if (status.ok && status.source === "live") {
    debug("[rbac-enhanced] Fresh data, access granted", {
      discordId,
      hasStaffRole,
    });
    return {
      allowed: hasStaffRole,
      roles,
      reason: "fresh",
      fetchedAt: status.fetchedAt,
    };
  }

  // CACHE data (in-memory < 15min)
  if (status.ok && status.source === "cache") {
    debug("[rbac-enhanced] Cache data, access granted", {
      discordId,
      hasStaffRole,
    });
    return {
      allowed: hasStaffRole,
      roles,
      reason: "cache",
      fetchedAt: status.fetchedAt,
    };
  }

  // LAST KNOWN GOOD fallback (DB < 24h)
  if (status.source === "lastKnownGood") {
    const snapshot = await prisma.discordSnapshot.findUnique({
      where: { discordId },
    });

    if (
      snapshot &&
      snapshot.lastOkAt &&
      now - snapshot.lastOkAt.getTime() < LAST_KNOWN_GOOD_THRESHOLD_MS
    ) {
      const snapshotRoles = snapshot.roles || [];
      const snapshotHasStaffRole = snapshotRoles.some((r: string) =>
        staffRoleIds.includes(r)
      );

      warn("[rbac-enhanced] Using lastKnownGood fallback", {
        discordId,
        lastOkAt: snapshot.lastOkAt,
        ageMs: now - snapshot.lastOkAt.getTime(),
        hasStaffRole: snapshotHasStaffRole,
      });

      return {
        allowed: snapshotHasStaffRole,
        roles: snapshotRoles,
        reason: "lastKnownGood",
        lastOkAt: snapshot.lastOkAt,
      };
    }
  }

  // RATE_LIMIT error with no valid lastKnownGood
  if (status.errorCode === "RATE_LIMIT") {
    warn("[rbac-enhanced] Rate limit with no lastKnownGood, denying access", {
      discordId,
    });
    return {
      allowed: false,
      roles: [],
      reason: "denied",
      errorCode: "RATE_LIMIT",
    };
  }

  // All other cases: deny
  debug("[rbac-enhanced] No valid data, denying access", {
    discordId,
    errorCode: status.errorCode,
  });
  return {
    allowed: false,
    roles: [],
    reason: "denied",
    errorCode: status.errorCode,
  };
}

/**
 * Check if user has staff privileges for WRITE operations
 * Requires fresh data (< 5min) OR queues via DiscordRoleJob
 */
export async function checkStaffAccessForWrite(
  discordId: string,
  requireRoles?: string[]
): Promise<RBACCheckResult> {
  const result = await checkStaffAccess(discordId, requireRoles);

  // If using lastKnownGood or old cache, require fresh check
  if (result.reason === "lastKnownGood") {
    warn("[rbac-enhanced] Write requires fresh check, lastKnownGood not sufficient", {
      discordId,
    });
    return {
      ...result,
      allowed: false,
      reason: "denied",
      errorCode: "RATE_LIMIT",
    };
  }

  // If cache is old (> 5min), deny
  if (result.fetchedAt) {
    const ageMs = Date.now() - result.fetchedAt.getTime();
    if (ageMs > WRITE_FRESH_THRESHOLD_MS) {
      warn("[rbac-enhanced] Write requires fresh check, cache too old", {
        discordId,
        ageMs,
      });
      return {
        ...result,
        allowed: false,
        reason: "denied",
        errorCode: "UNAVAILABLE",
      };
    }
  }

  return result;
}

/**
 * Batch check multiple users
 */
export async function batchCheckStaffAccess(
  discordIds: string[],
  requireRoles?: string[]
): Promise<Record<string, RBACCheckResult>> {
  const statusMap = await batchFetchDiscordMembers(discordIds);
  const results: Record<string, RBACCheckResult> = {};

  for (const discordId of discordIds) {
    const status = statusMap[discordId];
    if (!status) {
      results[discordId] = {
        allowed: false,
        roles: [],
        reason: "denied",
        errorCode: "UNAVAILABLE",
      };
      continue;
    }

    const roles = status.roles || [];
    const staffRoleIds = requireRoles || getStaffRoleIds();
    const hasStaffRole = roles.some((r) => staffRoleIds.includes(r));

    if (status.ok && status.inGuild !== false) {
      results[discordId] = {
        allowed: hasStaffRole,
        roles,
        reason: status.source === "live" ? "fresh" : status.source === "cache" ? "cache" : "lastKnownGood",
        fetchedAt: status.fetchedAt,
      };
    } else {
      results[discordId] = {
        allowed: false,
        roles: [],
        reason: status.inGuild === false ? "notInGuild" : "denied",
        errorCode: status.errorCode,
      };
    }
  }

  return results;
}
