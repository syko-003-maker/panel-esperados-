import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChef } from "@/lib/guards";
import { getSession } from "@/auth";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { resolveFamilyId } from "@/lib/family";
import { recordPanelMetric } from "@/lib/metrics";
import { requireMeetingsEnabled } from "@/lib/feature-guard";
import { computeMeetingSummary } from "@/lib/meetings";
import type { SanctionType } from "@prisma/client";
import {
  enqueueSanctionApply,
  enqueueAssignRole,
  enqueueRemoveRole,
  type DiscordEmbedPayload,
} from "@/lib/discord/discord";
import { evaluateSanctionRules } from "@/lib/sanction-rules";
import { getSanctionExpirationDate } from "@/lib/sanctions";
import { GRADE_LABEL_BY_ROLE_ID } from "@/lib/grade-colors";
import { getRankGradeLevel } from "@/lib/discord-rank";

const RANK_ROLE_ID_BY_LABEL = new Map(
  Object.entries(GRADE_LABEL_BY_ROLE_ID).map(([roleId, label]) => [label.toLowerCase(), roleId])
);

function normalizeMeetingTargetGrade(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  for (const label of Object.values(GRADE_LABEL_BY_ROLE_ID)) {
    if (label.toLowerCase() === normalized) return label;
  }
  return null;
}

const SANCTION_TYPES: SanctionType[] = [
  "AVERT_ORAL_PLAYTIME",
  "AVERT_ORAL_REUNION",
  "AVERT_LEGER",
  "AVERT_LOURD",
  "DEMOTE",
  "RESERVISTE",
  "BLACKLIST",
];

const MAX_EMBED_FIELD_LENGTH = 1000;

const MEETING_DECISION_LABELS: Record<string, string | null> = {
  MAINTAIN: "Maintiens à sa place",
  KEEP: "Maintiens à sa place",
  NONE: "Maintiens à sa place",
  DEMOTE: "Démote",
  UP: "UP",
  DOUBLE_UP: "Double UP",
  WARN_LIGHT: "Avertissement léger",
  WARN_HEAVY: "Avertissement lourd",
  WARN: "Avertissement",
  WARNING: "Avertissement",
  PLAYTIME_WARN: "Averto playtime",
  AVERT_ORAL_PLAYTIME: "Averto playtime",
  AVERT_ORAL_REUNION: "Avertissement oral",
  AVERT_LEGER: "Avertissement léger",
  AVERT_LOURD: "Avertissement lourd",
  REMINDER: "Rappel",
  RESERVE: "Réserviste",
  RESERVIST: "Réserviste",
  RESERVISTE: "Réserviste",
  BLACKLIST: "Blacklist",
  EXCLUSION: "Exclusion",
  EXCLUDE: "Exclusion",
  WEEK_VALID_1: "Semaine Validé 1",
  WEEK_VALID_2: "Semaine Validé 2",
  WEEK_VALID_3: "Semaine Validé 3",
  WEEK_INVALID: "Semaine Non Validé",
  OTHER: null,
  AUTRE: null,
  WARNING_ORAL: null,
};

function formatMeetingDate(value: Date | string | null | undefined) {
  if (!value) return "Date inconnue";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "Date inconnue";
  return date.toLocaleDateString("fr-FR");
}

function formatMeetingMinutes(minutes: number | null | undefined) {
  const safeMinutes = typeof minutes === "number" && Number.isFinite(minutes)
    ? Math.max(0, Math.round(minutes))
    : 0;
  const hours = Math.floor(safeMinutes / 60);
  const remainingMinutes = safeMinutes % 60;
  if (hours === 0) return `${remainingMinutes}min`;
  if (remainingMinutes === 0) return `${hours}h`;
  return `${hours}h ${remainingMinutes}min`;
}

function truncateEmbedLines(lines: string[], maxChars = MAX_EMBED_FIELD_LENGTH) {
  if (lines.length === 0) return "-";

  const keptLines: string[] = [];
  let length = 0;

  for (const line of lines) {
    const nextLength = length + line.length + (keptLines.length > 0 ? 1 : 0);
    if (nextLength > maxChars) {
      const remaining = lines.length - keptLines.length;
      if (remaining > 0) {
        keptLines.push(`... (+${remaining} autre${remaining > 1 ? "s" : ""})`);
      }
      break;
    }

    keptLines.push(line);
    length = nextLength;
  }

  return keptLines.join("\n");
}

function resolveMeetingDecisionCode(row: { sanctionType?: string | null; decisionType?: string | null }) {
  const sanctionCode = String(row.sanctionType ?? "").trim().toUpperCase();
  if (sanctionCode) return sanctionCode;

  const decisionCode = String(row.decisionType ?? "NONE").trim().toUpperCase();
  if (decisionCode === "NONE") return "MAINTAIN";
  if (decisionCode === "EXCLUDE") return "EXCLUSION";
  // WARNING (enum) → avertissement léger formel ; WARNING_ORAL → avertissement oral réunion
  if (decisionCode === "WARNING") return "AVERT_LEGER";
  if (decisionCode === "WARNING_ORAL") return "AVERT_ORAL_REUNION";
  return decisionCode;
}

function translateMeetingDecision(code: string | null | undefined) {
  const normalized = String(code ?? "").trim().toUpperCase();
  if (!normalized) return null;
  return MEETING_DECISION_LABELS[normalized] ?? null;
}

function buildMeetingFinalizeEmbed(params: {
  meetingDate: Date | string | null | undefined;
  meetingLabel: string;
  rows: Array<{
    rpNameSnapshot?: string | null;
    playtimeMinutes?: number | null;
    sanctionType?: string | null;
    decisionType?: string | null;
  }>;
  notes?: string | null;
  statsSummary: Array<{ label: string; value: number }>;
}): DiscordEmbedPayload {
  const decisionCounts = new Map<string, number>();
  const concernedCases: string[] = [];

  for (const row of params.rows) {
    const decisionCode = resolveMeetingDecisionCode(row);
    const translatedDecision = translateMeetingDecision(decisionCode);
    if (!translatedDecision) continue;

    const memberName = String(row.rpNameSnapshot ?? "Membre inconnu").trim() || "Membre inconnu";
    const playtime = formatMeetingMinutes(row.playtimeMinutes);

    decisionCounts.set(translatedDecision, (decisionCounts.get(translatedDecision) ?? 0) + 1);
    concernedCases.push(`${memberName} — ${playtime} — ${translatedDecision}`);
  }

  const sanctionsLines = Array.from(decisionCounts.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "fr"))
    .map(([label, count]) => `${label}: ${count}`);

  const statsLines = params.statsSummary.map(({ label, value }) => `${label}: ${value}`);
  const finalNotes = String(params.notes ?? "").trim() || "Aucune note finale.";

  return {
    title: `📋 Réunion Famille — ${formatMeetingDate(params.meetingDate)}`,
    description: params.meetingLabel,
    color: 0x1d4ed8,
    fields: [
      {
        name: "📊 Statistiques",
        value: truncateEmbedLines(statsLines),
        inline: false,
      },
      {
        name: "⚖️ Sanctions prises",
        value: truncateEmbedLines(sanctionsLines.length > 0 ? sanctionsLines : ["Aucune"]),
        inline: false,
      },
      {
        name: "📌 Cas concernés",
        value: truncateEmbedLines(concernedCases.length > 0 ? concernedCases : ["Aucun cas concerné"]),
        inline: false,
      },
      {
        name: "📝 Notes finales",
        value: finalNotes.slice(0, MAX_EMBED_FIELD_LENGTH),
        inline: false,
      },
    ],
    footer: {
      text: `Réunion Famille • Membres: ${params.rows.length}`,
    },
    timestamp: new Date(),
  };
}

/**
 * POST /api/staff/meetings/[id]/finalize
 * Finalize meeting and apply all decisions
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check feature flag
  const featureCheck = await requireMeetingsEnabled("finalize");
  if (!featureCheck.allowed) {
    console.log("[finalize] feature flag blocked:", featureCheck.response.status);
    return featureCheck.response;
  }

  // Only chef can finalize
  const guard = await requireChef();
  if (guard instanceof Response) {
    console.log("[finalize] requireChef blocked:", guard.status);
    return guard;
  }
  console.log("[finalize] guard passed");

  const session = await getSession();
  const userId = session?.user?.id ?? (session as any)?.userId ?? null;
  const userDiscordId = (session as any)?.discordId ?? (session?.user as any)?.discordId ?? null;

  const { id: meetingId } = await params;

  const meetingMarker = `[meeting:${meetingId}]`;
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);

  // Get meeting with rows
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      decisions: true,
      rows: true,
    },
  });

  if (!meeting) {
    return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
  }

  if (meeting.status === "FINAL") {
    return NextResponse.json({
      ok: true,
      alreadyFinal: true,
      message: "Meeting was already finalized",
      finalizedAt: meeting.finalizedAt,
    });
  }

  if (meeting.status !== "CLOSED") {
    return NextResponse.json(
      { ok: false, error: "MEETING_MUST_BE_CLOSED_BEFORE_FINALIZE" },
      { status: 409 }
    );
  }

  const results = {
    promoted: 0,
    applied: 0,
    demoted: 0,
    blacklisted: 0,
    reservists: 0,
    warnings: 0,
    kept: 0,
    errors: [] as Array<{ memberDiscordId: string; error: string }>,
  };

  const promotionDecisionByDiscordId = new Map(
    meeting.decisions
      .filter(
        (decision) =>
          typeof decision.memberDiscordId === "string" &&
          decision.memberDiscordId.trim() !== ""
      )
      .map((decision) => [decision.memberDiscordId, decision])
  );
  const missingPromotionTargets = meeting.rows
    .filter((row) => {
      const businessDecision = resolveMeetingDecisionCode(row);
      return businessDecision === "UP" || businessDecision === "DOUBLE_UP";
    })
    .map((row) => {
      const memberDiscordId = String(row.discordIdSnapshot ?? "").trim();
      const decision = memberDiscordId ? promotionDecisionByDiscordId.get(memberDiscordId) : null;
      const targetGrade = normalizeMeetingTargetGrade(decision?.newGrade ?? null);
      return {
        memberDiscordId: memberDiscordId || "unknown",
        memberName: row.rpNameSnapshot,
        targetGrade,
      };
    })
    .filter((item) => !item.targetGrade);

  console.log("[finalize] missingPromotionTargets:", missingPromotionTargets.length, JSON.stringify(missingPromotionTargets));
  if (missingPromotionTargets.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "TARGET_GRADE_REQUIRED",
        message: "Une cible de rang est requise pour chaque décision Up / Double Up avant finalisation.",
        rows: missingPromotionTargets,
      },
      { status: 409 }
    );
  }

  const GUILD_ID = process.env.DISCORD_GUILD_ID ?? "";

  for (const row of meeting.rows) {
    try {
      // Use resolveMeetingDecisionCode so decisions stored only as decisionType enum
      // (legacy path or direct DB writes) are also processed correctly.
      const rawDecision = resolveMeetingDecisionCode(row);
      const memberDiscordId = String(row.discordIdSnapshot ?? "").trim();

      if (rawDecision === "UP" || rawDecision === "DOUBLE_UP") {
        const promotionDecision = memberDiscordId ? promotionDecisionByDiscordId.get(memberDiscordId) : null;
        const targetGrade = normalizeMeetingTargetGrade(promotionDecision?.newGrade ?? null);

        if (!targetGrade) {
          results.errors.push({
            memberDiscordId: memberDiscordId || "unknown",
            error: "TARGET_GRADE_REQUIRED",
          });
          continue;
        }

        const member = await prisma.member.findFirst({
          where: row.memberId
            ? { id: row.memberId, familyId: familyDbId }
            : {
                familyId: familyDbId,
                discordId: memberDiscordId || undefined,
              },
        });

        if (!member || !member.discordId) {
          results.errors.push({
            memberDiscordId: memberDiscordId || "unknown",
            error: "Member not found",
          });
          continue;
        }

        const targetRoleId = RANK_ROLE_ID_BY_LABEL.get(targetGrade.toLowerCase()) ?? null;
        const targetGradeLevel = getRankGradeLevel(targetGrade, targetRoleId) || member.gradeLevel;

        await prisma.member.update({
          where: { id: member.id },
          data: {
            grade: targetGrade,
            gradeLevel: targetGradeLevel,
            roleDiscordId: targetRoleId,
            rankRoleId: targetRoleId,
            rankLabel: targetGrade,
          },
        });

        await prisma.gradeHistory.create({
          data: {
            memberId: member.id,
            oldGrade: member.grade,
            oldGradeLevel: member.gradeLevel,
            newGrade: targetGrade,
            newGradeLevel: targetGradeLevel,
            changedBy: userDiscordId ?? userId ?? null,
            source: "MEETING",
            notes: `${meetingMarker} ${rawDecision}`,
          },
        });

        if (row.id) {
          await prisma.meetingRow.update({
            where: { id: row.id },
            data: {
              gradeSnapshot: targetGrade,
            },
          });
        }

        // Apply Discord role change for the promotion.
        if (GUILD_ID && targetRoleId && member.discordId) {
          await enqueueAssignRole({
            familyId: familyDbId,
            guildId: GUILD_ID,
            userDiscordId: member.discordId,
            roleId: targetRoleId,
            entity: "Meeting",
            entityId: meetingId,
            meta: { actorDiscordId: userDiscordId ?? null, actorUserId: userId ?? null },
          });

          // Collecter TOUS les anciens rôles de grade à retirer.
          // Priorité : discordRoleIds (source de vérité Discord) + champs legacy DB.
          const ALL_RANK_ROLE_IDS = new Set(Object.keys(GRADE_LABEL_BY_ROLE_ID));
          const roleIdsToRemove = new Set<string>();

          // 1. Champs legacy DB (roleDiscordId / rankRoleId)
          const legacyOld = member.roleDiscordId ?? member.rankRoleId ?? null;
          if (legacyOld && legacyOld !== targetRoleId) {
            roleIdsToRemove.add(legacyOld);
          }

          // 2. Rôles Discord actuels du membre (le plus fiable)
          if (Array.isArray(member.discordRoleIds)) {
            for (const rid of member.discordRoleIds) {
              if (rid !== targetRoleId && ALL_RANK_ROLE_IDS.has(rid)) {
                roleIdsToRemove.add(rid);
              }
            }
          }

          for (const rid of roleIdsToRemove) {
            await enqueueRemoveRole({
              familyId: familyDbId,
              guildId: GUILD_ID,
              userDiscordId: member.discordId,
              roleId: rid,
              entity: "Meeting",
              entityId: meetingId,
              meta: { actorDiscordId: userDiscordId ?? null, actorUserId: userId ?? null },
            });
          }
        }

        results.promoted++;
        continue;
      }

      // EXCLUDE has no Prisma SanctionType entry and the worker doesn't handle it.
      // resolveMeetingDecisionCode may return "EXCLUSION" (from decisionType enum) or "EXCLUDE"
      // (from sanctionType string) — both map to BLACKLIST.
      const effectiveDecision =
        rawDecision === "EXCLUDE" || rawDecision === "EXCLUSION" ? "BLACKLIST" : rawDecision;

      const sanctionType = SANCTION_TYPES.includes(effectiveDecision as SanctionType)
        ? (effectiveDecision as SanctionType)
        : null;

      if (!sanctionType) {
        results.kept++;
        continue;
      }

      const member = await prisma.member.findFirst({
        where: row.memberId
          ? { id: row.memberId, familyId: familyDbId }
          : {
              familyId: familyDbId,
              discordId: memberDiscordId || undefined,
            },
      });

      if (!member || !member.discordId) {
        results.errors.push({
          memberDiscordId: memberDiscordId || "unknown",
          error: "Member not found",
        });
        continue;
      }

      const existing = await prisma.sanction.findFirst({
        where: {
          familyId: familyDbId,
          memberId: member.id,
          type: sanctionType,
          source: "MEETING",
          notes: { contains: meetingMarker },
        },
        select: { id: true },
      });

      if (!existing) {
        if (!userId) {
          console.error(
            `[finalize] Cannot create sanction for member ${memberDiscordId || member.id}: session user id is null`
          );
          results.errors.push({
            memberDiscordId: memberDiscordId || "unknown",
            error: "SESSION_USER_ID_MISSING",
          });
          continue;
        }

        const startAt = new Date();
        const reason = String(row.sanctionReason ?? "").trim() || `Sanction réunion - ${meeting.title ?? meeting.weekKey}`;

        const sanction = await prisma.sanction.create({
          data: {
            familyId: familyDbId,
            memberId: member.id,
            discordId: member.discordId,
            type: sanctionType,
            source: "MEETING",
            reason,
            startAt,
            expiresAt: getSanctionExpirationDate(sanctionType, startAt),
            status: "ACTIVE",
            discordStatus: "PENDING",
            createdById: userId,
            notes: `${meetingMarker} ${meeting.title ?? meeting.weekKey}`,
          },
        });

        const outbox = await enqueueSanctionApply({
          familyId: familyDbId,
          sanctionId: sanction.id,
          discordId: member.discordId,
          memberName: member.rpName ?? "Unknown",
          sanctionType,
          reason,
          durationHours: sanction.expiresAt
            ? Math.max(1, Math.ceil((sanction.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)))
            : null,
          staffName: session?.user?.name ?? "Système",
          appliedByUserId: userId,
        });

        if (!outbox) {
          console.error(
            `[finalize] Failed to enqueue SANCTION_APPLY for sanction ${sanction.id} (member ${memberDiscordId || member.id}, type ${sanctionType})`
          );
        }

        await prisma.sanction.update({
          where: { id: sanction.id },
          data: { outboxJobId: outbox?.id ?? null } as any,
        });

        await evaluateSanctionRules(member.id, familyDbId).catch((err) => {
          console.error("[POST /api/staff/meetings/[id]/finalize] Error evaluating rules:", err);
        });

        results.applied++;
        if (sanctionType === "DEMOTE") results.demoted++;
        else if (sanctionType === "BLACKLIST") results.blacklisted++;
        else if (sanctionType === "RESERVISTE") results.reservists++;
        else results.warnings++;
      }

      if (row.id) {
        await prisma.meetingRow.update({
          where: { id: row.id },
          data: {
            sanctionReason: row.sanctionReason ?? null,
          },
        });
      }
    } catch (err: any) {
      results.errors.push({
        memberDiscordId: String(row.discordIdSnapshot ?? "unknown"),
        error: err.message?.slice(0, 100) ?? "Unknown error",
      });
    }
  }

  await prisma.meetingDecision.updateMany({
    where: { meetingId, appliedAt: null },
    data: { appliedAt: new Date() },
  });

  const refreshedRows = await prisma.meetingRow.findMany({
    where: { meetingId },
    orderBy: { sortOrder: "asc" },
  });
  const computedSummary = computeMeetingSummary(refreshedRows, {
    meetingDate: meeting.meetingDate,
    notes: meeting.description,
  });
  const summary = `Réunion finalisée: ${results.promoted} promotion(s), ${results.applied} sanction(s), ${results.demoted} démote(s), ${results.blacklisted} blacklist(s), ${results.reservists} réserviste(s), ${results.kept} maintien(s)`;

  const finalizedMeeting = await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status: "FINAL",
      closedAt: meeting.closedAt ?? new Date(),
      finalizedAt: new Date(),
      finalizedByUserId: userId,
      sanctionsAppliedAt: new Date(),
      summary,
      summaryText: meeting.summaryText ?? computedSummary.summaryText,
    },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      familyId: DEFAULT_FAMILY_ID,
      actorType: "staff",
      actorId: userId,
      actorName: session?.user?.name ?? null,
      action: "FINALIZED",
      entity: "Meeting",
      entityId: meetingId,
      entityName: meeting.title ?? meeting.weekKey,
      meta: {
        promoted: results.promoted,
        applied: results.applied,
        demoted: results.demoted,
        blacklisted: results.blacklisted,
        reservists: results.reservists,
        warnings: results.warnings,
        kept: results.kept,
        errors: results.errors.length,
      },
    },
  });

  // Record metric
  recordPanelMetric("meeting.finalize", meetingId, {
    promoted: results.promoted,
    applied: results.applied,
    demoted: results.demoted,
    blacklisted: results.blacklisted,
    reservists: results.reservists,
    warnings: results.warnings,
    kept: results.kept,
    errors: results.errors.length,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    finalizedAt: finalizedMeeting.finalizedAt,
    summary,
    results: {
      promoted: results.promoted,
      applied: results.applied,
      demoted: results.demoted,
      blacklisted: results.blacklisted,
      reservists: results.reservists,
      warnings: results.warnings,
      kept: results.kept,
      errors: results.errors.length,
    },
    errors: results.errors.length > 0 ? results.errors : undefined,
  });
}
