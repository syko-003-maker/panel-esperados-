/**
 * Family ID Resolution
 * 
 * Converts slug (e.g., "esperados") to numeric family ID if needed.
 * LYG API may require numeric IDs for some endpoints.
 * 
 * Strategy:
 * 1. If FAMILY_ID is already numeric, use as-is
 * 2. If slug, call /api/lyg/infos to get all families and resolve by name/slug
 * 3. Cache in memory to avoid repeated lookups
 */

import { debug, warn } from "@/lib/logger";
import { lygFetch } from "@/lib/lyg";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

type FamilyInfo = {
  id: number;
  name: string;
  slug?: string;
};

let cachedNumericId: number | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Resolve family ID to numeric format for LYG API
 */
export async function resolveNumericFamilyId(
  familyId: string = DEFAULT_FAMILY_ID
): Promise<number | null> {
  // If already numeric, return as-is
  const parsed = parseInt(familyId, 10);
  if (!Number.isNaN(parsed) && String(parsed) === familyId) {
    debug(`[family-resolver] Family ID is already numeric: ${parsed}`);
    return parsed;
  }

  // Check cache
  const now = Date.now();
  if (cachedNumericId && now - cacheTimestamp < CACHE_TTL) {
    debug(`[family-resolver] Using cached numeric ID: ${cachedNumericId}`);
    return cachedNumericId;
  }

  // Resolve via LYG API
  try {
    debug(`[family-resolver] Resolving slug "${familyId}" via LYG /infos`);
    
    const infos = await lygFetch<{ families?: FamilyInfo[] }>("/infos", {
      noStore: true,
    });

    if (!infos.families || infos.families.length === 0) {
      warn(`[family-resolver] No families returned from LYG /infos`);
      return null;
    }

    // Match by slug or name (case-insensitive)
    const lower = familyId.toLowerCase();
    const match = infos.families.find(
      (f) =>
        f.slug?.toLowerCase() === lower ||
        f.name.toLowerCase() === lower ||
        f.name.toLowerCase().includes(lower)
    );

    if (!match) {
      warn(
        `[family-resolver] No match found for "${familyId}" in families:`,
        infos.families.map((f) => f.name).join(", ")
      );
      return null;
    }

    cachedNumericId = match.id;
    cacheTimestamp = now;
    debug(`[family-resolver] Resolved "${familyId}" → ${match.id} (${match.name})`);
    
    return match.id;
  } catch (err: any) {
    warn(`[family-resolver] Failed to resolve family ID:`, err.message);
    return null;
  }
}

/**
 * Get the correct family ID to use for LYG API calls
 * Returns numeric if possible, otherwise original slug
 */
export async function getFamilyIdForLyg(
  familyId: string = DEFAULT_FAMILY_ID
): Promise<string> {
  const numeric = await resolveNumericFamilyId(familyId);
  return numeric ? String(numeric) : familyId;
}
