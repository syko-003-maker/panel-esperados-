/**
 * Feature Flag Guards
 * Check feature flags before executing critical operations
 */

import { NextResponse } from "next/server";
import { isFeatureEnabled, isMaintenanceMode, type FeatureFlag } from "@/lib/config";
import { recordPanelMetric } from "@/lib/metrics";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type FeatureGuardResult =
  | { allowed: true }
  | { allowed: false; response: NextResponse };

// ─────────────────────────────────────────────────────────────
// Guards
// ─────────────────────────────────────────────────────────────

/**
 * Check if a feature is enabled, return error response if not
 */
export async function requireFeature(
  flag: FeatureFlag,
  context?: string
): Promise<FeatureGuardResult> {
  // Check maintenance mode first
  const maintenance = await isMaintenanceMode();
  if (maintenance) {
    await recordPanelMetric("feature.blocked", flag, {
      reason: "maintenance_mode",
      context,
    }).catch(() => {});

    return {
      allowed: false,
      response: NextResponse.json(
        {
          ok: false,
          error: "Service temporarily unavailable (maintenance mode)",
          code: "MAINTENANCE_MODE",
        },
        { status: 503 }
      ),
    };
  }

  const enabled = await isFeatureEnabled(flag);

  if (!enabled) {
    await recordPanelMetric("feature.blocked", flag, {
      reason: "feature_disabled",
      context,
    }).catch(() => {});

    return {
      allowed: false,
      response: NextResponse.json(
        {
          ok: false,
          error: `Feature ${flag} is currently disabled`,
          code: "FEATURE_DISABLED",
          feature: flag,
        },
        { status: 503 }
      ),
    };
  }

  return { allowed: true };
}

/**
 * Check multiple features
 */
export async function requireFeatures(
  flags: FeatureFlag[],
  context?: string
): Promise<FeatureGuardResult> {
  for (const flag of flags) {
    const result = await requireFeature(flag, context);
    if (!result.allowed) {
      return result;
    }
  }
  return { allowed: true };
}

/**
 * Simple boolean check (for non-API usage)
 */
export async function checkFeature(flag: FeatureFlag): Promise<boolean> {
  const maintenance = await isMaintenanceMode();
  if (maintenance) return false;

  return isFeatureEnabled(flag);
}

// ─────────────────────────────────────────────────────────────
// Specific Feature Guards
// ─────────────────────────────────────────────────────────────

/**
 * Guard for tickets/recruitment operations
 */
export async function requireTicketsEnabled(context?: string): Promise<FeatureGuardResult> {
  return requireFeature("ENABLE_TICKETS", context ?? "tickets");
}

/**
 * Guard for sanctions operations
 */
export async function requireSanctionsEnabled(context?: string): Promise<FeatureGuardResult> {
  return requireFeature("ENABLE_SANCTIONS", context ?? "sanctions");
}

/**
 * Guard for meetings operations
 */
export async function requireMeetingsEnabled(context?: string): Promise<FeatureGuardResult> {
  return requireFeature("ENABLE_MEETINGS", context ?? "meetings");
}

/**
 * Guard for activity tracking operations
 */
export async function requireActivityEnabled(context?: string): Promise<FeatureGuardResult> {
  return requireFeature("ENABLE_ACTIVITY", context ?? "activity");
}

/**
 * Guard for sync roles operations
 */
export async function requireSyncRolesEnabled(context?: string): Promise<FeatureGuardResult> {
  return requireFeature("ENABLE_SYNCROLES", context ?? "syncroles");
}

/**
 * Guard for DM notifications
 */
export async function requireDmNotificationsEnabled(context?: string): Promise<FeatureGuardResult> {
  return requireFeature("ENABLE_DM_NOTIFICATIONS", context ?? "dm_notifications");
}

// ─────────────────────────────────────────────────────────────
// Logging Wrapper
// ─────────────────────────────────────────────────────────────

/**
 * Execute an action with feature flag check and logging
 */
export async function withFeatureGuard<T>(
  flag: FeatureFlag,
  action: () => Promise<T>,
  context?: string
): Promise<T | null> {
  const enabled = await checkFeature(flag);

  if (!enabled) {
    console.log(`[FeatureGuard] ${flag} is disabled, skipping action${context ? ` (${context})` : ""}`);
    return null;
  }

  return action();
}
