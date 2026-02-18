/**
 * Centralized Family configuration
 * All family-related constants should be imported from here
 */

import { prisma } from "@/lib/db";
import { debug, error as logError } from "@/lib/logger";

// CRITICAL: Family slug for LYG API calls - MUST be "esperados"
// Never use display name "Los Esperados" in URLs
export const DEFAULT_FAMILY_ID = process.env.FAMILY_ID ?? "esperados";
export const FAMILY_SLUG = "esperados"; // Enforce slug-only

// Family name lookup table (for UI display only, NOT for API calls)
export const FAMILY_NAMES: Record<string, string> = {
  esperados: "Los Esperados",
};

// Default family display name (derived from slug)
export const DEFAULT_FAMILY_NAME = FAMILY_NAMES[DEFAULT_FAMILY_ID] ?? "Los Esperados";

// Cache for the resolved family (cleared on app restart)
let cachedFamilyId: string | null = null;

/**
 * Get family name by ID
 */
export function getFamilyName(familyId: string): string {
  return FAMILY_NAMES[familyId] ?? familyId;
}

/**
 * Check if a familyId is known/valid
 */
export function isKnownFamily(familyId: string): boolean {
  return familyId in FAMILY_NAMES;
}

/**
 * Resolve the Family database ID from the configured slug.
 * 
 * This function ensures the Family exists in the database and returns its cuid.
 * The result is cached for the lifetime of the app process.
 * 
 * IMPORTANT: Family.id is a cuid, Family.slug stores the external ID (e.g., "esperados")
 * Always use this function to get familyId for Member operations to avoid FK constraint violations.
 * 
 * @param familySlug - The external family identifier (default: FAMILY_ID env var)
 * @returns The Family cuid from database
 * @throws Error if Family cannot be resolved
 */
export async function resolveFamilyId(familySlug: string = DEFAULT_FAMILY_ID): Promise<string> {
  // Return cached value if available
  if (cachedFamilyId) {
    return cachedFamilyId;
  }

  try {
    // Upsert Family to ensure it exists
    const family = await prisma.family.upsert({
      where: { slug: familySlug },
      update: { name: FAMILY_NAMES[familySlug] || familySlug },
      create: { slug: familySlug, name: FAMILY_NAMES[familySlug] || familySlug },
      select: { id: true, slug: true },
    });

    if (!family || !family.id) {
      throw new Error(`Failed to resolve Family with slug "${familySlug}"`);
    }

    // Cache the result
    cachedFamilyId = family.id;

    debug("[family] Resolved Family", {
      slug: family.slug,
      id: family.id,
    });

    return family.id;
  } catch (err: any) {
    logError("[family] Failed to resolve Family", {
      slug: familySlug,
      error: err.message,
    });
    throw new Error(`Family resolution failed for slug "${familySlug}": ${err.message}`);
  }
}

/**
 * Clear the cached Family ID (useful for testing or manual refresh)
 */
export function clearFamilyCache(): void {
  cachedFamilyId = null;
}

/**
 * Get the configured Family slug from environment
 */
export function getFamilySlug(): string {
  return DEFAULT_FAMILY_ID;
}

/**
 * Validate that a familyId is a cuid (not a slug)
 * Throws in development, warns in production to avoid breaking live systems
 * 
 * IMPORTANT: Always use resolveFamilyId() to get the cuid before Prisma queries
 * 
 * @param familyId - The familyId to validate
 * @param context - Optional context for better error messages
 */
export function validateFamilyId(familyId: string, context?: string): void {
  // cuid format: starts with 'c', followed by 24 alphanumeric chars
  // Example: cml43heci0007132gi4hgwvfs
  const isCuid = /^c[a-z0-9]{24}$/i.test(familyId);
  
  if (!isCuid) {
    const message = `[FAMILY_ID ERROR] Using slug "${familyId}" instead of cuid in ${context || 'Prisma query'}. Use resolveFamilyId() to get the cuid.`;
    
    if (process.env.NODE_ENV === 'development') {
      throw new Error(message);
    } else {
      console.warn(message);
    }
  }
}

