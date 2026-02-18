import type { ActivityFlag, SuggestedAction } from "@/lib/activity-rules";

export type LegacyActivityMemberState = {
  discordId: string;
  lastSeenAt?: string | null;
  playtimeMinutes?: number | null;
  exemptUntil?: string | null;
  exemptReason?: string | null;
  lastFlags?: ActivityFlag[];
  lastSuggestedAction?: SuggestedAction;
  lastAlerted?: {
    inactive14d?: boolean;
    lowPlaytime?: boolean;
    recommendKick?: boolean;
  };
  lastAlertAt?: Record<string, string>;
};

export type LegacyActivityAction = {
  id: string;
  at: string;
  discordId: string;
  type: "WARN_ORAL" | "WARN_LIGHT" | "KICK_DONE" | "NOTE";
  note?: string;
  byDiscordId?: string;
};

export type LegacyActivityState = {
  version: 1;
  lastSyncAt?: string;
  members?: Record<string, LegacyActivityMemberState>;
  actions?: LegacyActivityAction[];
};

const DEFAULT_STATE: LegacyActivityState = {
  version: 1,
  members: {},
  actions: [],
};

function normalizeMemberState(raw: any): LegacyActivityMemberState | null {
  const discordId = String(raw?.discordId ?? "").trim();
  if (!discordId) return null;
  const flags = Array.isArray(raw?.lastFlags)
    ? raw.lastFlags.filter((flag: any) => typeof flag === "string")
    : [];

  return {
    discordId,
    lastSeenAt: raw?.lastSeenAt ? String(raw.lastSeenAt) : null,
    playtimeMinutes:
      typeof raw?.playtimeMinutes === "number" && Number.isFinite(raw.playtimeMinutes)
        ? raw.playtimeMinutes
        : null,
    exemptUntil: raw?.exemptUntil ? String(raw.exemptUntil) : null,
    exemptReason: raw?.exemptReason ? String(raw.exemptReason) : null,
    lastFlags: flags as ActivityFlag[],
    lastSuggestedAction:
      typeof raw?.lastSuggestedAction === "string" ? raw.lastSuggestedAction : "NONE",
    lastAlerted:
      typeof raw?.lastAlerted === "object" && raw.lastAlerted
        ? {
            inactive14d: Boolean(raw.lastAlerted.inactive14d),
            lowPlaytime: Boolean(raw.lastAlerted.lowPlaytime),
            recommendKick: Boolean(raw.lastAlerted.recommendKick),
          }
        : {},
    lastAlertAt:
      typeof raw?.lastAlertAt === "object" && raw.lastAlertAt
        ? (Object.fromEntries(
            Object.entries(raw.lastAlertAt).filter((entry) => typeof entry[1] === "string")
          ) as Record<string, string>)
        : {},
  };
}

function normalizeState(raw: any): LegacyActivityState {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_STATE };

  const membersRaw = raw.members && typeof raw.members === "object" ? raw.members : {};
  const members: Record<string, LegacyActivityMemberState> = {};
  for (const [key, value] of Object.entries(membersRaw)) {
    const normalized = normalizeMemberState(value);
    if (normalized) members[key] = normalized;
  }

  const actions = Array.isArray(raw.actions)
    ? raw.actions
        .map((action: any) => {
          const discordId = String(action?.discordId ?? "").trim();
          if (!discordId) return null;
          const id = String(action?.id ?? "").trim() || `${discordId}-${Date.now()}`;
          const typeRaw = String(action?.type ?? "NOTE").toUpperCase();
          const type =
            typeRaw === "WARN_ORAL" ||
            typeRaw === "WARN_LIGHT" ||
            typeRaw === "KICK_DONE" ||
            typeRaw === "NOTE"
              ? typeRaw
              : "NOTE";
          return {
            id,
            at: action?.at ? String(action.at) : new Date().toISOString(),
            discordId,
            type: type as LegacyActivityAction["type"],
            note: action?.note ? String(action.note) : undefined,
            byDiscordId: action?.byDiscordId ? String(action.byDiscordId) : undefined,
          };
        })
        .filter(Boolean)
    : [];

  return {
    version: 1,
    lastSyncAt: raw.lastSyncAt ? String(raw.lastSyncAt) : undefined,
    members,
    actions,
  };
}

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

export async function loadFamilyActivityState(prisma: any, familyId: string): Promise<LegacyActivityState> {
  const record = await prisma.auditLog.findFirst({
    where: { familyId, entity: "ActivityState", entityId: familyId },
    orderBy: { createdAt: "desc" },
    select: { id: true, meta: true },
  });

  if (!record) return { ...DEFAULT_STATE };
  const meta = parseMeta(record.meta);
  return normalizeState(meta);
}

export async function saveFamilyActivityState(
  prisma: any,
  familyId: string,
  actorId: string,
  state: LegacyActivityState
) {
  const existing = await prisma.auditLog.findFirst({
    where: { familyId, entity: "ActivityState", entityId: familyId },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });

  if (existing) {
    await prisma.auditLog.update({
      where: { id: existing.id },
      data: {
        meta: state,
      },
    });
    return;
  }

  await prisma.auditLog.create({
    data: {
      familyId,
      actorId,
      action: "activity_state",
      entity: "ActivityState",
      entityId: familyId,
      meta: state,
    },
  });
}

export function getMemberState(
  state: LegacyActivityState,
  discordId: string
): LegacyActivityMemberState {
  if (!state.members) state.members = {};
  const existing = state.members[discordId];
  if (existing) return existing;
  const next: LegacyActivityMemberState = { discordId, lastAlerted: {}, lastAlertAt: {} };
  state.members[discordId] = next;
  return next;
}

export function setMemberState(
  state: LegacyActivityState,
  discordId: string,
  update: Partial<LegacyActivityMemberState>
) {
  const current = getMemberState(state, discordId);
  state.members![discordId] = { ...current, ...update, discordId };
}

export function appendActivityAction(
  state: LegacyActivityState,
  action: LegacyActivityAction
) {
  const actions = Array.isArray(state.actions) ? [...state.actions] : [];
  actions.unshift(action);
  state.actions = actions.slice(0, 200);
}
