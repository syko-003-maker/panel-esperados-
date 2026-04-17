import { BLACKLIST_ROLE_ID, RESERVIST_ROLE_ID } from "@/lib/discord-grade";
import { DEMOTE_ROLE_ID } from "@/lib/discord-rbac";

export const SANCTION_TYPES = [
  "AVERT_ORAL_PLAYTIME",
  "AVERT_ORAL_REUNION",
  "AVERT_LEGER",
  "AVERT_LOURD",
  "DEMOTE",
  "RESERVISTE",
  "BLACKLIST",
] as const;

export type SanctionTypeValue = (typeof SANCTION_TYPES)[number];

export const AVERT_TYPES = [
  "AVERT_ORAL_PLAYTIME",
  "AVERT_ORAL_REUNION",
  "AVERT_LEGER",
  "AVERT_LOURD",
] as const;

export const BLOCKING_SANCTION_TYPES = ["DEMOTE", "RESERVISTE", "BLACKLIST"] as const;

export const SANCTION_LABELS: Record<SanctionTypeValue, string> = {
  AVERT_ORAL_PLAYTIME: "Averto playtime",
  AVERT_ORAL_REUNION: "Averto réunion",
  AVERT_LEGER: "Averto léger",
  AVERT_LOURD: "Averto lourd",
  DEMOTE: "Démote",
  RESERVISTE: "Réserviste",
  BLACKLIST: "Blacklist",
};

export const AVERT_ROLE_IDS: Record<(typeof AVERT_TYPES)[number], string> = {
  AVERT_ORAL_PLAYTIME: "1343272798231199836",
  AVERT_ORAL_REUNION: "1343272736331665500",
  AVERT_LEGER: "1312845999340781640",
  AVERT_LOURD: "1312845999340781641",
};

export function isValidSanctionType(value: string): value is SanctionTypeValue {
  return SANCTION_TYPES.includes(value as SanctionTypeValue);
}

export function isAvertType(value: string): value is (typeof AVERT_TYPES)[number] {
  return AVERT_TYPES.includes(value as (typeof AVERT_TYPES)[number]);
}

export function getSanctionLabel(value: string): string {
  if (isValidSanctionType(value)) {
    return SANCTION_LABELS[value];
  }
  return value.replace(/_/g, " ");
}

export function getSanctionExpirationDate(type: string, startAt: Date): Date | null {
  if (
    type === "AVERT_ORAL_PLAYTIME" ||
    type === "AVERT_ORAL_REUNION" ||
    type === "AVERT_LEGER"
  ) {
    return new Date(startAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  }

  if (type === "AVERT_LOURD") {
    return new Date(startAt.getTime() + 14 * 24 * 60 * 60 * 1000);
  }

  return null;
}

export function getAvertRoleId(type: string): string | null {
  if (!isAvertType(type)) return null;
  return AVERT_ROLE_IDS[type];
}

export const SANCTION_DELETE_BLOCKING_OUTBOX_STATUSES = [
  "SENDING",
  "SENT",
  "RUNNING",
  "SUCCEEDED",
] as const;

const CLEARABLE_SANCTION_TYPES = [
  ...AVERT_TYPES,
  "DEMOTE",
  "RESERVISTE",
  "BLACKLIST",
] as const;

type SanctionLike = {
  status?: string | null;
  discordStatus?: string | null;
  outboxStatus?: string | null;
  clearedAt?: string | Date | null;
  clearedStatus?: string | null;
  type?: string | null;
};

function normalize(value: string | null | undefined): string {
  return String(value ?? "").trim().toUpperCase();
}

export function isClearableSanctionType(type: string | null | undefined): boolean {
  const normalized = normalize(type);
  return (CLEARABLE_SANCTION_TYPES as readonly string[]).includes(normalized);
}

export function getSanctionClearRoleId(type: string | null | undefined): string | null {
  const normalized = normalize(type);

  if (isAvertType(normalized)) {
    return AVERT_ROLE_IDS[normalized];
  }
  if (normalized === "DEMOTE") {
    return DEMOTE_ROLE_ID;
  }
  if (normalized === "RESERVISTE") {
    return RESERVIST_ROLE_ID;
  }
  if (normalized === "BLACKLIST") {
    return BLACKLIST_ROLE_ID;
  }

  return null;
}

export function canDeleteSanction(sanction: SanctionLike): boolean {
  const discordStatus = normalize(sanction.discordStatus);
  if (discordStatus === "APPLIED") return false;

  const outboxStatus = normalize(sanction.outboxStatus);
  if (
    outboxStatus &&
    (SANCTION_DELETE_BLOCKING_OUTBOX_STATUSES as readonly string[]).includes(outboxStatus)
  ) {
    return false;
  }

  return true;
}

export function canClearSanction(sanction: SanctionLike): boolean {
  const status = normalize(sanction.status);
  if (status && status !== "ACTIVE") return false;

  if (sanction.clearedAt) return false;

  const clearedStatus = normalize(sanction.clearedStatus);
  if (clearedStatus === "PENDING") return false;

  return isClearableSanctionType(sanction.type);
}