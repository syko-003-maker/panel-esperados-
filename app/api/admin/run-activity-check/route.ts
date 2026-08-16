import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { enqueueSanctionApply } from "@/lib/discord/discord";
import { evaluateSanctionRules } from "@/lib/sanction-rules";
import { getSanctionExpirationDate } from "@/lib/sanctions";
import { toFamilyCuid } from "@/lib/family";

/**
 * POST /api/admin/run-activity-check
 * Scan activity data and create sanctions for rule violations
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof Response) return guard;

  // Chemin DORMANT (ENABLE_AUTO_SANCTION_RULES desactive) mais normalise :
  // il alimente evaluateSanctionRules(), qui cree des Sanction et des jobs
  // outbox. Une activation future ne doit pas reintroduire de slug.
  const familyId = await toFamilyCuid(req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID);

  const results = {
    scanned: 0,
    sanctionsCreated: 0,
    errors: [] as Array<{ discordId: string; error: string }>,
    details: [] as Array<{ discordId: string; reason: string; type: string }>,
  };

  try {
    // Get all active members
    const members = await prisma.member.findMany({
      where: { familyId, isActive: true },
      select: { id: true, discordId: true, rpName: true, grade: true },
    });

    results.scanned = members.length;

    // Get system user for createdById (or use first admin)
    const systemUser = await prisma.user.findFirst({
      where: { isStaff: true },
      select: { id: true },
    });

    if (!systemUser) {
      return NextResponse.json(
        { ok: false, error: "No staff user found for system actions" },
        { status: 500 }
      );
    }

    const now = new Date();
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);

    for (const member of members) {
      if (!member.discordId) continue;

      try {
        // Check for existing active sanctions of same type to avoid duplicates
        const existingActiveSanction = await prisma.sanction.findFirst({
          where: {
            familyId,
            discordId: member.discordId,
            status: "ACTIVE",
            source: "ACTIVITY",
          },
        });

        if (existingActiveSanction) {
          // Skip - already has active activity sanction
          continue;
        }

        // Check recent activity (last 2 weeks)
        // Look for any bank logs as activity indicator
        const recentActivity = await prisma.bankLog.findFirst({
          where: {
            familyId,
            steamId: member.discordId, // Note: This might need adjustment based on your data model
            at: { gte: twoWeeksAgo },
          },
        });

        // Check for recent absences
        const recentAbsence = await prisma.absence.findFirst({
          where: {
            familyId,
            discordId: member.discordId,
            status: "APPROVED",
            startAt: { lte: now },
            endAt: { gte: twoWeeksAgo },
          },
        });

        // If no activity and no approved absence, create warning
        if (!recentActivity && !recentAbsence) {
          // Check if WL1 (exempt from activity rules)
          if (member.grade === "WL1") {
            continue;
          }

          const sanction = await prisma.sanction.create({
            data: {
              familyId,
              discordId: member.discordId,
              memberId: member.id,
              type: "AVERT_ORAL_PLAYTIME",
              source: "ACTIVITY",
              reason: `Inactivité détectée - Aucune activité depuis plus de 2 semaines`,
              startAt: now,
              expiresAt: getSanctionExpirationDate("AVERT_ORAL_PLAYTIME", now),
              status: "ACTIVE",
              discordStatus: "PENDING",
              createdById: systemUser.id,
            },
          });

          const outbox = await enqueueSanctionApply({
            familyId,
            sanctionId: sanction.id,
            discordId: member.discordId,
            memberName: member.rpName ?? "Unknown",
            sanctionType: sanction.type,
            reason: sanction.reason ?? "No reason provided",
            durationHours: sanction.expiresAt
              ? Math.max(1, Math.ceil((sanction.expiresAt.getTime() - Date.now()) / (60 * 60 * 1000)))
              : null,
            staffName: "Système",
            appliedByUserId: systemUser.id,
          });

          await prisma.sanction.update({
            where: { id: sanction.id },
            data: { outboxJobId: outbox?.id ?? null } as any,
          });

          await evaluateSanctionRules(member.id, familyId).catch((err) => {
            console.error("[/api/admin/run-activity-check] Error evaluating rules:", err);
          });

          results.sanctionsCreated++;
          results.details.push({
            discordId: member.discordId,
            reason: "Inactivité 2+ semaines",
            type: "WARNING",
          });
        }
      } catch (err: any) {
        results.errors.push({
          discordId: member.discordId,
          error: err.message?.slice(0, 100) ?? "Unknown error",
        });
      }
    }

    return NextResponse.json({
      ok: true,
      results: {
        scanned: results.scanned,
        sanctionsCreated: results.sanctionsCreated,
        errors: results.errors.length,
      },
      details: results.details,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (error: any) {
    console.error("[/api/admin/run-activity-check]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Activity check failed" },
      { status: 500 }
    );
  }
}
