/**
 * GDPR Compliance Utilities
 * Anonymization and data purge functions
 */

import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { createHash } from "crypto";
import { recordPanelMetric } from "@/lib/metrics";

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

const GDPR_PURGE_ENABLED = process.env.GDPR_PURGE_ENABLED === "true";
const GDPR_HASH_SECRET = process.env.GDPR_HASH_SECRET ?? "gdpr-default-secret";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

export type GdprPurgeResult = {
  success: boolean;
  anonymizedDiscordId?: string;
  membersAnonymized: number;
  ticketsAnonymized: number;
  complaintsAnonymized: number;
  sanctionsAnonymized: number;
  auditLogsAnonymized: number;
  error?: string;
};

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

/**
 * Generate GDPR-safe hash for a discord ID
 */
function gdprHash(discordId: string): string {
  const hash = createHash("sha256")
    .update(`${GDPR_HASH_SECRET}:${discordId}`)
    .digest("hex")
    .slice(0, 16);
  return `gdpr:${hash}`;
}

/**
 * Check if GDPR purge is enabled
 */
export function isGdprPurgeEnabled(): boolean {
  return GDPR_PURGE_ENABLED;
}

// ─────────────────────────────────────────────────────────────
// Main Purge Function
// ─────────────────────────────────────────────────────────────

/**
 * Anonymize all data for a member (GDPR right to be forgotten)
 * This is IRREVERSIBLE - use with caution
 */
export async function purgeGdprData(
  memberDiscordId: string,
  actorId: string,
  actorName: string,
  confirm: boolean = false
): Promise<GdprPurgeResult> {
  if (!GDPR_PURGE_ENABLED) {
    return {
      success: false,
      membersAnonymized: 0,
      ticketsAnonymized: 0,
      complaintsAnonymized: 0,
      sanctionsAnonymized: 0,
      auditLogsAnonymized: 0,
      error: "GDPR purge is disabled. Set GDPR_PURGE_ENABLED=true",
    };
  }

  if (!confirm) {
    return {
      success: false,
      membersAnonymized: 0,
      ticketsAnonymized: 0,
      complaintsAnonymized: 0,
      sanctionsAnonymized: 0,
      auditLogsAnonymized: 0,
      error: "Confirmation required. Set confirm=true to proceed.",
    };
  }

  const anonymizedId = gdprHash(memberDiscordId);

  try {
    const result = await prisma.$transaction(async (tx) => {
      let membersAnonymized = 0;
      let ticketsAnonymized = 0;
      let complaintsAnonymized = 0;
      let sanctionsAnonymized = 0;
      let auditLogsAnonymized = 0;

      // ─────────────────────────────────────────────────────────────
      // 1. Anonymize MemberProfile
      // ─────────────────────────────────────────────────────────────
      const memberResult = await tx.member.updateMany({
        where: { discordId: memberDiscordId },
        data: {
          discordId: anonymizedId,
          steamId: null,
          rpName: "[GDPR Anonymized]",
        },
      });
      membersAnonymized = memberResult.count;

      // ─────────────────────────────────────────────────────────────
      // 2. Anonymize Recruitments
      // ─────────────────────────────────────────────────────────────
      const recruitmentResult = await tx.recruitment.updateMany({
        where: { discordId: memberDiscordId },
        data: {
          discordId: anonymizedId,
          steamId: null,
          rpName: "[GDPR Anonymized]",
          authorTag: null,
          payload: Prisma.JsonNull,
          motivation: null,
          notes: null,
          screenshots: null,
          searchText: null,
        },
      });
      ticketsAnonymized += recruitmentResult.count;

      // Also anonymize closed by
      await tx.recruitment.updateMany({
        where: { closedByDiscordId: memberDiscordId },
        data: { closedByDiscordId: anonymizedId },
      });

      // ─────────────────────────────────────────────────────────────
      // 3. Anonymize Complaints
      // ─────────────────────────────────────────────────────────────
      const complaintAuthorResult = await tx.complaint.updateMany({
        where: { authorDiscordId: memberDiscordId },
        data: {
          authorDiscordId: anonymizedId,
          authorRpName: "[GDPR Anonymized]",
          authorTag: null,
          payload: Prisma.JsonNull,
          evidence: null,
          searchText: null,
        },
      });
      complaintsAnonymized += complaintAuthorResult.count;

      // Anonymize target name if matches
      await tx.complaint.updateMany({
        where: { targetName: { contains: memberDiscordId } },
        data: { targetName: "[GDPR Anonymized]" },
      });

      // Anonymize closed by
      await tx.complaint.updateMany({
        where: { closedByDiscordId: memberDiscordId },
        data: { closedByDiscordId: anonymizedId },
      });

      // ─────────────────────────────────────────────────────────────
      // 4. Anonymize Sanctions (keep structure for compliance)
      // ─────────────────────────────────────────────────────────────
      const sanctionResult = await tx.sanction.updateMany({
        where: { discordId: memberDiscordId },
        data: {
          discordId: anonymizedId,
          reason: "[GDPR Anonymized]",
        },
      });
      sanctionsAnonymized = sanctionResult.count;

      // ─────────────────────────────────────────────────────────────
      // 5. Anonymize Absences
      // ─────────────────────────────────────────────────────────────
      await tx.absence.updateMany({
        where: { discordId: memberDiscordId },
        data: {
          discordId: anonymizedId,
          reason: "[GDPR Anonymized]",
        },
      });

      // ─────────────────────────────────────────────────────────────
      // 6. Anonymize AuditLogs (mask actor but keep action)
      // ─────────────────────────────────────────────────────────────
      const auditActorResult = await tx.auditLog.updateMany({
        where: { actorId: memberDiscordId },
        data: {
          actorId: anonymizedId,
          actorName: "[GDPR Anonymized]",
        },
      });
      auditLogsAnonymized = auditActorResult.count;

      // Also update audit logs where entity is this member
      await tx.auditLog.updateMany({
        where: { entityId: memberDiscordId },
        data: {
          entityId: anonymizedId,
          entityName: "[GDPR Anonymized]",
        },
      });

      // ─────────────────────────────────────────────────────────────
      // 7. Anonymize Activity Snapshots
      // ─────────────────────────────────────────────────────────────
      await tx.activitySnapshot.updateMany({
        where: { memberDiscordId },
        data: { memberDiscordId: anonymizedId },
      });

      // ─────────────────────────────────────────────────────────────
      // 8. Anonymize Meeting Decisions
      // ─────────────────────────────────────────────────────────────
      await tx.meetingDecision.updateMany({
        where: { memberDiscordId },
        data: { memberDiscordId: anonymizedId },
      });

      // ─────────────────────────────────────────────────────────────
      // 9. Create audit log for the purge
      // ─────────────────────────────────────────────────────────────
      await tx.auditLog.create({
        data: {
          familyId: "esperados",
          actorType: "staff",
          actorId,
          actorName,
          action: "GDPR_PURGE",
          entity: "Member",
          entityId: anonymizedId,
          entityName: "[GDPR Purge Request]",
          meta: {
            originalDiscordIdHash: anonymizedId,
            membersAnonymized,
            ticketsAnonymized,
            complaintsAnonymized,
            sanctionsAnonymized,
            auditLogsAnonymized,
          } as Prisma.InputJsonValue,
        },
      });

      return {
        membersAnonymized,
        ticketsAnonymized,
        complaintsAnonymized,
        sanctionsAnonymized,
        auditLogsAnonymized,
      };
    });

    // Record metric
    await recordPanelMetric("gdpr.purge", anonymizedId, {
      ...result,
    });

    return {
      success: true,
      anonymizedDiscordId: anonymizedId,
      ...result,
    };
  } catch (error: any) {
    console.error("[GDPR Purge] Error:", error);
    return {
      success: false,
      membersAnonymized: 0,
      ticketsAnonymized: 0,
      complaintsAnonymized: 0,
      sanctionsAnonymized: 0,
      auditLogsAnonymized: 0,
      error: error.message ?? "GDPR purge failed",
    };
  }
}

// ─────────────────────────────────────────────────────────────
// Data Export (GDPR Right to Access)
// ─────────────────────────────────────────────────────────────

export type GdprExportResult = {
  success: boolean;
  data?: {
    member: any;
    recruitments: any[];
    complaints: any[];
    sanctions: any[];
    absences: any[];
    activitySnapshots: any[];
  };
  error?: string;
};

/**
 * Export all data for a member (GDPR right to access)
 */
export async function exportGdprData(memberDiscordId: string): Promise<GdprExportResult> {
  try {
    const [member, recruitments, complaints, sanctions, absences, activitySnapshots] =
      await Promise.all([
        prisma.member.findFirst({
          where: { discordId: memberDiscordId },
          select: {
            id: true,
            discordId: true,
            steamId: true,
            rpName: true,
            grade: true,
            isActive: true,
            joinedAt: true,
            createdAt: true,
          },
        }),
        prisma.recruitment.findMany({
          where: { discordId: memberDiscordId },
          select: {
            id: true,
            ticketKey: true,
            status: true,
            rpName: true,
            createdAt: true,
            closedAt: true,
          },
        }),
        prisma.complaint.findMany({
          where: { authorDiscordId: memberDiscordId },
          select: {
            id: true,
            ticketKey: true,
            status: true,
            title: true,
            createdAt: true,
            closedAt: true,
          },
        }),
        prisma.sanction.findMany({
          where: { discordId: memberDiscordId },
          select: {
            id: true,
            type: true,
            status: true,
            reason: true,
            startAt: true,
            endAt: true,
            createdAt: true,
          },
        }),
        prisma.absence.findMany({
          where: { discordId: memberDiscordId },
          select: {
            id: true,
            status: true,
            reason: true,
            startAt: true,
            endAt: true,
            createdAt: true,
          },
        }),
        prisma.activitySnapshot.findMany({
          where: { memberDiscordId },
          select: {
            id: true,
            periodStart: true,
            periodEnd: true,
            status: true,
            playtimeMinutes: true,
          },
        }),
      ]);

    return {
      success: true,
      data: {
        member,
        recruitments,
        complaints,
        sanctions,
        absences,
        activitySnapshots,
      },
    };
  } catch (error: any) {
    return {
      success: false,
      error: error.message ?? "Export failed",
    };
  }
}
