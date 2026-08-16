import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { logInfo, logError, makeRequestId } from "@/lib/obs";
import { toFamilyCuid } from "@/lib/family";

/**
 * GET /api/staff/health/summary
 * Staff-only endpoint that returns system health metrics
 *
 * CRITICAL RULE: All metrics are computed fresh on each request
 * - No caching to ensure real-time accuracy
 * - Only ChefOrEtatMajor can access
 * - Returns comprehensive diagnostics for troubleshooting
 */
export async function GET(req: Request) {
  const requestId = makeRequestId();
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const startTime = Date.now();

  try {
    // Ces compteurs portent sur des tables en convention CUID (Sanction,
    // Recruitment, Meeting, Complaint) : le slug ne remonterait rien.
    const familyId = await toFamilyCuid("esperados");

    // Parallel health checks
    const [
      memberCount,
      sanctionsPending,
      outboxPending,
      recruitmentsPending,
      complaintsPending,
      usersLinked,
      discordAccountsLinked,
    ] = await Promise.all([
      // Active members
      prisma.member.count({
        where: { familyId },
      }),

      // Active sanctions (ACTIVE status)
      prisma.sanction.count({
        where: { familyId, status: "ACTIVE", clearedAt: null },
      }),

      // Pending Outbox jobs
      prisma.discordOutbox.count({
        where: { familyId, status: "PENDING" },
      }),

      // Open recruitment tickets
      prisma.recruitment.count({
        where: { familyId, status: "PENDING" },
      }),

      // Open complaints
      prisma.complaint.count({
        where: { familyId, status: "OPEN" },
      }),

      // Users with Discord OAuth
      prisma.user.count({
        where: {
          accounts: {
            some: { provider: "discord" },
          },
        },
      }),

      // Discord accounts linked to members
      prisma.account.count({
        where: { provider: "discord" },
      }),
    ]);

    // Compute health status
    const issues: string[] = [];
    const isHealthy = outboxPending < 100;

    if (outboxPending > 100) {
      issues.push(`Outbox queue backlog: ${outboxPending} pending jobs`);
    }
    if (outboxPending > 500) {
      issues.push("🚨 CRITICAL: Outbox queue severely backlogged");
    }

    const elapsedMs = Date.now() - startTime;

    logInfo("health_summary_ok", { requestId, elapsedMs, healthy: isHealthy, outboxPending });
    return NextResponse.json({
      ok: true,
      requestId,
      timestamp: new Date().toISOString(),
      healthy: isHealthy,
      issues,
      metrics: {
        system: {
          responseTimeMs: elapsedMs,
          databaseConnected: true,
        },
        members: {
          total: memberCount,
        },
        sanctions: {
          activeCount: sanctionsPending,
        },
        tickets: {
          recruitmentsPending,
          complaintsPending,
          totalPending: recruitmentsPending + complaintsPending,
        },
        queue: {
          outboxPendingCount: outboxPending,
        },
        integration: {
          usersWithDiscordOAuth: usersLinked,
          discordAccountsLinked,
        },
      },
    });
  } catch (error: any) {
    logError("health_summary_error", { requestId }, error);
    return NextResponse.json(
      {
        ok: false,
        healthy: false,
        error: "INTERNAL_ERROR",
        requestId,
        timestamp: new Date().toISOString(),
      },
      { status: 500 }
    );
  }
}
