/**
 * Activity Engine
 * Computes activity snapshots and evaluates rules
 */

import type { PrismaClient, ActivityStatus, ActivityRule, Sanction } from "@prisma/client";
import { DEFAULT_FAMILY_ID } from "./family";
import { enqueueSanctionApply } from "./discord/discord";
import { evaluateSanctionRules } from "./sanction-rules";
import { getSanctionExpirationDate } from "./sanctions";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type RuleCode =
  | "INACTIVITY_2WEEKS"
  | "MEETING_ABSENCE_WARN"
  | "LOW_PLAYTIME_WARN"
  | "MEETING_ABSENCE_STRIKE"
  | "CRITICAL_INACTIVITY";

export type RuleParams = {
  INACTIVITY_2WEEKS: {
    inactivityDays: number;
    sanctionType: string;
  };
  MEETING_ABSENCE_WARN: {
    missedMeetingsThreshold: number;
    sanctionType: string;
  };
  LOW_PLAYTIME_WARN: {
    minPlaytimeMinutes: number;
    sanctionType: string;
  };
  MEETING_ABSENCE_STRIKE: {
    missedMeetingsThreshold: number;
    sanctionType: string;
  };
  CRITICAL_INACTIVITY: {
    inactivityDays: number;
    sanctionType: string;
  };
};

export type ComputeResult = {
  memberDiscordId: string;
  playtimeMinutes: number;
  meetingsTotal: number;
  meetingsAttended: number;
  meetingsMissed: number;
  justifiedAbsences: number;
  status: ActivityStatus;
  flags: {
    isInactive: boolean;
    hasMissedMeetings: boolean;
    hasLowPlaytime: boolean;
    hasJustifiedAbsence: boolean;
    isExempt: boolean;
  };
};

export type RuleAction = {
  ruleCode: string;
  memberDiscordId: string;
  action: "SANCTION" | "WARN" | "SKIP";
  sanctionType?: string;
  reason: string;
};

// ─────────────────────────────────────────────────────────────
// Default Rule Params
// ─────────────────────────────────────────────────────────────

export const DEFAULT_RULES: Array<{
  code: RuleCode;
  name: string;
  description: string;
  params: RuleParams[RuleCode];
  priority: number;
}> = [
  {
    code: "INACTIVITY_2WEEKS",
    name: "Inactivité 2 semaines",
    description: "Avertissement si aucune activité depuis 14 jours",
    params: { inactivityDays: 14, sanctionType: "WARNING" },
    priority: 10,
  },
  {
    code: "MEETING_ABSENCE_WARN",
    name: "Absence réunion (avertissement)",
    description: "Avertissement si 2+ réunions manquées sans justification",
    params: { missedMeetingsThreshold: 2, sanctionType: "WARNING" },
    priority: 20,
  },
  {
    code: "LOW_PLAYTIME_WARN",
    name: "Temps de jeu faible",
    description: "Avertissement si temps de jeu < 120 minutes sur la période",
    params: { minPlaytimeMinutes: 120, sanctionType: "WARNING" },
    priority: 30,
  },
  {
    code: "MEETING_ABSENCE_STRIKE",
    name: "Absence réunion (strike)",
    description: "Strike si 3+ réunions manquées sans justification",
    params: { missedMeetingsThreshold: 3, sanctionType: "STRIKE" },
    priority: 40,
  },
  {
    code: "CRITICAL_INACTIVITY",
    name: "Inactivité critique",
    description: "Suspension si aucune activité depuis 30 jours",
    params: { inactivityDays: 30, sanctionType: "SUSPENSION" },
    priority: 50,
  },
];

// ─────────────────────────────────────────────────────────────
// Engine Functions
// ─────────────────────────────────────────────────────────────

/**
 * Compute activity snapshot for a member over a period
 */
export async function computeSnapshot(
  prisma: PrismaClient,
  familyId: string,
  memberDiscordId: string,
  periodStart: Date,
  periodEnd: Date
): Promise<ComputeResult> {
  // Get member
  const member = await prisma.member.findFirst({
    where: { familyId, discordId: memberDiscordId },
    select: { id: true, grade: true, isActive: true, steamId: true },
  });

  const isExempt = member?.grade === "WL1" || !member?.isActive;

  // Get playtime from bank logs (using steamId)
  let playtimeMinutes = 0;
  if (member?.steamId) {
    const bankLogs = await prisma.bankLog.findMany({
      where: {
        familyId,
        steamId: member.steamId,
        at: { gte: periodStart, lte: periodEnd },
      },
      select: { at: true },
    });
    // Estimate playtime: each log entry = some activity
    // Simple heuristic: count unique days * average session
    const uniqueDays = new Set(bankLogs.map((l) => l.at.toISOString().split("T")[0]));
    playtimeMinutes = uniqueDays.size * 60; // 1 hour per active day
  }

  // Get meetings in period
  const meetings = await prisma.meeting.findMany({
    where: {
      familyId,
      meetingDate: { gte: periodStart, lte: periodEnd },
    },
    select: { id: true },
  });

  // Get attendance records
  const attendances = await prisma.meetingAttendance.findMany({
    where: {
      meetingId: { in: meetings.map((m) => m.id) },
      memberDiscordId,
    },
    select: { present: true },
  });

  const meetingsTotal = meetings.length;
  const meetingsAttended = attendances.filter((a) => a.present).length;
  const meetingsMissed = meetingsTotal - meetingsAttended;

  // Get justified absences
  const justifiedAbsences = await prisma.absence.count({
    where: {
      familyId,
      discordId: memberDiscordId,
      status: "APPROVED",
      OR: [
        { startAt: { gte: periodStart, lte: periodEnd } },
        { endAt: { gte: periodStart, lte: periodEnd } },
        { AND: [{ startAt: { lte: periodStart } }, { endAt: { gte: periodEnd } }] },
      ],
    },
  });

  // Compute status
  let status: ActivityStatus = "OK";
  const hasJustifiedAbsence = justifiedAbsences > 0;
  const isInactive = playtimeMinutes < 30 && !hasJustifiedAbsence;
  const hasMissedMeetings = meetingsMissed > 0 && !hasJustifiedAbsence;
  const hasLowPlaytime = playtimeMinutes < 120 && !hasJustifiedAbsence;

  if (isExempt) {
    status = "OK";
  } else if (isInactive || (meetingsMissed >= 2 && !hasJustifiedAbsence)) {
    status = "KO";
  } else if (hasMissedMeetings || hasLowPlaytime) {
    status = "WARN";
  }

  return {
    memberDiscordId,
    playtimeMinutes,
    meetingsTotal,
    meetingsAttended,
    meetingsMissed,
    justifiedAbsences,
    status,
    flags: {
      isInactive,
      hasMissedMeetings,
      hasLowPlaytime,
      hasJustifiedAbsence,
      isExempt,
    },
  };
}

/**
 * Evaluate rules against a snapshot
 */
export function evaluateRules(
  snapshot: ComputeResult,
  rules: ActivityRule[]
): RuleAction[] {
  const actions: RuleAction[] = [];

  if (snapshot.flags.isExempt) {
    return actions;
  }

  // Sort by priority
  const sortedRules = [...rules].sort((a, b) => a.priority - b.priority);

  for (const rule of sortedRules) {
    if (!rule.isEnabled) continue;

    const params = rule.params as any;

    switch (rule.code) {
      case "INACTIVITY_2WEEKS": {
        if (snapshot.flags.isInactive && !snapshot.flags.hasJustifiedAbsence) {
          actions.push({
            ruleCode: rule.code,
            memberDiscordId: snapshot.memberDiscordId,
            action: "SANCTION",
            sanctionType: params.sanctionType ?? "WARNING",
            reason: `Inactivité détectée sur la période`,
          });
        }
        break;
      }

      case "MEETING_ABSENCE_WARN": {
        const threshold = params.missedMeetingsThreshold ?? 2;
        if (
          snapshot.meetingsMissed >= threshold &&
          !snapshot.flags.hasJustifiedAbsence
        ) {
          actions.push({
            ruleCode: rule.code,
            memberDiscordId: snapshot.memberDiscordId,
            action: "SANCTION",
            sanctionType: params.sanctionType ?? "WARNING",
            reason: `${snapshot.meetingsMissed} réunion(s) manquée(s) sans justification`,
          });
        }
        break;
      }

      case "LOW_PLAYTIME_WARN": {
        const minPlaytime = params.minPlaytimeMinutes ?? 120;
        if (
          snapshot.playtimeMinutes < minPlaytime &&
          !snapshot.flags.hasJustifiedAbsence &&
          snapshot.playtimeMinutes > 0 // Only warn if there's some activity
        ) {
          actions.push({
            ruleCode: rule.code,
            memberDiscordId: snapshot.memberDiscordId,
            action: "WARN",
            reason: `Temps de jeu faible: ${snapshot.playtimeMinutes} minutes`,
          });
        }
        break;
      }

      case "MEETING_ABSENCE_STRIKE": {
        const threshold = params.missedMeetingsThreshold ?? 3;
        if (
          snapshot.meetingsMissed >= threshold &&
          !snapshot.flags.hasJustifiedAbsence
        ) {
          actions.push({
            ruleCode: rule.code,
            memberDiscordId: snapshot.memberDiscordId,
            action: "SANCTION",
            sanctionType: params.sanctionType ?? "STRIKE",
            reason: `${snapshot.meetingsMissed} réunions manquées - strike`,
          });
        }
        break;
      }

      case "CRITICAL_INACTIVITY": {
        const inactivityDays = params.inactivityDays ?? 30;
        // Check if playtime is 0 and no justified absence
        if (
          snapshot.playtimeMinutes === 0 &&
          !snapshot.flags.hasJustifiedAbsence
        ) {
          actions.push({
            ruleCode: rule.code,
            memberDiscordId: snapshot.memberDiscordId,
            action: "SANCTION",
            sanctionType: params.sanctionType ?? "SUSPENSION",
            reason: `Inactivité critique - aucune activité sur ${inactivityDays}+ jours`,
          });
        }
        break;
      }
    }
  }

  return actions;
}

/**
 * Check if member already has active sanction of same type from activity
 */
async function hasActiveSanction(
  prisma: PrismaClient,
  familyId: string,
  memberDiscordId: string,
  sanctionType: string
): Promise<boolean> {
  const existing = await prisma.sanction.findFirst({
    where: {
      familyId,
      discordId: memberDiscordId,
      type: sanctionType as any,
      source: "ACTIVITY",
      status: "ACTIVE",
    },
  });
  return !!existing;
}

/**
 * Create sanctions from rule actions
 */
export async function produceSanctions(
  prisma: PrismaClient,
  familyId: string,
  actions: RuleAction[],
  systemUserId: string
): Promise<Array<{ action: RuleAction; sanctionId?: string; skipped?: boolean }>> {
  const results: Array<{ action: RuleAction; sanctionId?: string; skipped?: boolean }> = [];

  for (const action of actions) {
    if (action.action !== "SANCTION" || !action.sanctionType) {
      results.push({ action, skipped: true });
      continue;
    }

    // Check for existing active sanction
    const hasExisting = await hasActiveSanction(
      prisma,
      familyId,
      action.memberDiscordId,
      action.sanctionType
    );

    if (hasExisting) {
      results.push({ action, skipped: true });

      await prisma.activityLog.create({
        data: {
          familyId,
          memberDiscordId: action.memberDiscordId,
          ruleCode: action.ruleCode,
          action: "SANCTION_SKIPPED",
          details: { reason: "Active sanction already exists", sanctionType: action.sanctionType },
        },
      });
      continue;
    }

    // Get member
    const member = await prisma.member.findFirst({
      where: { familyId, discordId: action.memberDiscordId },
      select: { id: true, rpName: true },
    });

    const startAt = new Date();
    const sanction = await prisma.sanction.create({
      data: {
        familyId,
        discordId: action.memberDiscordId,
        memberId: member?.id,
        type: action.sanctionType as any,
        source: "ACTIVITY",
        reason: action.reason,
        startAt,
        expiresAt: getSanctionExpirationDate(action.sanctionType, startAt),
        status: "ACTIVE",
        discordStatus: "PENDING",
        createdById: systemUserId,
      },
    });

    const outbox = await enqueueSanctionApply({
      familyId,
      sanctionId: sanction.id,
      discordId: action.memberDiscordId,
      memberName: member?.rpName ?? action.memberDiscordId,
      sanctionType: action.sanctionType,
      reason: action.reason,
      durationHours: sanction.expiresAt
        ? Math.max(1, Math.ceil((sanction.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)))
        : null,
      staffName: "Système",
      appliedByUserId: systemUserId,
      client: prisma,
    });

    await prisma.sanction.update({
      where: { id: sanction.id },
      data: { outboxJobId: outbox?.id ?? null } as any,
    });

    if (member?.id) {
      await evaluateSanctionRules(member.id, familyId).catch((err) => {
        console.error("[produceSanctions] Error evaluating rules:", err);
      });
    }

    await prisma.activityLog.create({
      data: {
        familyId,
        memberDiscordId: action.memberDiscordId,
        ruleCode: action.ruleCode,
        action: "SANCTION_CREATED",
        details: { sanctionId: sanction.id, sanctionType: action.sanctionType, reason: action.reason },
      },
    });

    results.push({ action, sanctionId: sanction.id });
  }

  return results;
}

/**
 * Get current period dates (last 2 weeks)
 */
export function getCurrentPeriod(): { start: Date; end: Date } {
  const end = new Date();
  const start = new Date(end.getTime() - 14 * 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Initialize default rules for a family
 */
export async function initializeDefaultRules(
  prisma: PrismaClient,
  familyId: string
): Promise<number> {
  let created = 0;

  for (const rule of DEFAULT_RULES) {
    const existing = await prisma.activityRule.findUnique({
      where: { familyId_code: { familyId, code: rule.code } },
    });

    if (!existing) {
      await prisma.activityRule.create({
        data: {
          familyId,
          code: rule.code,
          name: rule.name,
          description: rule.description,
          params: rule.params,
          priority: rule.priority,
          isEnabled: true,
        },
      });
      created++;
    }
  }

  return created;
}
