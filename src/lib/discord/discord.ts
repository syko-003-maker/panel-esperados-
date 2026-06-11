import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import { activityConfigToRules, type ActivityConfig } from "@/lib/activity-config";
import { computeFlags, isTemporarilyExempt, isWl1Exempt } from "@/lib/activity-rules";
import type { LegacyActivityState } from "@/lib/activity-legacy";

type TemplateVars = Record<string, string | number | null | undefined>;
type PrismaClientLike = PrismaClient | Prisma.TransactionClient;

export type DiscordEmbedField = {
  name: string;
  value: string;
  inline?: boolean;
};

export type DiscordEmbedFooter = {
  text: string;
  iconURL?: string;
};

export type DiscordEmbedPayload = {
  title?: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: DiscordEmbedFooter;
  timestamp?: string | Date;
};

async function createOutboxJob(client: PrismaClientLike, data: Prisma.DiscordOutboxCreateInput) {
  try {
    return await client.discordOutbox.create({ data });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return null;
    }
    throw err;
  }
}

export function renderTemplate(content: string, vars: TemplateVars) {
  return content.replace(/{{\s*([a-zA-Z0-9_.-]+)\s*}}/g, (_, key) => {
    const value = vars[key];
    if (value === null || value === undefined) return "";
    return String(value);
  });
}

function normalizeEnvChannelId(value: string | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function isAutoInitDiscordChannelsEnabled() {
  const raw = process.env.AUTO_INIT_DISCORD_CHANNELS;
  if (!raw) return process.env.NODE_ENV !== "production";
  const normalized = raw.trim().toLowerCase();
  return ["1", "true", "yes", "on"].includes(normalized);
}

// Fallback recruitment channel ID if not configured
const FALLBACK_RECRUITMENT_CHANNEL_ID = "1312846001194799274";

export async function getOrCreateDiscordConfig(familyId: string) {
  const autoInitEnabled = isAutoInitDiscordChannelsEnabled();
  const defaultRecruitmentChannelId = normalizeEnvChannelId(
    process.env.DEFAULT_RECRUITMENT_CHANNEL_ID
  ) ?? FALLBACK_RECRUITMENT_CHANNEL_ID;

  const config = await prisma.discordConfig.upsert({
    where: { familyId },
    update: {},
    create: {
      familyId,
      recruitmentChannelId: autoInitEnabled ? defaultRecruitmentChannelId : null,
    },
  });

  const hasRecruitmentChannel =
    typeof config.recruitmentChannelId === "string" && config.recruitmentChannelId.trim().length > 0;

  if (autoInitEnabled && defaultRecruitmentChannelId && !hasRecruitmentChannel) {
    const updated = await prisma.discordConfig.update({
      where: { familyId },
      data: { recruitmentChannelId: defaultRecruitmentChannelId },
    });
    return updated;
  }

  return config;
}

export async function enqueueMessage(params: {
  familyId: string;
  channelId: string;
  content: string;
  entity?: string | null;
  entityId?: string | null;
  meta?: any;
}) {
  return prisma.discordOutbox.create({
    data: {
      familyId: params.familyId,
      type: "SEND_MESSAGE",
      status: "PENDING",
      channelId: params.channelId,
      content: params.content,
      entity: params.entity ?? null,
      entityId: params.entityId ?? null,
      meta: params.meta ?? null,
    },
  });
}

/**
 * Enqueue la suppression d'un message Discord déjà posté.
 * Le worker récupère le job DELETE_MESSAGE et appelle channel.messages.delete().
 * Idempotent : skipDuplicates sur (familyId, channelId, entityId, messageId).
 */
export async function enqueueDeleteMessage(params: {
  familyId: string;
  channelId: string;
  messageId: string;
  entity?: string | null;
  entityId?: string | null;
}) {
  return prisma.discordOutbox.create({
    data: {
      familyId: params.familyId,
      type: "DELETE_MESSAGE",
      status: "PENDING",
      channelId: params.channelId,
      content: "",
      entity: params.entity ?? null,
      entityId: params.entityId ?? null,
      meta: { messageId: params.messageId },
    },
  });
}

export async function enqueueEmbedMessage(params: {
  familyId: string;
  channelId: string;
  embeds: DiscordEmbedPayload[];
  entity?: string | null;
  entityId?: string | null;
}) {
  return prisma.discordOutbox.create({
    data: {
      familyId: params.familyId,
      type: "SEND_MESSAGE",
      status: "PENDING",
      channelId: params.channelId,
      content: null,
      entity: params.entity ?? null,
      entityId: params.entityId ?? null,
      meta: { embeds: params.embeds },
    },
  });
}

export async function enqueueAssignRole(params: {
  familyId: string;
  guildId: string;
  userDiscordId: string;
  roleId: string;
  entity?: string | null;
  entityId?: string | null;
  meta?: any;
}) {
  return prisma.discordOutbox.create({
    data: {
      familyId: params.familyId,
      type: "ASSIGN_ROLE",
      status: "PENDING",
      guildId: params.guildId,
      userDiscordId: params.userDiscordId,
      roleId: params.roleId,
      entity: params.entity ?? null,
      entityId: params.entityId ?? null,
      meta: params.meta ?? null,
    },
  });
}

export async function enqueueRemoveRole(params: {
  familyId: string;
  guildId: string;
  userDiscordId: string;
  roleId: string;
  entity?: string | null;
  entityId?: string | null;
  meta?: any;
}) {
  return prisma.discordOutbox.create({
    data: {
      familyId: params.familyId,
      type: "REMOVE_ROLE",
      status: "PENDING",
      guildId: params.guildId,
      userDiscordId: params.userDiscordId,
      roleId: params.roleId,
      entity: params.entity ?? null,
      entityId: params.entityId ?? null,
      meta: params.meta ?? null,
    },
  });
}

export async function getTemplate(familyId: string, key: string) {
  return prisma.discordTemplate.findUnique({
    where: { familyId_key: { familyId, key } },
  });
}

export async function enqueueMessageFromTemplate(params: {
  familyId: string;
  channelId?: string | null;
  key: string;
  vars: TemplateVars;
  entity?: string | null;
  entityId?: string | null;
  meta?: any;
}) {
  if (!params.channelId) return null;
  const template = await getTemplate(params.familyId, params.key);
  if (!template || !template.enabled) return null;

  const content = renderTemplate(template.content, params.vars);
  if (!content.trim()) return null;

  return enqueueMessage({
    familyId: params.familyId,
    channelId: params.channelId,
    content,
    entity: params.entity ?? null,
    entityId: params.entityId ?? null,
    meta: params.meta ?? { templateKey: params.key },
  });
}

export async function enqueueJustificationEvent(params: {
  familyId: string;
  discordId: string;
  memberId?: string;
  justificationId: string;
  entityId: string;
  type: "absence" | "sanction";
  client?: PrismaClientLike;
}) {
  const jobType =
    params.type === "absence" ? "ME_ABSENCE_JUSTIFIED" : "ME_SANCTION_JUSTIFIED";
  const dedupeKey = `${jobType}:${params.justificationId}`;
  const client = params.client ?? prisma;

  const meta: Record<string, string> = {
    justificationId: params.justificationId,
    discordId: params.discordId,
  };
  if (params.memberId) meta.memberId = params.memberId;
  if (params.type === "absence") meta.absenceId = params.entityId;
  if (params.type === "sanction") meta.sanctionId = params.entityId;

  return createOutboxJob(client, {
    familyId: params.familyId,
    type: jobType,
    status: "PENDING",
    dedupeKey,
    entity: `${params.type}_justification`,
    entityId: params.entityId,
    meta,
  });
}

export async function enqueueMemberAbsenceCreated(params: {
  familyId: string;
  discordId: string;
  memberId?: string;
  absenceId: string;
  client?: PrismaClientLike;
}) {
  const jobType = "ME_ABSENCE_CREATED";
  const dedupeKey = `${jobType}:${params.absenceId}`;
  const client = params.client ?? prisma;

  const meta: Record<string, string> = {
    absenceId: params.absenceId,
    discordId: params.discordId,
  };
  if (params.memberId) meta.memberId = params.memberId;

  return createOutboxJob(client, {
    familyId: params.familyId,
    type: jobType,
    status: "PENDING",
    dedupeKey,
    entity: "absence",
    entityId: params.absenceId,
    meta,
  });
}

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function toHourKey(date: Date) {
  const iso = date.toISOString();
  return `${iso.slice(0, 10)}-${iso.slice(11, 13)}`;
}

export async function enqueueBankDebtPingSingle(params: {
  familyId: string;
  memberId: string;
  deficitAmount: number;
  discordId?: string | null;
  steamId?: string | null;
  rpName?: string | null;
  lastAt?: Date | null;
  client?: PrismaClientLike;
  now?: Date;
}) {
  const jobType = "BANK_DEBT_PING_SINGLE";
  const now = params.now ?? new Date();
  const deficitAmount = Math.round(params.deficitAmount);
  const dedupeKey = `${jobType}:${params.memberId}:${deficitAmount}:${toDateKey(now)}`;
  const client = params.client ?? prisma;

  const meta: Record<string, string | number | null> = {
    memberId: params.memberId,
    deficitAmount,
    discordId: params.discordId ?? null,
    steamId: params.steamId ?? null,
    rpName: params.rpName ?? null,
    lastAt: params.lastAt ? params.lastAt.toISOString() : null,
  };

  return createOutboxJob(client, {
    familyId: params.familyId,
    type: jobType,
    status: "PENDING",
    dedupeKey,
    entity: "member",
    entityId: params.memberId,
    meta,
  });
}

export async function enqueueBankDebtPingBatch(params: {
  familyId: string;
  threshold: number;
  createdByUserId: string;
  client?: PrismaClientLike;
  now?: Date;
}) {
  const jobType = "BANK_DEBT_PING_BATCH";
  const now = params.now ?? new Date();
  const dedupeKey = `${jobType}:${params.threshold}:${toHourKey(now)}`;
  const client = params.client ?? prisma;

  const meta: Record<string, string | number> = {
    threshold: params.threshold,
    createdByUserId: params.createdByUserId,
  };

  return createOutboxJob(client, {
    familyId: params.familyId,
    type: jobType,
    status: "PENDING",
    dedupeKey,
    entity: "bank_debt_batch",
    entityId: null,
    meta,
  });
}

export async function enqueueRecruitmentDecision(params: {
  familyId: string;
  ticketId: string;
  decision: "ACCEPT" | "REJECT";
  candidateRpName: string;
  candidateDiscordId?: string | null;
  candidateSteamId?: string | null;
  totalOn20?: number | null;
  totalPoints?: number | null;
  claimedByUserId: string;
  discordThreadId?: string | null;
  /**
   * Résultat de l'auto-add WL via proxy LYG côté panel.
   *   "ok"      : ajouté avec succès → l'embed Discord affiche "✅ Auto-WL OK"
   *   "failed"  : tentative faite mais échouée → embed garde sa version classique
   *               "à ajouter manuellement" (avec raison de l'échec)
   *   "skipped" : pas de tentative (cookie absent / pas de steamId)
   *   undefined : on n'a pas l'info, l'embed reste générique
   */
  lygAutoAdd?: "ok" | "failed" | "skipped";
  lygAutoAddError?: string | null;
  client?: PrismaClientLike;
}) {
  const jobType = "RECRUITMENT_DECISION";
  const dedupeKey = `${jobType}:${params.ticketId}`;
  const client = params.client ?? prisma;

  const meta: Record<string, string | number | null> = {
    ticketId: params.ticketId,
    decision: params.decision,
    candidateRpName: params.candidateRpName,
    candidateDiscordId: params.candidateDiscordId ?? null,
    candidateSteamId: params.candidateSteamId ?? null,
    totalOn20: params.totalOn20 ?? null,
    totalPoints: params.totalPoints ?? null,
    claimedByUserId: params.claimedByUserId,
    discordThreadId: params.discordThreadId ?? null,
    lygAutoAdd: params.lygAutoAdd ?? null,
    lygAutoAddError: params.lygAutoAddError ?? null,
  };

  return createOutboxJob(client, {
    familyId: params.familyId,
    type: jobType,
    status: "PENDING",
    dedupeKey,
    entity: "recruitment_ticket",
    entityId: params.ticketId,
    meta,
  });
}

export async function enqueueSanctionNotify(params: {
  familyId: string;
  action: "CREATED" | "UPDATED" | "CLOSED";
  sanctionId: string;
  memberName: string;
  memberDiscordId?: string | null;
  type: string;
  status: string;
  reason?: string | null;
  amount?: number | null;
  startAt: Date;
  endAt?: Date | null;
  durationHours?: number | null;
  staffName: string;
  updatedAt: Date;
  client?: PrismaClientLike;
}) {
  const jobType = "SANCTION_NOTIFY";
  const updatedAtIso = params.updatedAt.toISOString();
  const dedupeKey = `${jobType}:${params.action}:${params.sanctionId}:${updatedAtIso}`;
  const client = params.client ?? prisma;

  const meta: Record<string, string | number | null> = {
    action: params.action,
    sanctionId: params.sanctionId,
    memberName: params.memberName,
    memberDiscordId: params.memberDiscordId ?? null,
    type: params.type,
    status: params.status,
    reason: params.reason ?? null,
    amount: params.amount ?? null,
    startAt: params.startAt.toISOString(),
    endAt: params.endAt ? params.endAt.toISOString() : null,
    durationHours: params.durationHours ?? null,
    staffName: params.staffName,
  };

  return createOutboxJob(client, {
    familyId: params.familyId,
    type: jobType,
    status: "PENDING",
    dedupeKey,
    entity: "sanction",
    entityId: params.sanctionId,
    meta,
  });
}

export async function enqueueComplaintDecision(params: {
  familyId: string;
  complaintId: string;
  decision: "APPROVED" | "REJECTED" | "DISMISSED" | "CLOSED";
  complaintTitle: string;
  authorDiscordId?: string | null;
  targetDiscordId?: string | null;
  decidedByUserId: string;
  /** Thread Discord de la plainte — le worker y poste le résumé puis l'archive. */
  threadId?: string | null;
  /** Nom lisible du staff qui a tranché (affiché dans le résumé). */
  closedByName?: string | null;
  /** Résumé/conclusion rédigé par le staff — transmis au plaignant. */
  summary?: string | null;
  client?: PrismaClientLike;
}) {
  const jobType = "COMPLAINT_DECISION";
  // Le dedupe inclut la décision : une plainte rouverte puis re-tranchée doit
  // pouvoir notifier à nouveau (l'ancien dedupe bloquait toute 2e décision).
  const dedupeKey = `complaint_decision:${params.complaintId}:${params.decision}`;
  const client = params.client ?? prisma;

  const meta: Record<string, string | null> = {
    complaintId: params.complaintId,
    decision: params.decision,
    complaintTitle: params.complaintTitle,
    authorDiscordId: params.authorDiscordId ?? null,
    targetDiscordId: params.targetDiscordId ?? null,
    decidedByUserId: params.decidedByUserId,
    threadId: params.threadId ?? null,
    closedByName: params.closedByName ?? null,
    summary: params.summary ?? null,
  };

  return createOutboxJob(client, {
    familyId: params.familyId,
    type: jobType,
    status: "PENDING",
    dedupeKey,
    entity: "complaint",
    entityId: params.complaintId,
    meta,
  });
}

export async function enqueueSanctionApply(params: {
  familyId: string;
  sanctionId: string;
  discordId: string;
  memberName: string;
  sanctionType: string;
  reason?: string | null;
  durationHours?: number | null;
  staffName: string;
  staffRpName?: string | null;
  appliedByUserId: string;
  actorMemberId?: string | null;
  client?: PrismaClientLike;
}) {
  const jobType = "SANCTION_APPLY";
  const dedupeKey = `${jobType}:${params.sanctionId}`;
  const client = params.client ?? prisma;

  // CRITICAL RULE: Sanction application to Discord is async via Outbox queue
  // Worker will apply role removal, mute, timeout, etc based on sanctionType
  const meta: Record<string, string | number | null> = {
    sanctionId: params.sanctionId,
    discordId: params.discordId,
    memberName: params.memberName,
    sanctionType: params.sanctionType,
    reason: params.reason ?? null,
    durationHours: params.durationHours ?? null,
    staffName: params.staffName,
    staffRpName: params.staffRpName ?? null,
    appliedByUserId: params.appliedByUserId,
    actorMemberId: params.actorMemberId ?? null,
  };

  return createOutboxJob(client, {
    familyId: params.familyId,
    type: jobType,
    status: "PENDING",
    dedupeKey,
    entity: "sanction",
    entityId: params.sanctionId,
    meta,
  });
}

export async function enqueueActivityAlert(params: {
  familyId: string;
  type: "ACTIVITY_ALERT_INACTIVE" | "ACTIVITY_ALERT_LOW" | "ACTIVITY_ALERT_RECOMMEND_KICK";
  discordId: string;
  name?: string | null;
  playtimeMinutes?: number | null;
  lastSeenAt?: string | null;
  inactiveDays?: number | null;
  suggestedAction?: string | null;
  bucket?: string;
  client?: PrismaClientLike;
}) {
  const client = params.client ?? prisma;
  const bucket = params.bucket ?? toDateKey(new Date());
  const dedupeKey = `activity:${params.familyId}:${params.discordId}:${params.type}:${bucket}`;

  const meta: Record<string, string | number | null> = {
    type: params.type,
    discordId: params.discordId,
    name: params.name ?? null,
    playtimeMinutes:
      typeof params.playtimeMinutes === "number" ? params.playtimeMinutes : null,
    lastSeenAt: params.lastSeenAt ?? null,
    inactiveDays:
      typeof params.inactiveDays === "number" ? params.inactiveDays : null,
    suggestedAction: params.suggestedAction ?? null,
  };

  return createOutboxJob(client, {
    familyId: params.familyId,
    type: params.type,
    status: "PENDING",
    dedupeKey,
    entity: "activity",
    entityId: params.discordId,
    meta,
  });
}

type ActivityDigestRow = {
  discordId: string;
  name?: string | null;
  playtimeMinutes?: number | null;
  inactiveDays?: number | null;
  lastSeenAt?: string | null;
};

type ActivityDigestMeta = {
  generatedAt: string;
  counts: {
    total: number;
    exempt: number;
    inactive14d: number;
    lowPlaytime: number;
    recommendKick: number;
  };
  recommendKick: ActivityDigestRow[];
  lowPlaytime: ActivityDigestRow[];
  maxLines: number;
};

function parseDateValue(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function buildDigestRows(params: {
  members: Array<{
    discordId?: string | null;
    rpName?: string | null;
    rank?: string | null;
    role?: string | null;
    grade?: string | null;
    familyRole?: string | null;
    group?: string | null;
    roles?: string[] | null;
  }>;
  state: LegacyActivityState;
  config: ActivityConfig;
  now: Date;
}) {
  const rules = activityConfigToRules(params.config);

  const items = params.members
    .filter((member) => member.discordId)
    .map((member) => {
      const discordId = String(member.discordId);
      const memberState = params.state.members?.[discordId];
      const exemptByRole = isWl1Exempt(member as any);
      const exemptByTime = isTemporarilyExempt(memberState?.exemptUntil ?? null);
      const isExempt = exemptByRole || exemptByTime;
      const lastSeenAt = memberState?.lastSeenAt ? String(memberState.lastSeenAt) : null;
      const lastSeenDate = parseDateValue(lastSeenAt);

      const result = computeFlags({
        now: params.now,
        lastSeenAt: lastSeenDate,
        playtimeMinutes: memberState?.playtimeMinutes ?? null,
        exempt: isExempt,
        rules,
      });

      return {
        discordId,
        name: member.rpName ?? discordId,
        isExempt,
        playtimeMinutes: memberState?.playtimeMinutes ?? null,
        lastSeenAt,
        inactiveDays: result.inactiveDays ?? null,
        flags: result.flags,
        suggestedAction: result.suggestedAction,
      };
    });

  const counts = items.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.isExempt) acc.exempt += 1;
      if (item.flags.includes("INACTIVE_14D")) acc.inactive14d += 1;
      if (item.flags.includes("LOW_PLAYTIME")) acc.lowPlaytime += 1;
      if (item.suggestedAction === "RECOMMEND_KICK") acc.recommendKick += 1;
      return acc;
    },
    { total: 0, exempt: 0, inactive14d: 0, lowPlaytime: 0, recommendKick: 0 }
  );

  const recommendKick = items
    .filter((item) => item.suggestedAction === "RECOMMEND_KICK")
    .sort((a, b) => {
      const inactiveDiff = (b.inactiveDays ?? -1) - (a.inactiveDays ?? -1);
      if (inactiveDiff !== 0) return inactiveDiff;
      return (a.playtimeMinutes ?? 0) - (b.playtimeMinutes ?? 0);
    })
    .slice(0, 10)
    .map((item) => ({
      discordId: item.discordId,
      name: item.name,
      playtimeMinutes: item.playtimeMinutes ?? null,
      inactiveDays: item.inactiveDays ?? null,
      lastSeenAt: item.lastSeenAt ?? null,
    }));

  const lowPlaytime = items
    .filter((item) => item.flags.includes("LOW_PLAYTIME"))
    .sort((a, b) => {
      const playtimeDiff = (a.playtimeMinutes ?? 0) - (b.playtimeMinutes ?? 0);
      if (playtimeDiff !== 0) return playtimeDiff;
      return (b.inactiveDays ?? -1) - (a.inactiveDays ?? -1);
    })
    .slice(0, 10)
    .map((item) => ({
      discordId: item.discordId,
      name: item.name,
      playtimeMinutes: item.playtimeMinutes ?? null,
      inactiveDays: item.inactiveDays ?? null,
      lastSeenAt: item.lastSeenAt ?? null,
    }));

  return { counts, recommendKick, lowPlaytime };
}

export async function enqueueActivityDigest(params: {
  familyId: string;
  config: ActivityConfig;
  members: Array<{
    discordId?: string | null;
    rpName?: string | null;
    rank?: string | null;
    role?: string | null;
    grade?: string | null;
    familyRole?: string | null;
    group?: string | null;
    roles?: string[] | null;
  }>;
  state: LegacyActivityState;
  now?: Date;
  bucket?: string;
  client?: PrismaClientLike;
}) {
  const client = params.client ?? prisma;
  const now = params.now ?? new Date();
  const bucket = params.bucket ?? toDateKey(now);
  const dedupeKey = `activity:${params.familyId}:digest:${bucket}`;

  const digest = buildDigestRows({
    members: params.members,
    state: params.state,
    config: params.config,
    now,
  });

  const meta: ActivityDigestMeta = {
    generatedAt: now.toISOString(),
    counts: digest.counts,
    recommendKick: digest.recommendKick,
    lowPlaytime: digest.lowPlaytime,
    maxLines: params.config.digestMaxLines,
  };

  return createOutboxJob(client, {
    familyId: params.familyId,
    type: "ACTIVITY_DIGEST",
    status: "PENDING",
    dedupeKey,
    entity: "activity",
    entityId: params.familyId,
    meta,
  });
}

export async function enqueueActivityActionNotify(params: {
  familyId: string;
  discordId: string;
  name?: string | null;
  type: "WARN_ORAL" | "WARN_LIGHT" | "KICK_DONE" | "NOTE";
  note?: string | null;
  byDiscordId?: string | null;
  client?: PrismaClientLike;
}) {
  const client = params.client ?? prisma;

  const meta: Record<string, string | null> = {
    discordId: params.discordId,
    name: params.name ?? null,
    type: params.type,
    note: params.note ?? null,
    byDiscordId: params.byDiscordId ?? null,
  };

  return createOutboxJob(client, {
    familyId: params.familyId,
    type: "ACTIVITY_ACTION_NOTIFY",
    status: "PENDING",
    entity: "activity",
    entityId: params.discordId,
    meta,
  });
}

export async function enqueueMeetingNotifyUpsert(params: {
  familyId: string;
  meetingId: string;
  channelId?: string | null;
  client?: PrismaClientLike;
}) {
  const client = params.client ?? prisma;
  const meta: Record<string, string | null> = {
    meetingId: params.meetingId,
    channelId: params.channelId ?? null,
  };

  return createOutboxJob(client, {
    familyId: params.familyId,
    type: "MEETING_NOTIFY_UPSERT",
    status: "PENDING",
    entity: "meeting",
    entityId: params.meetingId,
    meta,
  });
}

export async function enqueueMeetingNotifyRecap(params: {
  familyId: string;
  meetingId: string;
  channelId?: string | null;
  client?: PrismaClientLike;
}) {
  const client = params.client ?? prisma;
  const meta: Record<string, string | null> = {
    meetingId: params.meetingId,
    channelId: params.channelId ?? null,
  };

  return createOutboxJob(client, {
    familyId: params.familyId,
    type: "MEETING_NOTIFY_RECAP",
    status: "PENDING",
    entity: "meeting",
    entityId: params.meetingId,
    meta,
  });
}
