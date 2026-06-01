import type { PrismaClient } from "@prisma/client";
import type { Client as DiscordClient, TextChannel } from "discord.js";
import { ChannelType, EmbedBuilder, PermissionFlagsBits } from "discord.js";
import { safeFetchMember, validateDiscordId } from "./utils/validateDiscordId.js";

const SANCTION_NOTIFICATION_CHANNEL_ID = process.env.SANCTION_NOTIFICATION_CHANNEL_ID ?? "1409028569203740792";
const OUTBOX_JOB_TIMEOUT_MS = 20_000;

let isOutboxPollRunning = false;

const SANCTION_LABELS: Record<string, string> = {
  AVERT_ORAL_PLAYTIME: "Averto playtime",
  AVERT_ORAL_REUNION: "Averto réunion",
  AVERT_LEGER: "Averto léger",
  AVERT_LOURD: "Averto lourd",
  AVERT_EM: "Averto EM",
  DEMOTE: "Démote",
  RESERVISTE: "Réserviste",
  BLACKLIST: "Blacklist",
};

type OutboxJob = {
  id: string;
  type: string;
  status: string;
  meta: Record<string, any>;
  entityId: string;
  entity: string;
  familyId: string;
  channelId?: string | null;
  content?: string | null;
  guildId?: string | null;
  userDiscordId?: string | null;
  roleId?: string | null;
};

type EmbedFieldPayload = {
  name?: unknown;
  value?: unknown;
  inline?: unknown;
};

type EmbedFooterPayload = {
  text?: unknown;
  iconURL?: unknown;
};

type EmbedPayload = {
  title?: unknown;
  color?: unknown;
  description?: unknown;
  timestamp?: unknown;
  footer?: unknown;
  fields?: unknown;
};

const SANCTION_ROLE_IDS = {
  AVERT_ORAL_PLAYTIME: "1343272798231199836",
  AVERT_ORAL_REUNION: "1343272736331665500",
  AVERT_LEGER: "1312845999340781640",
  AVERT_LOURD: "1312845999340781641",
  AVERT_EM: "1328483783426572428",
  DEMOTE_ROLE_ID: "1340837563753304075",
  RESERVISTE_ROLE_ID: "1312845999366209682",
  BLACKLIST_ROLE_ID: "1338901141873758288",
  LOS_ESPERADOS_ROLE_ID: "1312845999340781646",
  ANCIEN_ESPERADOS_ROLE_ID: "1312845999215214616",
  CITOYEN_LYG_ROLE_ID: "1337795596739940372",
} as const;

type SanctionRolePlan = {
  rolesToKeep: string[];
  rolesToRemove: string[];
  rolesToAdd: string[];
};

function buildSanctionRolePlan(
  sanctionType: string,
  currentRoleIds: string[],
  guildId: string
): SanctionRolePlan | null {
  const keepByType: Record<string, string[]> = {
    DEMOTE: [SANCTION_ROLE_IDS.CITOYEN_LYG_ROLE_ID],
    RESERVISTE: [SANCTION_ROLE_IDS.CITOYEN_LYG_ROLE_ID, SANCTION_ROLE_IDS.LOS_ESPERADOS_ROLE_ID],
    BLACKLIST: [],
  };

  const addByType: Record<string, string[]> = {
    DEMOTE: [SANCTION_ROLE_IDS.DEMOTE_ROLE_ID, SANCTION_ROLE_IDS.ANCIEN_ESPERADOS_ROLE_ID],
    RESERVISTE: [SANCTION_ROLE_IDS.RESERVISTE_ROLE_ID],
    BLACKLIST: [SANCTION_ROLE_IDS.BLACKLIST_ROLE_ID],
  };

  const rolesToKeep = keepByType[sanctionType];
  const targetAdd = addByType[sanctionType];
  if (!rolesToKeep || !targetAdd) return null;

  const current = new Set(currentRoleIds);
  const protectedSet = new Set([...rolesToKeep, ...targetAdd]);
  const rolesToRemove = currentRoleIds.filter(
    (roleId) => roleId !== guildId && !protectedSet.has(roleId)
  );
  const rolesToAdd = targetAdd.filter((roleId) => !current.has(roleId));

  return {
    rolesToKeep,
    rolesToRemove,
    rolesToAdd,
  };
}

function getGuildId(job: OutboxJob) {
  return String(job.guildId ?? process.env.GUILD_ID ?? "").trim();
}

function getSanctionLabel(type: string): string {
  return SANCTION_LABELS[type] ?? type.replace(/_/g, " ");
}

function formatDurationLabel(expiresAt: Date | null, durationHours: number | null): string | null {
  if (typeof durationHours === "number" && Number.isFinite(durationHours) && durationHours > 0) {
    if (durationHours % 24 === 0) {
      const days = durationHours / 24;
      return `${days} jour${days > 1 ? "s" : ""}`;
    }
    return `${durationHours} heure${durationHours > 1 ? "s" : ""}`;
  }

  if (!expiresAt) return null;
  const diffMs = expiresAt.getTime() - Date.now();
  if (diffMs <= 0) return `Jusqu'au ${expiresAt.toLocaleDateString("fr-FR")}`;

  const hours = Math.max(1, Math.ceil(diffMs / (60 * 60 * 1000)));
  if (hours % 24 === 0) {
    const days = hours / 24;
    return `${days} jour${days > 1 ? "s" : ""}`;
  }

  return `${hours} heure${hours > 1 ? "s" : ""}`;
}

function formatStaffDisplayLabel(value: string | null | undefined): string {
  const name = String(value ?? "").trim();
  if (!name || name.toLowerCase() === "inconnu") return "Inconnu";
  return name.replace(/^@+/, "");
}

async function sendSanctionAppliedNotification(
  discordClient: DiscordClient,
  payload: {
    discordId: string;
    guildId: string;
    sanctionType: string;
    reason: string | null;
    durationLabel: string | null;
    staffDisplayName: string;
    memberRpName: string;
    sanctionId: string;
    startAt?: Date | null;
  }
) {
  let channel = null;
  try {
    channel = await discordClient.channels.fetch(SANCTION_NOTIFICATION_CHANNEL_ID);
  } catch (error) {
    log("SANCTION_NOTIFICATION_CHANNEL_INVALID", {
      guildId: payload.guildId,
      channelId: SANCTION_NOTIFICATION_CHANNEL_ID,
      sanctionId: payload.sanctionId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
  if (!channel || !channel.isTextBased()) {
    log("SANCTION_NOTIFICATION_CHANNEL_INVALID", {
      guildId: payload.guildId,
      channelId: SANCTION_NOTIFICATION_CHANNEL_ID,
      sanctionId: payload.sanctionId,
    });
    throw new Error(`SANCTION_NOTIFICATION_CHANNEL_INVALID:${SANCTION_NOTIFICATION_CHANNEL_ID}`);
  }

  const typeLabel = getSanctionLabel(payload.sanctionType);
  const description = [
    `1️⃣ **Pseudo du joueur sanctionné :**`,
    `${payload.memberRpName} (<@${payload.discordId}>)`,
    ``,
    `2️⃣ **Raison de la sanction :**`,
    `${payload.reason?.trim() || "Aucune"}`,
    ``,
    `3️⃣ **Type de sanction appliquée :**`,
    `${typeLabel}`,
    ``,
    `4️⃣ **Durée de la sanction :**`,
    `${payload.durationLabel || "Indéterminée"}`,
  ].join("\n");
  const embed = new EmbedBuilder()
    .setTitle("⚖️ DECLARATION DE SANCTION ⚖️")
    .setColor(0xf59e0b)
    .setDescription(description)
    .setTimestamp(payload.startAt ?? new Date());

  await (channel as TextChannel).send({ embeds: [embed] });
}

async function updateSanctionApplyState(
  prisma: PrismaClient,
  sanctionId: string,
  applied: boolean,
  errorMessage: string | null
) {
  await prisma.sanction.update({
    where: { id: sanctionId },
    data: {
      discordStatus: applied ? "APPLIED" : "FAILED",
      discordAppliedAt: applied ? new Date() : null,
      discordError: applied ? null : errorMessage ?? "UNKNOWN_ERROR",
    } as any,
  });
}

/**
 * Marque la sanction comme totalement traitée (discordStatus + discordAppliedAt)
 * et renvoie true SI ET SEULEMENT SI c'est la PREMIÈRE fois.
 *
 * Bug fix critique : auparavant le test de dedup utilisait `discordStatus != APPLIED`,
 * ce qui était cassé par le endpoint /api/staff/sanctions/[id]/force-applied qui
 * positionne discordStatus="APPLIED" SANS positionner discordAppliedAt. Conséquence :
 * si force-applied était appelé pendant que le worker traitait la sanction (race
 * de quelques secondes), `markSanctionAppliedOnce` renvoyait false → notification
 * Discord SKIPPÉE → annonce de sanction jamais postée.
 *
 * Désormais on dedup sur `discordAppliedAt = null` (vraiment "pas encore notifié")
 * plutôt que sur le status, ce qui survit aux interventions force-applied.
 */
async function markSanctionAppliedOnce(
  prisma: PrismaClient,
  sanctionId: string
): Promise<boolean> {
  const result = await prisma.sanction.updateMany({
    where: {
      id: sanctionId,
      discordAppliedAt: null,
    },
    data: {
      discordStatus: "APPLIED",
      discordAppliedAt: new Date(),
      discordError: null,
    } as any,
  });

  return result.count > 0;
}

async function updateSanctionClearState(
  prisma: PrismaClient,
  sanctionId: string,
  applied: boolean,
  errorMessage: string | null,
  setClearedAt: boolean
) {
  await prisma.sanction.update({
    where: { id: sanctionId },
    data: {
      clearedStatus: applied ? "APPLIED" : "FAILED",
      clearedError: applied ? null : errorMessage ?? "UNKNOWN_ERROR",
      ...(applied && setClearedAt ? { clearedAt: new Date() } : {}),
      ...(applied ? { status: "CLOSED", closedAt: new Date() } : {}),
    } as any,
  });
}

async function fetchGuildMember(job: OutboxJob, discordClient: DiscordClient, context: string) {
  const guildId = getGuildId(job);
  if (!guildId) throw new Error("GUILD_ID not configured");

  const targetDiscordId = String(
    job.userDiscordId ?? job.meta?.discordId ?? job.meta?.memberDiscordId ?? ""
  ).trim();
  const validation = validateDiscordId(targetDiscordId);
  if (!validation.valid) {
    throw new Error(`Invalid discordId: ${validation.error}`);
  }

  const guild = await discordClient.guilds.fetch(guildId);
  const member = await safeFetchMember(guild, validation.discordId, context);
  return { guild, member, discordId: validation.discordId };
}

async function ensureManageRoles(member: any) {
  const botMember = member.guild.members.me ?? (await member.guild.members.fetchMe());
  if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
    throw new Error("DISCORD_MANAGE_ROLES_PERMISSION_MISSING");
  }
}

async function persistMemberDiscordMirror(
  prisma: PrismaClient,
  member: any,
  discordId: string
): Promise<void> {
  const now = new Date();
  const refreshedMember = await member.fetch(true);
  const roles = [...refreshedMember.roles.cache.keys()];
  const nickname = refreshedMember.nickname ?? null;
  const username = refreshedMember.user?.globalName ?? refreshedMember.user?.username ?? null;

  const linkedMembers = await prisma.member.findMany({
    where: { discordId },
    select: { id: true },
  });

  if (linkedMembers.length === 0) {
    return;
  }

  await prisma.member.updateMany({
    where: { discordId },
    data: {
      discordInGuild: true,
      discordRoleIds: roles,
      discordRolesUpdatedAt: now,
      discordLastError: null,
      discordDisplayName: nickname,
      discordUsername: username,
    },
  });

  await Promise.all(
    linkedMembers.map((linkedMember) =>
      prisma.memberDiscordSnapshot.upsert({
        where: { memberId: linkedMember.id },
        create: {
          memberId: linkedMember.id,
          discordId,
          isInGuild: true,
          rolesJson: { roles },
          nickname,
          username,
          lastCheckedAt: now,
          lastSuccessAt: now,
          lastError: null,
          source: "outbox",
        },
        update: {
          discordId,
          isInGuild: true,
          rolesJson: { roles },
          nickname,
          username,
          lastCheckedAt: now,
          lastSuccessAt: now,
          lastError: null,
          source: "outbox",
        },
      })
    )
  );
}

async function handleRoleMutation(
  job: OutboxJob,
  prisma: PrismaClient,
  discordClient: DiscordClient,
  action: "add" | "remove"
): Promise<void> {
  const roleId = String(job.roleId ?? "").trim();
  if (!roleId) throw new Error("Missing roleId");

  const { member } = await fetchGuildMember(job, discordClient, `role_${action}`);
  if (!member) {
    if (action === "remove" && job.entity === "Sanction" && job.entityId) {
      await updateSanctionClearState(
        prisma,
        job.entityId,
        true,
        null,
        Boolean(job.meta?.setClearedAt)
      );
    }
    return;
  }

  await ensureManageRoles(member);

  const role = member.guild.roles.cache.get(roleId) ?? (await member.guild.roles.fetch(roleId));
  if (!role) throw new Error(`Role ${roleId} not found in guild`);
  if (!role.editable) throw new Error(`Role ${roleId} is not editable by the bot`);

  if (action === "add") {
    if (!member.roles.cache.has(roleId)) {
      await member.roles.add(roleId);
    }

    // ── Anti "double rang" : promotion → retirer les AUTRES rôles de grade ──
    // On lit les rôles LIVE du membre (source de vérité) et on retire tout
    // autre rôle de grade listé dans meta.stripGradeRoleIds (sauf la cible).
    // Bulletproof même si le mirror DB était périmé au moment du up.
    const stripIds = Array.isArray((job.meta as any)?.stripGradeRoleIds)
      ? ((job.meta as any).stripGradeRoleIds as string[])
      : null;
    if (stripIds && stripIds.length > 0) {
      for (const otherId of stripIds) {
        if (!otherId || otherId === roleId) continue;
        if (!member.roles.cache.has(otherId)) continue;
        const otherRole =
          member.guild.roles.cache.get(otherId) ??
          (await member.guild.roles.fetch(otherId).catch(() => null));
        if (otherRole && otherRole.editable) {
          await member.roles.remove(otherId, `Promotion : retrait ancien grade`).catch((err: unknown) => {
            log("promotion_strip_role_failed", {
              memberDiscordId: member.id,
              roleId: otherId,
              error: err instanceof Error ? err.message : String(err),
            });
          });
        }
      }
    }
  } else if (member.roles.cache.has(roleId)) {
    await member.roles.remove(roleId);
  }

  await persistMemberDiscordMirror(prisma, member, member.id);

  if (job.entity === "Sanction" && job.entityId && action === "remove") {
    await updateSanctionClearState(
      prisma,
      job.entityId,
      true,
      null,
      Boolean(job.meta?.setClearedAt)
    );
  }
}

function log(event: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ event, ...data, timestamp: new Date().toISOString() }));
}

function getOutboxJobTimeoutError(job: OutboxJob) {
  return new Error(`OUTBOX_JOB_TIMEOUT:${job.type}:${job.id}:${OUTBOX_JOB_TIMEOUT_MS}ms`);
}

async function withJobTimeout<T>(job: OutboxJob, promise: Promise<T>): Promise<T> {
  return await Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(getOutboxJobTimeoutError(job)), OUTBOX_JOB_TIMEOUT_MS);
    }),
  ]) as T;
}

function normalizeEmbedFooter(footer: unknown) {
  if (!footer) return null;
  if (typeof footer === "string") {
    const text = footer.trim().slice(0, 2048);
    return text ? { text } : null;
  }
  if (typeof footer !== "object") return null;

  const { text, iconURL } = footer as EmbedFooterPayload;
  const normalizedText = String(text ?? "").trim().slice(0, 2048);
  if (!normalizedText) return null;

  const normalizedIconUrl = typeof iconURL === "string" ? iconURL.trim() : "";
  return normalizedIconUrl
    ? { text: normalizedText, iconURL: normalizedIconUrl }
    : { text: normalizedText };
}

function normalizeEmbedFields(fields: unknown) {
  if (!Array.isArray(fields)) return [];

  return fields
    .slice(0, 25)
    .map((field) => {
      const { name, value, inline } = (field ?? {}) as EmbedFieldPayload;
      const normalizedName = String(name ?? "\u200b").trim().slice(0, 256) || "\u200b";
      const normalizedValue = String(value ?? "\u200b").trim().slice(0, 1024) || "\u200b";
      return {
        name: normalizedName,
        value: normalizedValue,
        inline: Boolean(inline),
      };
    });
}

function buildEmbedFromPayload(payload: EmbedPayload) {
  const builder = new EmbedBuilder();

  if (payload.title) builder.setTitle(String(payload.title).slice(0, 256));
  if (typeof payload.color === "number") builder.setColor(payload.color);
  if (payload.description) builder.setDescription(String(payload.description).slice(0, 4096));

  if (payload.timestamp) {
    const timestamp = new Date(String(payload.timestamp));
    if (!Number.isNaN(timestamp.getTime())) {
      builder.setTimestamp(timestamp);
    }
  }

  const footer = normalizeEmbedFooter(payload.footer);
  if (footer) builder.setFooter(footer);

  const fields = normalizeEmbedFields(payload.fields);
  if (fields.length > 0) {
    builder.addFields(fields);
  }

  return builder;
}

export async function processOutboxQueue(
  prisma: PrismaClient,
  discordClient: DiscordClient
): Promise<void> {
  if (isOutboxPollRunning) {
    log("outbox_poll_skipped", { reason: "already_running" });
    return;
  }

  isOutboxPollRunning = true;

  try {
    // Recover jobs stuck in RUNNING after a worker crash or timeout.
    // OUTBOX_JOB_TIMEOUT_MS = 20s; 2 minutes is a safe stale threshold.
    const staleThreshold = new Date(Date.now() - 2 * 60 * 1000);
    const recovered = await prisma.discordOutbox.updateMany({
      where: { status: "RUNNING", updatedAt: { lt: staleThreshold } },
      data: { status: "PENDING", nextAttemptAt: new Date() },
    });
    if (recovered.count > 0) {
      log("outbox_stale_recovered", { count: recovered.count });
    }

    const jobs = await prisma.discordOutbox.findMany({
      where: {
        status: "PENDING",
        nextAttemptAt: { lte: new Date() },
      },
      orderBy: { createdAt: "asc" },
      take: 50,
    });

    if (jobs.length === 0) return;

    log("outbox_poll", { pending: jobs.length });

    for (const job of jobs) {
      try {
        const claim = await prisma.discordOutbox.updateMany({
          where: { id: job.id, status: "PENDING" },
          data: { status: "RUNNING" },
        });

        if (claim.count === 0) {
          continue;
        }

        await withJobTimeout(job as any, processJob(job as any, prisma, discordClient));
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        log("outbox_job_error", {
          jobId: job.id,
          type: job.type,
          error: errorMessage,
        });

        await markSanctionPipelineFailure(prisma, job as any, errorMessage);

        await prisma.discordOutbox.update({
          where: { id: job.id },
          data: {
            status: "FAILED",
            attempt: job.attempt + 1,
            lastError: errorMessage,
          },
        });
      }
    }
  } catch (error) {
    log("outbox_poll_error", { error: error instanceof Error ? error.message : String(error) });
  } finally {
    isOutboxPollRunning = false;
  }
}

async function processJob(
  job: OutboxJob,
  prisma: PrismaClient,
  discordClient: DiscordClient
): Promise<void> {
  const logsChannelId = process.env.TICKETS_LOGS_CHANNEL_ID;
  if (!logsChannelId) {
    throw new Error("TICKETS_LOGS_CHANNEL_ID not configured");
  }

  const logsChannel = await discordClient.channels.fetch(logsChannelId);
  if (!logsChannel || !logsChannel.isTextBased()) {
    throw new Error("Logs channel not found or not text-based");
  }

  switch (job.type) {
    case "RECRUITMENT_DECISION":
      await handleRecruitmentDecision(job, logsChannel as TextChannel, discordClient, prisma);
      break;

    case "SANCTION_APPLY":
      await handleSanctionApply(job, prisma, discordClient);
      break;

    case "ASSIGN_ROLE":
      await handleRoleMutation(job, prisma, discordClient, "add");
      break;

    case "REMOVE_ROLE":
      await handleRoleMutation(job, prisma, discordClient, "remove");
      break;

    case "COMPLAINT_DECISION":
      await handleComplaintDecision(job, logsChannel as TextChannel);
      break;

    case "SEND_MESSAGE":
      await handleGenericMessage(job, prisma, discordClient, logsChannel as TextChannel);
      break;

    case "DELETE_MESSAGE":
      await handleDeleteMessage(job, discordClient);
      break;

    case "SANCTION_NOTIFY":
      await handleSanctionNotify(job, logsChannel as TextChannel);
      break;

    case "BANK_DEBT_PING_SINGLE":
      await handleBankDebtPingSingle(job, prisma, discordClient);
      break;

    case "BANK_DEBT_PING_BATCH":
      await handleBankDebtPingBatch(job, prisma, discordClient);
      break;

    default:
      throw new Error(`Unsupported outbox type: ${job.type}`);
  }

  await prisma.discordOutbox.update({
    where: { id: job.id },
    data: { status: "SENT", sentAt: new Date() },
  });

  log("outbox_job_completed", { jobId: job.id, type: job.type });
}

function resolveSanctionId(job: OutboxJob): string | null {
  const metaSanctionId = typeof job.meta?.sanctionId === "string" ? job.meta.sanctionId : null;
  if (metaSanctionId) return metaSanctionId;
  if (
    (job.entity === "Sanction" || job.entity === "sanction") &&
    typeof job.entityId === "string" &&
    job.entityId
  ) {
    return job.entityId;
  }
  return null;
}

async function markSanctionPipelineFailure(
  prisma: PrismaClient,
  job: OutboxJob,
  errorMessage: string
): Promise<void> {
  if (job.type === "REMOVE_ROLE" && job.entity === "Sanction" && job.entityId) {
    await updateSanctionClearState(
      prisma,
      job.entityId,
      false,
      errorMessage,
      Boolean(job.meta?.setClearedAt)
    );
    return;
  }

  if (job.type !== "SANCTION_APPLY") return;

  const sanctionId = resolveSanctionId(job);
  if (!sanctionId) return;

  log("sanction_apply_failed", {
    sanctionId,
    jobId: job.id,
    discordId: String(job.userDiscordId ?? job.meta?.discordId ?? job.meta?.memberDiscordId ?? ""),
    sanctionType: String(job.meta?.sanctionType ?? job.meta?.type ?? "UNKNOWN"),
    error: errorMessage,
  });

  await updateSanctionApplyState(prisma, sanctionId, false, errorMessage);
}

const WHITELIST_CHANNEL_ID = "1312846001194799274";

async function handleRecruitmentDecision(
  job: OutboxJob,
  channel: TextChannel,
  discordClient: DiscordClient,
  prisma: PrismaClient
): Promise<void> {
  const { decision, candidateRpName, totalOn20, totalPoints, discordThreadId } = job.meta;

  // 1. Log dans le salon de logs staff
  const embed = new EmbedBuilder()
    .setTitle(`📋 Décision Recrutement`)
    .setColor(decision === "ACCEPT" ? 0x10b981 : 0xef4444)
    .addFields(
      { name: "Candidat", value: candidateRpName || "Unknown", inline: true },
      { name: "Décision", value: decision === "ACCEPT" ? "✅ ACCEPTÉ" : "❌ REFUSÉ", inline: true },
      { name: "Score", value: `${totalOn20 ?? "-"}/20 (${totalPoints ?? "-"} pts)`, inline: true }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });

  // 2. Embed whitelist (uniquement sur ACCEPT)
  //
  // Comportement adapté selon lygAutoAdd (passé par la panel) :
  //   "ok"      → embed compact "✅ WL ajoutée automatiquement" (traçabilité)
  //   "failed"  → embed classique "📋 Demande de Whitelist" + raison de l'échec
  //              (le staff doit l'ajouter à la main sur families.lyg.fr)
  //   "skipped" → embed classique (cookie pas configuré → comportement legacy)
  //   undefined → idem skipped (compat : ancienne route ou outbox ré-essayée)
  if (decision === "ACCEPT") {
    try {
      let recruiterLabel = "Non renseigné";
      const claimedByUserId = job.meta.claimedByUserId as string | undefined;
      if (claimedByUserId) {
        const user = await prisma.user.findUnique({
          where: { id: claimedByUserId },
          select: {
            name: true,
            accounts: {
              where: { provider: "discord" },
              select: { providerAccountId: true },
              take: 1,
            },
          },
        });
        const discordAccountId = user?.accounts?.[0]?.providerAccountId;
        if (discordAccountId) {
          const member = await prisma.member.findFirst({
            where: { discordId: discordAccountId },
            select: { rpName: true, discordDisplayName: true, discordUsername: true },
          });
          recruiterLabel =
            member?.rpName?.trim() ||
            member?.discordDisplayName?.trim() ||
            member?.discordUsername?.trim() ||
            user?.name?.trim() ||
            "Non renseigné";
        } else {
          recruiterLabel = user?.name?.trim() || "Non renseigné";
        }
      }

      const lygAutoAdd = (job.meta.lygAutoAdd ?? null) as
        | "ok"
        | "failed"
        | "skipped"
        | null;
      const lygAutoAddError = (job.meta.lygAutoAddError ?? null) as string | null;
      const candidateName = String(candidateRpName || "Non renseigné").trim() || "Non renseigné";
      const steamLabel = String(job.meta.candidateSteamId || "Non renseigné").trim() || "Non renseigné";

      const wlChannel = await discordClient.channels.fetch(WHITELIST_CHANNEL_ID);
      if (wlChannel?.isTextBased()) {
        let wlEmbed: EmbedBuilder;
        if (lygAutoAdd === "ok") {
          // Auto-add réussi → embed compact de confirmation. Sert juste de
          // log dans le channel WL pour que le chef voie passer l'info.
          wlEmbed = new EmbedBuilder()
            .setTitle("✅ Whitelist ajoutée automatiquement")
            .setColor(0x10b981)
            .setDescription(
              `Le candidat **${candidateName}** a été ajouté à la famille via le panel — aucune action manuelle requise.`,
            )
            .addFields(
              { name: "🎮 SteamID", value: steamLabel, inline: true },
              { name: "👨‍💼 Recruté par", value: recruiterLabel, inline: true },
            )
            .setTimestamp();
        } else {
          // Auto-add échoué / sauté → embed legacy "demande à faire manuellement".
          // On précise la raison pour que le chef sache si c'est juste à
          // refaire ou s'il faut investiguer (cookie expiré par ex).
          const failureReason =
            lygAutoAdd === "failed"
              ? `⚠️ Échec auto-WL : ${lygAutoAddError ?? "erreur inconnue"}`
              : "ℹ️ Auto-WL non tentée (cookie LYG non configuré)";

          wlEmbed = new EmbedBuilder()
            .setTitle("📋 Demande de Whitelist")
            .setColor(0xf59e0b)
            .setDescription(failureReason)
            .addFields(
              { name: "👤 Nom", value: candidateName, inline: true },
              { name: "🎮 SteamID", value: steamLabel, inline: true },
              { name: "👨‍💼 Recruté par", value: recruiterLabel, inline: true },
            )
            .setTimestamp();
        }

        await (wlChannel as TextChannel).send({ embeds: [wlEmbed] });
        log("RECRUITMENT_WHITELIST_EMBED_SENT", {
          candidateRpName,
          recruiterLabel,
          lygAutoAdd: lygAutoAdd ?? "unknown",
        });
      } else {
        log("RECRUITMENT_WHITELIST_CHANNEL_NOT_FOUND", { channelId: WHITELIST_CHANNEL_ID });
      }
    } catch (wlErr) {
      log("RECRUITMENT_WHITELIST_EMBED_FAILED", {
        error: wlErr instanceof Error ? wlErr.message : String(wlErr),
      });
    }
  }

  // 3. Fermeture du ticket/thread Discord du recrutement
  if (!discordThreadId) {
    log("RECRUITMENT_DECISION_NO_THREAD_ID", { ticketId: job.meta.ticketId });
    return;
  }

  try {
    const ticketChannel = await discordClient.channels.fetch(discordThreadId);
    if (!ticketChannel) {
      log("RECRUITMENT_DECISION_CHANNEL_NOT_FOUND", { discordThreadId });
      return;
    }

    const closingMessage = decision === "ACCEPT"
      ? "✅ **Recrutement accepté**\n\nLe candidat a été accepté dans la famille.\nLes rôles ont été attribués automatiquement.\n\nLe ticket est maintenant clôturé."
      : "❌ **Recrutement refusé**\n\nLa candidature n'a pas été retenue.\nMerci pour l'intérêt porté à la famille.\n\nLe ticket est maintenant clôturé.";

    if (ticketChannel.isThread()) {
      // Thread: send message, lock, archive
      await ticketChannel.send(closingMessage).catch(() => null);
      if (!ticketChannel.locked) await ticketChannel.setLocked(true);
      if (!ticketChannel.archived) await ticketChannel.setArchived(true);
      log("RECRUITMENT_THREAD_ARCHIVED", { discordThreadId, type: "thread" });
    } else if (ticketChannel.type === ChannelType.GuildText) {
      // Text channel: send message then delete
      await (ticketChannel as TextChannel).send(closingMessage).catch(() => null);
      await (ticketChannel as TextChannel).delete(`Recrutement clôturé (${decision})`).catch((err) => {
        log("RECRUITMENT_TEXT_CHANNEL_DELETE_FAILED", { discordThreadId, error: err instanceof Error ? err.message : String(err) });
      });
      log("RECRUITMENT_TEXT_CHANNEL_DELETED", { discordThreadId, type: "text" });
    } else {
      log("RECRUITMENT_DECISION_UNSUPPORTED_CHANNEL_TYPE", { discordThreadId, channelType: ticketChannel.type });
    }
  } catch (err) {
    // Non bloquant : le log a déjà été envoyé, le statut est en base
    log("RECRUITMENT_DECISION_CLOSE_FAILED", {
      discordThreadId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function handleComplaintDecision(job: OutboxJob, channel: TextChannel): Promise<void> {
  const { decision, complaintTitle } = job.meta;

  const labels = {
    APPROVED: { label: "✅ APPROUVÉE", color: 0x10b981 },
    REJECTED: { label: "❌ REJETÉE", color: 0xef4444 },
    DISMISSED: { label: "🚫 CLASSÉE SANS SUITE", color: 0x6b7280 },
  };

  const decisionInfo = labels[decision as keyof typeof labels] || {
    label: decision,
    color: 0x6b7280,
  };

  const embed = new EmbedBuilder()
    .setTitle(`📝 Décision Plainte`)
    .setColor(decisionInfo.color)
    .addFields(
      { name: "Titre", value: complaintTitle || "Sans titre", inline: false },
      { name: "Décision", value: decisionInfo.label, inline: true }
    )
    .setTimestamp();

  await channel.send({ embeds: [embed] });
}

async function handleSanctionApply(
  job: OutboxJob,
  prisma: PrismaClient,
  discordClient: DiscordClient
): Promise<void> {
  const sanctionId = resolveSanctionId(job);
  if (!sanctionId) {
    throw new Error("Missing sanctionId for SANCTION_APPLY");
  }

  const sanction = await prisma.sanction.findUnique({
    where: { id: sanctionId },
    select: {
      id: true,
      familyId: true,
      createdById: true,
      type: true,
      reason: true,
      expiresAt: true,
      startAt: true,
      discordStatus: true,
      discordAppliedAt: true,
      discordId: true,
      member: { select: { discordId: true, rpName: true, steamId: true } },
      createdBy: { select: { name: true } },
    },
  });

  if (!sanction) {
    throw new Error(`Sanction ${sanctionId} not found`);
  }

  // On considère qu'une sanction est "déjà totalement traitée" SI l'horodatage
  // discordAppliedAt est posé (= notification déjà envoyée). discordStatus seul
  // ne suffit pas car force-applied le positionne sans poser discordAppliedAt
  // — dans ce cas on veut quand même tenter d'appliquer les rôles + notifier.
  if (sanction.discordAppliedAt) {
    log("sanction_apply_skip_already_applied", { sanctionId: sanction.id });
    return;
  }

  const sanctionType = String(job.meta?.sanctionType ?? job.meta?.type ?? sanction.type);
  const rawDiscordId = String(
    job.userDiscordId ?? job.meta?.discordId ?? job.meta?.memberDiscordId ?? sanction.discordId ?? ""
  ).trim();
  log("sanction_apply_start", {
    sanctionId: sanction.id,
    jobId: job.id,
    discordId: rawDiscordId,
    sanctionType,
  });
  const { guild, member, discordId } = await fetchGuildMember(job, discordClient, "sanction_apply");
  // Bug fix : le worker throwait dès que `member` était null (membre parti
  // de la guild → Discord error 10007). L'embed d'annonce de sanction ne
  // partait alors jamais. Désormais, si le membre n'est pas dans la guild,
  // on envoie quand même l'embed (l'annonce publique reste pertinente) et
  // on marque APPLIED — le rôle Discord est de toute façon impossible à
  // appliquer sur un user qui a quitté.
  const memberName =
    sanction.member?.rpName?.trim() ||
    (typeof job.meta?.memberName === "string" ? job.meta.memberName.trim() : "") ||
    (member?.displayName as string | undefined) ||
    "Unknown";
  const reason = typeof job.meta?.reason === "string" ? job.meta.reason : sanction.reason;
  const durationHours =
    typeof job.meta?.durationHours === "number" && Number.isFinite(job.meta.durationHours)
      ? job.meta.durationHours
      : null;
  const durationLabel = formatDurationLabel(sanction.expiresAt ?? null, durationHours);
  const actorMemberId =
    typeof job.meta?.actorMemberId === "string" && job.meta.actorMemberId.trim()
      ? job.meta.actorMemberId.trim()
      : null;
  const appliedByUserId =
    typeof job.meta?.appliedByUserId === "string" && job.meta.appliedByUserId.trim()
      ? job.meta.appliedByUserId.trim()
      : sanction.createdById;
  let staffMemberRpName: string | null = null;
  if (actorMemberId) {
    const actorMember = await prisma.member.findFirst({
      where: {
        id: actorMemberId,
        familyId: sanction.familyId,
      },
      select: { rpName: true },
    });
    if (actorMember?.rpName && actorMember.rpName.trim()) {
      staffMemberRpName = actorMember.rpName.trim();
    }
  }
  if (!staffMemberRpName && appliedByUserId) {
    const staffUser = await prisma.staffUser.findFirst({
      where: {
        userId: appliedByUserId,
        familyId: sanction.familyId,
      },
      select: { discordId: true },
    });

    if (staffUser?.discordId) {
      const staffMember = await prisma.member.findFirst({
        where: {
          familyId: sanction.familyId,
          discordId: staffUser.discordId,
        },
        select: { rpName: true },
      });
      if (staffMember?.rpName && staffMember.rpName.trim()) {
        staffMemberRpName = staffMember.rpName.trim();
      }
    }
  }

  // Extra fallback: recover actorMemberId from audit logs when job metadata is incomplete.
  if (!staffMemberRpName) {
    const auditActor = await prisma.auditLog.findFirst({
      where: {
        entity: "Sanction",
        entityId: sanction.id,
        actorMemberId: { not: null },
      },
      orderBy: { createdAt: "desc" },
      select: { actorMemberId: true },
    });

    const auditActorMemberId = auditActor?.actorMemberId ?? null;
    if (auditActorMemberId) {
      const auditActorMember = await prisma.member.findFirst({
        where: {
          id: auditActorMemberId,
          familyId: sanction.familyId,
        },
        select: { rpName: true },
      });
      if (auditActorMember?.rpName && auditActorMember.rpName.trim()) {
        staffMemberRpName = auditActorMember.rpName.trim();
      }
    }
  }

  const staffRpName =
    typeof job.meta?.staffRpName === "string" && job.meta.staffRpName.trim()
      ? job.meta.staffRpName.trim()
      : null;
  const staffName =
    (typeof job.meta?.staffName === "string" && job.meta.staffName.trim()) ||
    sanction.createdBy?.name ||
    "Inconnu";
  const staffDisplayName = staffMemberRpName ?? staffRpName ?? staffName ?? "Inconnu";

  if (!member) {
    // Membre parti de la guild → on ne peut pas appliquer le rôle Discord,
    // mais on envoie quand même l'embed d'annonce (objectif principal :
    // informer la communauté que la sanction est tombée). markSanction-
    // AppliedOnce dédup l'embed sur retry et stoppe la chaîne.
    const newlyApplied = await markSanctionAppliedOnce(prisma, sanction.id);
    if (!newlyApplied) {
      log("sanction_apply_skip_duplicate_notification", {
        sanctionId: sanction.id,
        jobId: job.id,
        memberDiscordId: discordId,
        reason: "member_not_in_guild_already_notified",
      });
      return;
    }

    try {
      await sendSanctionAppliedNotification(discordClient, {
        discordId,
        guildId: getGuildId(job) ?? "",
        sanctionType,
        reason,
        durationLabel,
        staffDisplayName,
        memberRpName: memberName,
        sanctionId: sanction.id,
        startAt: sanction.startAt ?? null,
      });
      log("sanction_apply_notification_sent", {
        sanctionId: sanction.id,
        memberDiscordId: discordId,
        channelId: SANCTION_NOTIFICATION_CHANNEL_ID,
        memberInGuild: false,
      });
    } catch (notificationError) {
      log("sanction_apply_notification_error", {
        sanctionId: sanction.id,
        memberDiscordId: discordId,
        channelId: SANCTION_NOTIFICATION_CHANNEL_ID,
        error:
          notificationError instanceof Error ? notificationError.message : String(notificationError),
      });
    }

    // Note informative dans discordError pour l'UI panel : la sanction
    // est marquée APPLIED (annonce faite) mais le rôle n'a pas été posé.
    await prisma.sanction
      .update({
        where: { id: sanction.id },
        data: {
          discordError: `Membre absent de la guild Discord (10007) — embed envoyé, rôle non appliqué.`,
        } as any,
      })
      .catch(() => {
        /* non-bloquant */
      });

    log("sanction_apply_member_not_in_guild_announced", {
      sanctionId: sanction.id,
      jobId: job.id,
      memberDiscordId: discordId,
      sanctionType,
    });

    // ── Auto-remove WL famille même si le membre a quitté la guild Discord.
    // Le retrait WL doit avoir lieu côté LYG (jeu) même sans Discord — c'est
    // une action distincte. Sans ça, un démote/blacklist sur un membre parti
    // de la guild laisse sa WL active in-game. Bug constaté sur Emir Esperados.
    if (sanctionType === "DEMOTE" || sanctionType === "BLACKLIST") {
      const memberSteamId = sanction.member?.steamId?.trim() ?? "";
      if (/^\d{17}$/.test(memberSteamId)) {
        try {
          const base = (process.env.INGEST_BASE_URL ?? "").replace(/\/+$/, "");
          const secret = process.env.INGEST_SECRET ?? "";
          if (base && secret) {
            const res = await fetch(`${base}/api/internal/lyg/family-remove`, {
              method: "POST",
              headers: { "Content-Type": "application/json", "x-ingest-secret": secret },
              body: JSON.stringify({
                steamId: memberSteamId,
                source: sanctionType === "DEMOTE" ? "sanction_demote_no_guild" : "sanction_blacklist_no_guild",
                sanctionId: sanction.id,
              }),
              signal: AbortSignal.timeout(20_000),
            });
            const json = (await res.json().catch(() => ({}))) as any;
            if (res.ok && json?.ok && json?.applied) {
              log("sanction_apply_lyg_remove_ok", {
                sanctionId: sanction.id,
                sanctionType,
                steamId: memberSteamId,
                tookMs: json.tookMs,
                memberInGuild: false,
              });
            } else if (res.ok && json?.ok && !json?.applied) {
              log("sanction_apply_lyg_remove_skipped", {
                sanctionId: sanction.id,
                steamId: memberSteamId,
                reason: json?.reason ?? "unknown",
                memberInGuild: false,
              });
            } else {
              log("sanction_apply_lyg_remove_failed", {
                sanctionId: sanction.id,
                steamId: memberSteamId,
                status: res.status,
                error: json?.error ?? "unknown",
                expired: json?.expired ?? false,
                memberInGuild: false,
              });
            }
          }
        } catch (err) {
          log("sanction_apply_lyg_remove_exception", {
            sanctionId: sanction.id,
            steamId: memberSteamId,
            error: err instanceof Error ? err.message : String(err),
            memberInGuild: false,
          });
        }
      }
    }

    return;
  }

  if (
    sanctionType === "AVERT_ORAL_PLAYTIME" ||
    sanctionType === "AVERT_ORAL_REUNION" ||
    sanctionType === "AVERT_LEGER" ||
    sanctionType === "AVERT_LOURD" ||
    sanctionType === "AVERT_EM"
  ) {
    await ensureManageRoles(member);
    const roleId = SANCTION_ROLE_IDS[sanctionType];
    const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId));
    if (!role) {
      throw new Error(`DISCORD_ROLE_NOT_FOUND:${roleId}`);
    }
    if (!role.editable) {
      throw new Error(`DISCORD_ROLE_HIERARCHY_BLOCK_ADD:${role.name}`);
    }
    if (!member.roles.cache.has(roleId)) {
      await member.roles.add(roleId, `Sanction ${sanctionType} (${sanction.id})`);
    }

    await persistMemberDiscordMirror(prisma, member, discordId);

    const newlyApplied = await markSanctionAppliedOnce(prisma, sanction.id);
    if (!newlyApplied) {
      log("sanction_apply_skip_duplicate_notification", {
        sanctionId: sanction.id,
        jobId: job.id,
        memberDiscordId: discordId,
      });
      return;
    }

    try {
      await sendSanctionAppliedNotification(discordClient, {
        discordId,
        guildId: guild.id,
        sanctionType,
        reason,
        durationLabel,
        staffDisplayName,
        memberRpName: memberName,
        sanctionId: sanction.id,
        startAt: sanction.startAt ?? null,
      });
      log("sanction_apply_notification_sent", {
        sanctionId: sanction.id,
        memberDiscordId: discordId,
        channelId: SANCTION_NOTIFICATION_CHANNEL_ID,
      });
    } catch (notificationError) {
      log("sanction_apply_notification_error", {
        sanctionId: sanction.id,
        memberDiscordId: discordId,
        channelId: SANCTION_NOTIFICATION_CHANNEL_ID,
        error:
          notificationError instanceof Error ? notificationError.message : String(notificationError),
      });
    }
    log("sanction_apply_role_add", {
      sanctionId: sanction.id,
      sanctionType,
      memberDiscordId: discordId,
      roleId,
    });
    log("sanction_apply_success", {
      sanctionId: sanction.id,
      jobId: job.id,
      discordId,
      sanctionType,
      result: "APPLIED",
    });
    return;
  }

  const rolePlan = buildSanctionRolePlan(sanctionType, Array.from(member.roles.cache.keys()), guild.id);

  if (!rolePlan) {
    throw new Error(`SANCTION_ACTION_NOT_IMPLEMENTED:${sanctionType}`);
  }

  await ensureManageRoles(member);

  // Filtre les rôles "managed" Discord (Server Booster, rôles de bot,
  // intégrations type Twitch/YouTube) — le bot ne peut techniquement PAS
  // les retirer, et ils sont indépendants du grade famille. Sans ça, un
  // membre Nitro Booster ne peut pas être démote (bug constaté sur Loic).
  const skippedManagedRoles: string[] = [];
  rolePlan.rolesToRemove = rolePlan.rolesToRemove.filter((roleId) => {
    const role = member.roles.cache.get(roleId);
    if (role && role.managed) {
      skippedManagedRoles.push(role.name);
      return false;
    }
    return true;
  });
  if (skippedManagedRoles.length > 0) {
    log("sanction_apply_skip_managed_roles", {
      sanctionId: sanction.id,
      memberDiscordId: discordId,
      skipped: skippedManagedRoles,
    });
  }

  // Reste-t-il un rôle non-editable (= au-dessus du bot dans la hiérarchie) ?
  // Ce cas est différent des rôles managed : c'est une erreur de config
  // Discord (le bot doit être placé au-dessus des rôles à retirer).
  const blockingRemovalRole = rolePlan.rolesToRemove.find((roleId) => {
    const role = member.roles.cache.get(roleId);
    return role ? !role.editable : false;
  });
  if (blockingRemovalRole) {
    const role = member.roles.cache.get(blockingRemovalRole);
    throw new Error(`DISCORD_ROLE_HIERARCHY_BLOCK_REMOVE:${role?.name ?? blockingRemovalRole}`);
  }

  for (const roleId of rolePlan.rolesToAdd) {
    const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId));
    if (!role) {
      throw new Error(`DISCORD_ROLE_NOT_FOUND:${roleId}`);
    }
    if (!role.editable) {
      throw new Error(`DISCORD_ROLE_HIERARCHY_BLOCK_ADD:${role.name}`);
    }
  }

  for (const roleId of rolePlan.rolesToRemove) {
    const role = member.roles.cache.get(roleId);
    if (!role) continue;
    try {
      await member.roles.remove(roleId, `Sanction ${sanctionType} (${sanction.id})`);
    } catch (err) {
      throw new Error(
        `DISCORD_ROLE_REMOVE_FAILED:${role.name}:${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  for (const roleId of rolePlan.rolesToAdd) {
    const role = guild.roles.cache.get(roleId) ?? (await guild.roles.fetch(roleId));
    if (!role) continue;
    try {
      await member.roles.add(roleId, `Sanction ${sanctionType} (${sanction.id})`);
    } catch (err) {
      throw new Error(
        `DISCORD_ROLE_ADD_FAILED:${role.name}:${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  log("sanction_apply_roles", {
    sanctionId: sanction.id,
    sanctionType,
    memberDiscordId: discordId,
    rolesToKeep: rolePlan.rolesToKeep,
    rolesToRemove: rolePlan.rolesToRemove,
    rolesToAdd: rolePlan.rolesToAdd,
  });

  // ── Auto-remove WL famille LYG via proxy panel ────────────────────────
  // Pour DEMOTE et BLACKLIST, on retire aussi le membre de la famille
  // LYG en plus des rôles Discord. Le panel héberge le cookie chiffré,
  // donc on fait un appel interne sécurisé (x-ingest-secret) côté panel.
  // Non-bloquant : si le proxy échoue, le rôle Discord reste appliqué.
  if (sanctionType === "DEMOTE" || sanctionType === "BLACKLIST") {
    const memberSteamId = sanction.member?.steamId?.trim() ?? "";
    if (/^\d{17}$/.test(memberSteamId)) {
      try {
        const base = (process.env.INGEST_BASE_URL ?? "").replace(/\/+$/, "");
        const secret = process.env.INGEST_SECRET ?? "";
        if (base && secret) {
          const res = await fetch(`${base}/api/internal/lyg/family-remove`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-ingest-secret": secret },
            body: JSON.stringify({
              steamId: memberSteamId,
              source: sanctionType === "DEMOTE" ? "sanction_demote" : "sanction_blacklist",
              sanctionId: sanction.id,
            }),
            signal: AbortSignal.timeout(20_000),
          });
          const json = (await res.json().catch(() => ({}))) as any;
          if (res.ok && json?.ok && json?.applied) {
            log("sanction_apply_lyg_remove_ok", {
              sanctionId: sanction.id,
              sanctionType,
              steamId: memberSteamId,
              tookMs: json.tookMs,
            });
          } else if (res.ok && json?.ok && !json?.applied) {
            log("sanction_apply_lyg_remove_skipped", {
              sanctionId: sanction.id,
              steamId: memberSteamId,
              reason: json?.reason ?? "unknown",
            });
          } else {
            log("sanction_apply_lyg_remove_failed", {
              sanctionId: sanction.id,
              steamId: memberSteamId,
              status: res.status,
              error: json?.error ?? "unknown",
              expired: json?.expired ?? false,
            });
          }
        } else {
          log("sanction_apply_lyg_remove_no_ingest_config", {
            sanctionId: sanction.id,
            steamId: memberSteamId,
          });
        }
      } catch (err) {
        log("sanction_apply_lyg_remove_exception", {
          sanctionId: sanction.id,
          steamId: memberSteamId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    } else {
      log("sanction_apply_lyg_remove_no_steamid", {
        sanctionId: sanction.id,
        sanctionType,
      });
    }
  }

  await persistMemberDiscordMirror(prisma, member, discordId);

  const newlyApplied = await markSanctionAppliedOnce(prisma, sanction.id);
  if (!newlyApplied) {
    log("sanction_apply_skip_duplicate_notification", {
      sanctionId: sanction.id,
      jobId: job.id,
      memberDiscordId: discordId,
    });
    return;
  }

  try {
    await sendSanctionAppliedNotification(discordClient, {
      discordId,
      guildId: guild.id,
      sanctionType,
      reason,
      durationLabel,
      staffDisplayName,
      memberRpName: memberName,
      sanctionId: sanction.id,
      startAt: sanction.startAt ?? null,
    });
    log("sanction_apply_notification_sent", {
      sanctionId: sanction.id,
      memberDiscordId: discordId,
      channelId: SANCTION_NOTIFICATION_CHANNEL_ID,
    });
  } catch (notificationError) {
    log("sanction_apply_notification_error", {
      sanctionId: sanction.id,
      memberDiscordId: discordId,
      channelId: SANCTION_NOTIFICATION_CHANNEL_ID,
      error:
        notificationError instanceof Error ? notificationError.message : String(notificationError),
    });
  }
  log("sanction_apply_success", {
    sanctionId: sanction.id,
    jobId: job.id,
    discordId,
    sanctionType,
    result: "APPLIED",
    memberName,
  });
}

async function handleSanctionNotify(job: OutboxJob, channel: TextChannel): Promise<void> {
  const { action, type, memberName, reason, startAt } = job.meta;

  // Use the actual sanction startAt time so the embed timestamp reflects when the
  // sanction was created, not when this background job was processed.
  const sanctionDate = startAt ? new Date(String(startAt)) : new Date();
  const timestamp = !Number.isNaN(sanctionDate.getTime()) ? sanctionDate : new Date();

  const embed = new EmbedBuilder()
    .setTitle(`⚖️ Sanction ${action}`)
    .setColor(0xf59e0b)
    .addFields(
      { name: "Membre", value: memberName || "Unknown", inline: true },
      { name: "Type", value: type, inline: true },
      { name: "Raison", value: reason || "-", inline: false }
    )
    .setTimestamp(timestamp);

  await channel.send({ embeds: [embed] });
}

async function handleBankDebtPingSingle(
  job: OutboxJob,
  prisma: PrismaClient,
  discordClient: DiscordClient
): Promise<void> {
  const config = await (prisma as any).discordConfig.findFirst({
    where: { familyId: job.familyId },
    select: { bankAlertsChannelId: true },
  });
  const channelId = String(config?.bankAlertsChannelId ?? "").trim();
  if (!channelId) throw new Error("MISSING_BANK_ALERTS_CHANNEL");

  const channel = await discordClient.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) throw new Error("BANK_ALERTS_CHANNEL_INVALID");

  const { memberId, discordId, rpName, deficitAmount } = job.meta;

  // Vérification au moment de l'envoi : membre actif, dans le serveur, et éligible
  const EXCLUDED_ROLE_IDS = ["1340837563753304075", "1338901141873758288", "1312845999366209682"];
  if (memberId) {
    const member = await (prisma as any).member.findUnique({
      where: { id: String(memberId) },
      select: { isActive: true, discordInGuild: true, discordRoleIds: true },
    });
    if (!member?.isActive) {
      log("bank_debt_ping_single_skipped_inactive", { jobId: job.id, memberId, rpName });
      return;
    }
    if (member.discordInGuild === false) {
      log("bank_debt_ping_single_skipped_not_in_guild", { jobId: job.id, memberId, rpName });
      return;
    }
    const hasExcludedRole = Array.isArray(member.discordRoleIds) &&
      member.discordRoleIds.some((id: string) => EXCLUDED_ROLE_IDS.includes(id));
    if (hasExcludedRole) {
      log("bank_debt_ping_single_skipped_ineligible", { jobId: job.id, memberId, rpName });
      return;
    }
  }

  const mention = discordId ? `<@${String(discordId)}>` : (String(rpName ?? "Membre inconnu"));
  const amount = Math.abs(Number(deficitAmount ?? 0));

  const embed = new EmbedBuilder()
    .setTitle("📌 Rappel Banque")
    .setColor(0xf59e0b)
    .setDescription(
      `${mention}, tu es actuellement en déficit de **${amount.toLocaleString("fr-FR")}$**.\n\n` +
      `Merci de régulariser ta situation au plus vite.\n` +
      `En cas de non-remboursement, des sanctions pourront être appliquées.`
    )
    .setTimestamp();

  // Mention dans content (hors embed) pour déclencher la vraie notification Discord
  const pingContent = discordId ? `<@${String(discordId)}>` : undefined;
  await (channel as TextChannel).send({
    content: pingContent,
    embeds: [embed],
    allowedMentions: { users: discordId ? [String(discordId)] : [] },
  });
  log("bank_debt_ping_single_sent", { jobId: job.id, discordId, rpName, deficitAmount: amount });
}

async function handleBankDebtPingBatch(
  job: OutboxJob,
  prisma: PrismaClient,
  discordClient: DiscordClient
): Promise<void> {
  const config = await (prisma as any).discordConfig.findFirst({
    where: { familyId: job.familyId },
    select: { bankAlertsChannelId: true, bankDebtPingThreshold: true },
  });
  const channelId = String(config?.bankAlertsChannelId ?? "").trim();
  if (!channelId) throw new Error("MISSING_BANK_ALERTS_CHANNEL");

  const channel = await discordClient.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) throw new Error("BANK_ALERTS_CHANNEL_INVALID");

  const threshold = Number(job.meta?.threshold ?? config?.bankDebtPingThreshold ?? 0);
  const effectiveThreshold = threshold > 0 ? threshold : 1;

  // job.familyId contient le slug ("esperados") — BankLog stocke l'UUID → résolution nécessaire
  const familyRecord = await (prisma as any).family.findFirst({
    where: { slug: job.familyId },
    select: { id: true },
  });
  const familyDbId: string = familyRecord?.id ?? job.familyId;

  type DebtRowRaw = {
    memberId: string | null;
    steamId: string;
    discordId: string | null;
    rpName: string | null;
    net: bigint;
  };

  // Exclure démote (1340837563753304075), blacklist (1338901141873758288), réserviste (1312845999366209682)
  // + exclure les membres hors du serveur Discord
  const rows = await (prisma as any).$queryRaw<DebtRowRaw[]>`
    SELECT
      m."id"        AS "memberId",
      b."steamId"   AS "steamId",
      m."discordId" AS "discordId",
      m."rpName"    AS "rpName",
      SUM(CASE WHEN b."type" = 2 THEN b."money" ELSE -b."money" END) AS "net"
    FROM "BankLog" b
    LEFT JOIN "Member" m
      ON m."steamId" = b."steamId"
      AND m."familyId" = b."familyId"
    WHERE b."familyId" = ${familyDbId}
      AND m."isActive" = true
      AND m."discordInGuild" = true
      AND (
        m."discordRoleIds" IS NULL
        OR NOT (m."discordRoleIds" && ARRAY['1340837563753304075','1338901141873758288','1312845999366209682']::text[])
      )
    GROUP BY m."id", m."discordId", m."rpName", b."steamId"
    HAVING SUM(CASE WHEN b."type" = 2 THEN b."money" ELSE -b."money" END) <= ${-effectiveThreshold}
    ORDER BY SUM(CASE WHEN b."type" = 2 THEN b."money" ELSE -b."money" END) ASC
  `;

  if (rows.length === 0) {
    log("bank_debt_ping_batch_no_debtors", { jobId: job.id, threshold: effectiveThreshold });
    return;
  }

  // Liste d'affichage dans l'embed (noms lisibles)
  const memberList = rows
    .map((row: DebtRowRaw) =>
      row.discordId ? `<@${row.discordId}>` : `${row.rpName ?? row.steamId} (non lié)`
    )
    .join("\n");

  // Mentions réelles dans content pour déclencher les notifications Discord
  const mentionIds = rows
    .map((row: DebtRowRaw) => row.discordId)
    .filter((id: string | null): id is string => Boolean(id));
  const pingContent = mentionIds.length > 0
    ? mentionIds.map((id: string) => `<@${id}>`).join(" ")
    : undefined;

  const description = [
    "👥 Membres concernés :",
    memberList,
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    "",
    "Merci de régulariser votre situation rapidement.",
    "Sans remboursement dans un délai raisonnable, cela pourra entraîner une sanction.",
    "",
    "Si votre situation a déjà été mise à jour récemment, merci d'ignorer ce message.",
  ].join("\n");

  const embed = new EmbedBuilder()
    .setTitle("📌 Rappel Banque — Déficits en cours")
    .setColor(0xef4444)
    .setDescription(description)
    .setTimestamp();

  await (channel as TextChannel).send({
    content: pingContent,
    embeds: [embed],
    allowedMentions: { users: mentionIds },
  });
  log("bank_debt_ping_batch_sent", { jobId: job.id, threshold: effectiveThreshold, count: rows.length });
}

async function handleGenericMessage(
  job: OutboxJob,
  prisma: PrismaClient,
  discordClient: DiscordClient,
  fallbackChannel: TextChannel
): Promise<void> {
  const targetChannelId = String(job.channelId ?? "").trim();
  const content = String(job.content ?? job.meta?.message ?? "").trim();
  const rawEmbeds = Array.isArray(job.meta?.embeds) ? (job.meta.embeds as any[]) : null;

  if (!content && !rawEmbeds) return;

  let channel: TextChannel = fallbackChannel;
  if (targetChannelId) {
    const fetched = await discordClient.channels.fetch(targetChannelId);
    if (fetched && fetched.isTextBased()) {
      channel = fetched as TextChannel;
    }
  }

  let sentMessage: { id: string } | null = null;
  if (rawEmbeds) {
    const builtEmbeds = rawEmbeds.map((embed) => buildEmbedFromPayload((embed ?? {}) as EmbedPayload));
    sentMessage = await channel.send({ content: content || undefined, embeds: builtEmbeds });
  } else {
    sentMessage = await channel.send(content);
  }

  // Sauvegarder le messageId Discord sur l'Absence si c'est un message d'absence
  if (sentMessage && job.entity === "Absence" && job.entityId) {
    try {
      await prisma.absence.updateMany({
        where: { id: job.entityId, discordMessageId: null },
        data: { discordMessageId: sentMessage.id },
      });
    } catch {
      // Non bloquant
    }
  }
}

async function handleDeleteMessage(
  job: OutboxJob,
  discordClient: DiscordClient,
): Promise<void> {
  const targetChannelId = String(job.channelId ?? "").trim();
  const messageId = String(job.meta?.messageId ?? "").trim();
  if (!targetChannelId || !messageId) return;

  try {
    const channel = await discordClient.channels.fetch(targetChannelId);
    if (!channel || !channel.isTextBased()) return;
    const msg = await (channel as TextChannel).messages.fetch(messageId);
    await msg.delete();
  } catch {
    // Message déjà supprimé ou introuvable — pas bloquant
  }
}
