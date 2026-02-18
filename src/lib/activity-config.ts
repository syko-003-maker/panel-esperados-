import type { PrismaClient } from "@prisma/client";

export type ActivityConfig = {
  inactivityDays: number;
  lowPlaytimeMin: number;
  lowPlaytimeMax: number;
  discordAlertsEnabled: boolean;
  discordCooldownMinutes: number;
  digestEnabled: boolean;
  digestOnSync: boolean;
  digestMaxLines: number;
};

export const DEFAULT_ACTIVITY_CONFIG: ActivityConfig = {
  inactivityDays: 14,
  lowPlaytimeMin: 100,
  lowPlaytimeMax: 200,
  discordAlertsEnabled: true,
  discordCooldownMinutes: 120,
  digestEnabled: true,
  digestOnSync: false,
  digestMaxLines: 25,
};

const CONFIG_PREFIX = "activity:config:";

function parseMeta(meta: unknown) {
  if (!meta) return null;
  if (typeof meta === "string") {
    try {
      return JSON.parse(meta);
    } catch {
      return null;
    }
  }
  if (typeof meta === "object") return meta;
  return null;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function normalizeNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function normalizeBoolean(value: unknown, fallback: boolean) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === "boolean") return value;
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) return true;
  if (["0", "false", "no", "off"].includes(normalized)) return false;
  return fallback;
}

export function normalizeActivityConfig(input?: Partial<ActivityConfig> | null): ActivityConfig {
  const base = DEFAULT_ACTIVITY_CONFIG;
  const inactivityDays = clamp(
    Math.round(normalizeNumber(input?.inactivityDays, base.inactivityDays)),
    1,
    365
  );
  const lowPlaytimeMin = clamp(
    Math.round(normalizeNumber(input?.lowPlaytimeMin, base.lowPlaytimeMin)),
    0,
    20000
  );
  const lowPlaytimeMax = clamp(
    Math.round(normalizeNumber(input?.lowPlaytimeMax, base.lowPlaytimeMax)),
    lowPlaytimeMin,
    20000
  );
  const discordCooldownMinutes = clamp(
    Math.round(normalizeNumber(input?.discordCooldownMinutes, base.discordCooldownMinutes)),
    0,
    10080
  );
  const digestMaxLines = clamp(
    Math.round(normalizeNumber(input?.digestMaxLines, base.digestMaxLines)),
    5,
    100
  );

  return {
    inactivityDays,
    lowPlaytimeMin,
    lowPlaytimeMax,
    discordAlertsEnabled: normalizeBoolean(input?.discordAlertsEnabled, base.discordAlertsEnabled),
    discordCooldownMinutes,
    digestEnabled: normalizeBoolean(input?.digestEnabled, base.digestEnabled),
    digestOnSync: normalizeBoolean(input?.digestOnSync, base.digestOnSync),
    digestMaxLines,
  };
}

export function activityConfigToRules(config: ActivityConfig) {
  return {
    inactivityDays: config.inactivityDays,
    lowPlaytimeMin: config.lowPlaytimeMin,
    lowPlaytimeMax: config.lowPlaytimeMax,
  };
}

export async function getActivityConfig(prisma: PrismaClient, familyId: string): Promise<ActivityConfig> {
  const key = `${CONFIG_PREFIX}${familyId}`;
  const row = await prisma.syncState.findUnique({ where: { key } });
  const parsed = parseMeta(row?.meta ?? null) as Partial<ActivityConfig> | null;
  return normalizeActivityConfig(parsed ?? undefined);
}

export async function updateActivityConfig(
  prisma: PrismaClient,
  familyId: string,
  patch: Partial<ActivityConfig>
): Promise<ActivityConfig> {
  const key = `${CONFIG_PREFIX}${familyId}`;
  const existing = await getActivityConfig(prisma, familyId);
  const next = normalizeActivityConfig({ ...existing, ...patch });

  await prisma.syncState.upsert({
    where: { key },
    update: { meta: next },
    create: { key, meta: next },
  });

  return next;
}
