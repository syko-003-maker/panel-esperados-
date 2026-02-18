import { NextRequest, NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { getMetricCounts, getRecentMetrics, getRecentAlerts, getWorkerHeartbeat } from "@/lib/metrics";

/**
 * GET /api/staff/metrics
 * Get metrics data for dashboard
 */
export async function GET(req: NextRequest) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const searchParams = req.nextUrl.searchParams;
  const familyId = searchParams.get("familyId") ?? "esperados";
  const days = parseInt(searchParams.get("days") ?? "7", 10);

  try {
    // Get metric counts for charts
    const counts = await getMetricCounts({
      familyId,
      days,
      types: [
        "ticket.create",
        "ticket.close",
        "ingest.ok",
        "ingest.ko",
        "sanction.create",
        "meeting.finalize",
      ],
    });

    // Get recent metrics
    const recentMetrics = await getRecentMetrics({
      familyId,
      limit: 50,
    });

    // Get recent alerts
    const alerts = await getRecentAlerts({
      familyId,
      limit: 20,
    });

    // Get worker heartbeat
    const heartbeat = await getWorkerHeartbeat(familyId);
    const workerOnline = heartbeat
      ? new Date().getTime() - heartbeat.lastSeenAt.getTime() < 5 * 60 * 1000
      : false;

    return NextResponse.json({
      ok: true,
      data: {
        counts,
        recentMetrics,
        alerts,
        worker: {
          online: workerOnline,
          lastSeenAt: heartbeat?.lastSeenAt ?? null,
          name: heartbeat?.workerName ?? null,
        },
      },
    });
  } catch (error: any) {
    console.error("[/api/staff/metrics GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch metrics" },
      { status: 500 }
    );
  }
}
