import { lygFetch } from "@/lib/lyg";
import { FAMILY_SLUG } from "@/lib/family";

export type PlaytimeSnapshotItem = {
  discordId: string;
  name?: string | null;
  playtimeMinutes?: number | null;
  lastSeenAt?: string | null;
};

function extractItems(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.members)) return payload.members;
  return [];
}

function normalizeNumber(value: any): number | null {
  if (value === null || value === undefined) return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, Math.floor(parsed));
}

function normalizeDate(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    const ms = value > 1_000_000_000_000 ? value : value * 1000;
    const parsed = new Date(ms);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normalizeItem(it: any): PlaytimeSnapshotItem | null {
  const discordRaw = it?.discordId ?? it?.discord_id ?? it?.discord ?? null;
  const discordId = String(discordRaw ?? "").trim();
  if (!discordId) return null;

  const nameRaw = it?.name ?? it?.pseudo ?? it?.username ?? it?.displayName ?? null;
  const playtimeRaw =
    it?.playtimeMinutes ??
    it?.playtime_minutes ??
    it?.playtime ??
    it?.minutes ??
    it?.timePlayedMinutes ??
    null;
  const lastSeenRaw =
    it?.lastSeenAt ??
    it?.last_seen_at ??
    it?.last_seen ??
    it?.lastActivityAt ??
    it?.lastActivity ??
    null;

  return {
    discordId,
    name: nameRaw != null ? String(nameRaw) : null,
    playtimeMinutes: normalizeNumber(playtimeRaw),
    lastSeenAt: normalizeDate(lastSeenRaw),
  };
}

/**
 * Fetch playtime snapshot from LYG
 * CRITICAL: Always uses FAMILY_SLUG, ignores familyId parameter
 */
export async function fetchPlaytimeSnapshot(familyId?: string): Promise<PlaytimeSnapshotItem[]> {
  // Warn if familyId passed is not slug
  if (familyId && familyId !== FAMILY_SLUG) {
    console.warn("[activity-fetch] Ignoring non-slug familyId, using FAMILY_SLUG", {
      received: familyId,
      enforced: FAMILY_SLUG,
    });
  }

  let payload: any;

  try {
    console.log("[activity-fetch] Fetching members from LYG with slug", { slug: FAMILY_SLUG });
    // CRITICAL: Use FAMILY_SLUG, never familyId parameter
    payload = await lygFetch<any>(`/familles/${FAMILY_SLUG}/members`, { noStore: true });
  } catch (e: any) {
    console.error("[activity-fetch] ERROR fetching from LYG", {
      error: String(e?.message ?? e),
      slug: FAMILY_SLUG,
    });
    return [];
  }

  const items = extractItems(payload);
  const normalized = items.map(normalizeItem).filter(Boolean) as PlaytimeSnapshotItem[];
  return normalized;
}
