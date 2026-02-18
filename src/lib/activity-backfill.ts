import type { ActivityFlag, SuggestedAction } from "@/lib/activity-rules";
import type { LegacyActivityMemberState, LegacyActivityState } from "@/lib/activity-legacy";

const VALID_FLAGS = new Set<ActivityFlag>(["INACTIVE_14D", "LOW_PLAYTIME"]);
const VALID_SUGGESTED = new Set<SuggestedAction>([
  "NONE",
  "WARN_ORAL",
  "WARN_LIGHT",
  "RECOMMEND_KICK",
]);

function normalizeIso(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

function normalizeNumber(value: unknown) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.max(0, parsed);
}

function normalizeAlertAt(value: unknown) {
  const next: Record<string, string> = {};
  if (!value || typeof value !== "object") return next;
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const iso = normalizeIso(raw);
    if (iso) next[key] = iso;
  }
  return next;
}

function normalizeMemberState(raw: LegacyActivityMemberState): LegacyActivityMemberState {
  const lastFlags = Array.isArray(raw.lastFlags)
    ? raw.lastFlags.filter((flag) => VALID_FLAGS.has(flag))
    : [];
  const suggested = VALID_SUGGESTED.has(raw.lastSuggestedAction ?? "NONE")
    ? (raw.lastSuggestedAction as SuggestedAction)
    : "NONE";

  return {
    discordId: String(raw.discordId ?? "").trim(),
    lastSeenAt: normalizeIso(raw.lastSeenAt ?? null),
    playtimeMinutes: normalizeNumber(raw.playtimeMinutes ?? null),
    exemptUntil: normalizeIso(raw.exemptUntil ?? null),
    exemptReason: raw.exemptReason ? String(raw.exemptReason) : null,
    lastFlags,
    lastSuggestedAction: suggested,
    lastAlerted:
      typeof raw.lastAlerted === "object" && raw.lastAlerted
        ? {
            inactive14d: Boolean(raw.lastAlerted.inactive14d),
            lowPlaytime: Boolean(raw.lastAlerted.lowPlaytime),
            recommendKick: Boolean(raw.lastAlerted.recommendKick),
          }
        : {},
    lastAlertAt: normalizeAlertAt((raw as any).lastAlertAt),
  };
}

export function normalizeActivityState(
  state: LegacyActivityState,
  members: Array<{ discordId?: string | null }>
) {
  const next: LegacyActivityState = state && typeof state === "object"
    ? state
    : { version: 1, members: {}, actions: [] };

  if (!next.members || typeof next.members !== "object") {
    next.members = {};
  }

  const normalizedMembers: Record<string, LegacyActivityMemberState> = {};
  for (const [key, value] of Object.entries(next.members)) {
    if (!value || typeof value !== "object") continue;
    const normalized = normalizeMemberState(value as LegacyActivityMemberState);
    const discordId = normalized.discordId || String(key).trim();
    if (!discordId) continue;
    normalized.discordId = discordId;
    normalizedMembers[discordId] = normalized;
  }

  for (const member of members) {
    const discordId = String(member.discordId ?? "").trim();
    if (!discordId) continue;
    if (!normalizedMembers[discordId]) {
      normalizedMembers[discordId] = {
        discordId,
        lastFlags: [],
        lastSuggestedAction: "NONE",
        lastAlerted: {},
        lastAlertAt: {},
      };
    }
  }

  next.members = normalizedMembers;
  if (!Array.isArray(next.actions)) {
    next.actions = [];
  }

  if (next.version !== 1) {
    next.version = 1;
  }

  return next;
}
