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
    /** Renommé depuis `inactive14d` : le critère n'est plus « 14 jours » mais
     *  « 3 réunions à 0 + 21 jours sans opération bancaire ». */
    inactive?: boolean;
    lowPlaytime?: boolean;
    recommendKick?: boolean;
  };
  lastAlertAt?: Record<string, string>;
  /**
   * Nombre d'évaluations consécutives où le membre est ressorti inactif.
   *
   * Persisté parce qu'il ne se déduit d'aucune donnée brute : il dépend de
   * l'historique des évaluations, pas de MeetingRow ni de BankLog. Incrémenté
   * à chaque évaluation inactive, remis à 0 dès le retour d'activité.
   * `RECOMMEND_KICK` est émis à partir de 2.
   */
  inactiveCycles?: number;
};

export type LegacyActivityAction = {
  id: string;
  at: string;
  discordId: string;
  type: "WARN_ORAL" | "WARN_LIGHT" | "KICK_DONE" | "NOTE";
  note?: string;
  byDiscordId?: string;
};

/**
 * Lot d'alertes « playtime faible » retenues parce que le relevé de la réunion
 * est atypique (médiane < 10 min).
 *
 * Vit à la racine et non par membre : la rétention est une propriété de la
 * RÉUNION, pas des individus. Un seul lot à la fois — une nouvelle évaluation
 * remplace le précédent.
 *
 * Les données ne sont jamais supprimées : le lot est conservé jusqu'à ce que le
 * staff confirme (les alertes partent) ou écarte (elles sont abandonnées).
 */
export type LegacyActivityHeldLow = {
  meetingId: string;
  /** Médiane des playtimes de la réunion, à l'origine de la rétention. */
  medianMinutes: number;
  /** Médiane des 4 réunions précédentes, pour situer l'écart. */
  baselineMedian: number;
  discordIds: string[];
  heldAt: string;
};

export type LegacyActivityState = {
  version: 1;
  lastSyncAt?: string;
  members?: Record<string, LegacyActivityMemberState>;
  actions?: LegacyActivityAction[];
  /**
   * Dernière réunion évaluée. Comparé en tout premier : une refinalisation de
   * la même réunion sort sans rien écrire ni émettre. Écrit en FIN
   * d'évaluation, pour qu'une interruption ne fasse pas passer une réunion
   * pour traitée.
   */
  lastEvaluatedMeetingId?: string;
  heldLow?: LegacyActivityHeldLow;
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
            inactive: Boolean(raw.lastAlerted.inactive),
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
    // Le normaliseur reconstruit un objet à partir d'une liste explicite de
    // champs : tout ce qui n'est pas recopié ici est PERDU au chargement.
    // Sans cette ligne, le compteur de cycles serait remis à zéro à chaque
    // lecture et `RECOMMEND_KICK` ne pourrait jamais être atteint.
    //
    // Absent des états antérieurs (version 1 sans ce champ) : on retombe sur 0,
    // ce qui correspond exactement à « aucun cycle inactif observé ».
    inactiveCycles:
      typeof raw?.inactiveCycles === "number" && Number.isFinite(raw.inactiveCycles)
        ? Math.max(0, Math.floor(raw.inactiveCycles))
        : 0,
  };
}

/**
 * Lot d'alertes LOW retenu. Absent des anciens états : `undefined` signifie
 * « aucune rétention en cours », ce qui est le cas nominal.
 *
 * Un lot dont le `meetingId` ou la liste de membres serait vide n'a pas de sens
 * métier — on le laisse tomber plutôt que de conserver une coquille.
 */
function normalizeHeldLow(raw: any): LegacyActivityHeldLow | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const meetingId = String(raw.meetingId ?? "").trim();
  if (!meetingId) return undefined;
  const discordIds = Array.isArray(raw.discordIds)
    ? raw.discordIds.map((v: any) => String(v ?? "").trim()).filter(Boolean)
    : [];
  if (discordIds.length === 0) return undefined;
  const toNumber = (v: any) =>
    typeof v === "number" && Number.isFinite(v) ? v : 0;
  return {
    meetingId,
    medianMinutes: toNumber(raw.medianMinutes),
    baselineMedian: toNumber(raw.baselineMedian),
    discordIds,
    heldAt: raw.heldAt ? String(raw.heldAt) : new Date().toISOString(),
  };
}

/**
 * Exporté pour être testable hors Prisma : c'est une fonction pure, et c'est
 * elle qui décide ce qui survit à un aller-retour de persistance.
 */
export function normalizeState(raw: any): LegacyActivityState {
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
    // Même raison qu'au niveau membre : non recopié = perdu. Sans ce champ,
    // l'idempotence de la finalisation serait annulée à chaque lecture et une
    // réunion pourrait être réévaluée indéfiniment.
    lastEvaluatedMeetingId: raw.lastEvaluatedMeetingId
      ? String(raw.lastEvaluatedMeetingId)
      : undefined,
    heldLow: normalizeHeldLow(raw.heldLow),
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
