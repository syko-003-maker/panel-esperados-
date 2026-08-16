/**
 * Application Configuration & Feature Flags Service
 * Dynamic configuration with in-memory caching
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { toFamilyCuid } from "@/lib/family";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type ConfigValue = string | number | boolean | object | null;

export type FeatureFlag =
  | "ENABLE_TICKETS"
  | "ENABLE_SANCTIONS"
  | "ENABLE_MEETINGS"
  | "ENABLE_ACTIVITY"
  | "ENABLE_DM_NOTIFICATIONS"
  | "ENABLE_SYNCROLES"
  | "ENABLE_BANK_ALERTS"
  | "ENABLE_GDPR_PURGE"
  | "ENABLE_BACKUPS"
  | "MAINTENANCE_MODE";

// ─────────────────────────────────────────────────────────────
// Default Values
// ─────────────────────────────────────────────────────────────

const DEFAULT_FEATURE_FLAGS: Record<FeatureFlag, boolean> = {
  ENABLE_TICKETS: true,
  ENABLE_SANCTIONS: true,
  ENABLE_MEETINGS: true,
  ENABLE_ACTIVITY: true,
  ENABLE_DM_NOTIFICATIONS: false,
  ENABLE_SYNCROLES: true,
  ENABLE_BANK_ALERTS: true,
  ENABLE_GDPR_PURGE: false,
  ENABLE_BACKUPS: true,
  MAINTENANCE_MODE: false,
};

const DEFAULT_CONFIGS: Record<string, ConfigValue> = {
  // Rate limits
  "rate.ingest.perMinute": 100,
  "rate.api.perMinute": 1000,

  // Timeouts
  "timeout.discord.ms": 30000,
  "timeout.sync.ms": 60000,

  // Thresholds
  "threshold.ingestKo.alert": 10,
  "threshold.workerOffline.minutes": 5,

  // Pagination
  "pagination.default": 25,
  "pagination.max": 100,

  // Feature configs
  "activity.periodDays": 7,
  "sanctions.autoExpireEnabled": true,
  "meetings.requireAttendancePercent": 50,
};

// ─────────────────────────────────────────────────────────────
// Cache
// ─────────────────────────────────────────────────────────────

type CacheEntry = {
  value: ConfigValue;
  expiresAt: number;
};

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 60 * 1000; // 60 seconds

const DEFAULT_FAMILY_ID = "esperados";

function getCacheKey(familyId: string, key: string): string {
  return `${familyId}:${key}`;
}

function getFromCache(familyId: string, key: string): ConfigValue | undefined {
  const cacheKey = getCacheKey(familyId, key);
  const entry = cache.get(cacheKey);

  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    cache.delete(cacheKey);
    return undefined;
  }

  return entry.value;
}

function setInCache(familyId: string, key: string, value: ConfigValue): void {
  const cacheKey = getCacheKey(familyId, key);
  cache.set(cacheKey, {
    value,
    expiresAt: Date.now() + CACHE_TTL_MS,
  });
}

function invalidateCache(familyId?: string, key?: string): void {
  if (familyId && key) {
    cache.delete(getCacheKey(familyId, key));
  } else if (familyId) {
    for (const cacheKey of cache.keys()) {
      if (cacheKey.startsWith(`${familyId}:`)) {
        cache.delete(cacheKey);
      }
    }
  } else {
    cache.clear();
  }
}

// ─────────────────────────────────────────────────────────────
// Config Functions
// ─────────────────────────────────────────────────────────────

/**
 * Get a configuration value
 */
export async function getConfig<T extends ConfigValue = ConfigValue>(
  key: string,
  defaultValue?: T,
  familyIdOrSlug: string = DEFAULT_FAMILY_ID
): Promise<T> {
  const familyId = await toFamilyCuid(familyIdOrSlug);
  // Check cache first
  const cached = getFromCache(familyId, key);
  if (cached !== undefined) {
    return cached as T;
  }

  try {
    const config = await prisma.appConfig.findUnique({
      where: { familyId_key: { familyId, key } },
    });

    if (config) {
      const value = config.value as T;
      setInCache(familyId, key, value);
      return value;
    }
  } catch (error) {
    console.error(`[Config] Error fetching ${key}:`, error);
  }

  // Return default value
  const fallback = defaultValue ?? DEFAULT_CONFIGS[key] ?? DEFAULT_FEATURE_FLAGS[key as FeatureFlag];
  return fallback as T;
}

/**
 * Set a configuration value
 */
export async function setConfig(
  key: string,
  value: ConfigValue,
  familyIdOrSlug: string = DEFAULT_FAMILY_ID
): Promise<void> {
  const familyId = await toFamilyCuid(familyIdOrSlug);
  await prisma.appConfig.upsert({
    where: { familyId_key: { familyId, key } },
    create: {
      familyId,
      key,
      value: value as Prisma.InputJsonValue,
    },
    update: {
      value: value as Prisma.InputJsonValue,
    },
  });

  // Invalidate cache
  invalidateCache(familyId, key);
}

/**
 * Delete a configuration value
 */
export async function deleteConfig(
  key: string,
  familyIdOrSlug: string = DEFAULT_FAMILY_ID
): Promise<void> {
  const familyId = await toFamilyCuid(familyIdOrSlug);
  await prisma.appConfig.deleteMany({
    where: { familyId, key },
  });

  invalidateCache(familyId, key);
}

/**
 * Get all configurations for a family
 */
export async function getAllConfigs(
  familyId: string = DEFAULT_FAMILY_ID
): Promise<Record<string, ConfigValue>> {
  const configs = await prisma.appConfig.findMany({
    where: { familyId },
    orderBy: { key: "asc" },
  });

  const result: Record<string, ConfigValue> = {};

  // Start with defaults
  for (const [key, value] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
    result[key] = value;
  }
  for (const [key, value] of Object.entries(DEFAULT_CONFIGS)) {
    result[key] = value;
  }

  // Override with DB values
  for (const config of configs) {
    result[config.key] = config.value as ConfigValue;
    setInCache(familyId, config.key, config.value as ConfigValue);
  }

  return result;
}

/**
 * Get raw configs from DB (for admin UI)
 */
export async function getConfigsRaw(familyIdOrSlug: string = DEFAULT_FAMILY_ID) {
  const familyId = await toFamilyCuid(familyIdOrSlug);
  return prisma.appConfig.findMany({
    where: { familyId },
    orderBy: { key: "asc" },
  });
}

// ─────────────────────────────────────────────────────────────
// Feature Flag Functions
// ─────────────────────────────────────────────────────────────

/**
 * Check if a feature is enabled
 */
export async function isFeatureEnabled(
  flag: FeatureFlag,
  familyId: string = DEFAULT_FAMILY_ID
): Promise<boolean> {
  const value = await getConfig<boolean>(flag, DEFAULT_FEATURE_FLAGS[flag], familyId);
  return value === true;
}

/**
 * Enable a feature
 */
export async function enableFeature(
  flag: FeatureFlag,
  familyId: string = DEFAULT_FAMILY_ID
): Promise<void> {
  await setConfig(flag, true, familyId);
}

/**
 * Disable a feature
 */
export async function disableFeature(
  flag: FeatureFlag,
  familyId: string = DEFAULT_FAMILY_ID
): Promise<void> {
  await setConfig(flag, false, familyId);
}

/**
 * Get all feature flags status
 */
export async function getFeatureFlags(
  familyId: string = DEFAULT_FAMILY_ID
): Promise<Record<FeatureFlag, boolean>> {
  const result = { ...DEFAULT_FEATURE_FLAGS };

  for (const flag of Object.keys(DEFAULT_FEATURE_FLAGS) as FeatureFlag[]) {
    result[flag] = await isFeatureEnabled(flag, familyId);
  }

  return result;
}

// ─────────────────────────────────────────────────────────────
// Maintenance Mode
// ─────────────────────────────────────────────────────────────

/**
 * Check if maintenance mode is enabled
 */
export async function isMaintenanceMode(familyId: string = DEFAULT_FAMILY_ID): Promise<boolean> {
  return isFeatureEnabled("MAINTENANCE_MODE", familyId);
}

/**
 * Set maintenance mode
 */
export async function setMaintenanceMode(
  enabled: boolean,
  familyId: string = DEFAULT_FAMILY_ID
): Promise<void> {
  await setConfig("MAINTENANCE_MODE", enabled, familyId);
}

// ─────────────────────────────────────────────────────────────
// Cache Management
// ─────────────────────────────────────────────────────────────

/**
 * Clear all config cache
 */
export function clearConfigCache(): void {
  invalidateCache();
}

/**
 * Get cache stats (for debugging)
 */
export function getCacheStats(): { size: number; keys: string[] } {
  return {
    size: cache.size,
    keys: Array.from(cache.keys()),
  };
}

// ─────────────────────────────────────────────────────────────
// Initialization
// ─────────────────────────────────────────────────────────────

/**
 * Initialize default feature flags in DB
 */
export async function initializeFeatureFlags(familyId: string = DEFAULT_FAMILY_ID): Promise<void> {
  for (const [flag, defaultValue] of Object.entries(DEFAULT_FEATURE_FLAGS)) {
    const existing = await prisma.appConfig.findUnique({
      where: { familyId_key: { familyId, key: flag } },
    });

    if (!existing) {
      await prisma.appConfig.create({
        data: {
          familyId,
          key: flag,
          value: defaultValue,
        },
      });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Export defaults for UI
// ─────────────────────────────────────────────────────────────

export { DEFAULT_FEATURE_FLAGS, DEFAULT_CONFIGS };
