import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";
import { getSession } from "@/auth";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import {
  computeSnapshot,
  evaluateRules,
  produceSanctions,
  getCurrentPeriod,
  initializeDefaultRules,
} from "@/lib/activityEngine";

/**
 * POST /api/admin/activity/compute
 * Compute activity snapshots for current period and apply rules
 */
export async function POST(req: NextRequest) {
  const guard = await requireAdmin();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const userId = session?.user?.id ?? (session as any)?.userId ?? null;

  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const dryRun = req.nextUrl.searchParams.get("dryRun") === "true";

  try {
    // Ensure default rules exist
    const rulesCreated = await initializeDefaultRules(prisma, familyId);
    if (rulesCreated > 0) {
      console.log(`[activity/compute] Initialized ${rulesCreated} default rules`);
    }

    // Get period
    const { start: periodStart, end: periodEnd } = getCurrentPeriod();

    // Get all active members
    const members = await prisma.member.findMany({
      where: { familyId, isActive: true },
      select: { discordId: true, rpName: true, grade: true },
    });

    // Get enabled rules
    const rules = await prisma.activityRule.findMany({
      where: { familyId, isEnabled: true },
      orderBy: { priority: "asc" },
    });

    // Get system user for sanctions
    const systemUser = await prisma.user.findFirst({
      where: { isStaff: true },
      select: { id: true },
    });

    if (!systemUser && !dryRun) {
      return NextResponse.json(
        { ok: false, error: "No staff user found for system actions" },
        { status: 500 }
      );
    }

    const results = {
      membersProcessed: 0,
      snapshotsCreated: 0,
      snapshotsUpdated: 0,
      rulesTriggered: 0,
      sanctionsCreated: 0,
      sanctionsSkipped: 0,
      errors: [] as Array<{ discordId: string; error: string }>,
      details: [] as Array<{
        discordId: string;
        rpName: string | null;
        status: string;
        actions: number;
      }>,
    };

    for (const member of members) {
      if (!member.discordId) continue;

      try {
        // Compute snapshot
        const snapshot = await computeSnapshot(
          prisma,
          familyId,
          member.discordId,
          periodStart,
          periodEnd
        );

        // Upsert snapshot
        if (!dryRun) {
          const existing = await prisma.activitySnapshot.findUnique({
            where: {
              familyId_memberDiscordId_periodStart_periodEnd: {
                familyId,
                memberDiscordId: member.discordId,
                periodStart,
                periodEnd,
              },
            },
          });

          if (existing) {
            await prisma.activitySnapshot.update({
              where: { id: existing.id },
              data: {
                playtimeMinutes: snapshot.playtimeMinutes,
                meetingsTotal: snapshot.meetingsTotal,
                meetingsAttended: snapshot.meetingsAttended,
                meetingsMissed: snapshot.meetingsMissed,
                justifiedAbsences: snapshot.justifiedAbsences,
                status: snapshot.status,
                flags: snapshot.flags,
                computedAt: new Date(),
              },
            });
            results.snapshotsUpdated++;
          } else {
            await prisma.activitySnapshot.create({
              data: {
                familyId,
                memberDiscordId: member.discordId,
                periodStart,
                periodEnd,
                playtimeMinutes: snapshot.playtimeMinutes,
                meetingsTotal: snapshot.meetingsTotal,
                meetingsAttended: snapshot.meetingsAttended,
                meetingsMissed: snapshot.meetingsMissed,
                justifiedAbsences: snapshot.justifiedAbsences,
                status: snapshot.status,
                flags: snapshot.flags,
              },
            });
            results.snapshotsCreated++;
          }
        }

        // Evaluate rules
        const actions = evaluateRules(snapshot, rules);
        results.rulesTriggered += actions.length;

        // Produce sanctions (if not dry run)
        if (!dryRun && actions.length > 0 && systemUser) {
          const sanctionResults = await produceSanctions(
            prisma,
            familyId,
            actions,
            systemUser.id
          );

          for (const sr of sanctionResults) {
            if (sr.skipped) {
              results.sanctionsSkipped++;
            } else if (sr.sanctionId) {
              results.sanctionsCreated++;
            }
          }
        }

        results.membersProcessed++;
        results.details.push({
          discordId: member.discordId,
          rpName: member.rpName,
          status: snapshot.status,
          actions: actions.length,
        });
      } catch (err: any) {
        results.errors.push({
          discordId: member.discordId,
          error: err.message?.slice(0, 100) ?? "Unknown error",
        });
      }
    }

    // Log the compute run
    if (!dryRun) {
      await prisma.activityLog.create({
        data: {
          familyId,
          action: "COMPUTE_RUN",
          details: {
            periodStart,
            periodEnd,
            membersProcessed: results.membersProcessed,
            snapshotsCreated: results.snapshotsCreated,
            snapshotsUpdated: results.snapshotsUpdated,
            rulesTriggered: results.rulesTriggered,
            sanctionsCreated: results.sanctionsCreated,
          },
        },
      });
    }

    return NextResponse.json({
      ok: true,
      dryRun,
      period: { start: periodStart, end: periodEnd },
      results: {
        membersProcessed: results.membersProcessed,
        snapshotsCreated: results.snapshotsCreated,
        snapshotsUpdated: results.snapshotsUpdated,
        rulesTriggered: results.rulesTriggered,
        sanctionsCreated: results.sanctionsCreated,
        sanctionsSkipped: results.sanctionsSkipped,
        errors: results.errors.length,
      },
      details: results.details,
      errors: results.errors.length > 0 ? results.errors : undefined,
    });
  } catch (error: any) {
    console.error("[/api/admin/activity/compute]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Compute failed" },
      { status: 500 }
    );
  }
}
