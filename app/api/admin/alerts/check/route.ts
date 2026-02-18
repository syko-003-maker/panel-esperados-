import { NextRequest, NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import { countMetricsInWindow, isWorkerOnline, createAlert, getActiveAlerts, resolveAlert } from "@/lib/metrics";
import { prisma } from "@/lib/db";

const DEFAULT_FAMILY_ID = "esperados";

// Alert thresholds
const INGEST_KO_THRESHOLD = 10; // Max ingest.ko in 1 hour
const INGEST_KO_WINDOW_MINUTES = 60;
const WORKER_OFFLINE_THRESHOLD_MINUTES = 5;

/**
 * POST /api/admin/alerts/check
 * Check alert conditions and create/resolve alerts
 */
export async function POST(req: NextRequest) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

  try {
    const results: {
      checked: string[];
      alertsCreated: string[];
      alertsResolved: string[];
    } = {
      checked: [],
      alertsCreated: [],
      alertsResolved: [],
    };

    // Get active alerts to check for resolution
    const activeAlerts = await getActiveAlerts(familyId);
    const activeAlertTypes = new Set(activeAlerts.map((a) => a.type));

    // ─────────────────────────────────────────────────────────────
    // Check 1: Ingest KO spike
    // ─────────────────────────────────────────────────────────────
    results.checked.push("ingest.ko.spike");

    const ingestKoCount = await countMetricsInWindow({
      familyId,
      type: "ingest.ko",
      windowMinutes: INGEST_KO_WINDOW_MINUTES,
    });

    if (ingestKoCount >= INGEST_KO_THRESHOLD) {
      // Create alert if not already active
      if (!activeAlertTypes.has("ingest.ko.spike")) {
        await createAlert({
          familyId,
          type: "ingest.ko.spike",
          severity: "warning",
          message: `${ingestKoCount} ingest failures in the last hour (threshold: ${INGEST_KO_THRESHOLD})`,
          meta: { count: ingestKoCount, threshold: INGEST_KO_THRESHOLD },
        });
        results.alertsCreated.push("ingest.ko.spike");
      }
    } else {
      // Resolve existing alert if count is now below threshold
      const existingAlert = activeAlerts.find((a) => a.type === "ingest.ko.spike");
      if (existingAlert) {
        await resolveAlert(existingAlert.id);
        results.alertsResolved.push("ingest.ko.spike");
      }
    }

    // ─────────────────────────────────────────────────────────────
    // Check 2: Worker offline
    // ─────────────────────────────────────────────────────────────
    results.checked.push("worker.offline");

    const workerOnline = await isWorkerOnline(familyId, WORKER_OFFLINE_THRESHOLD_MINUTES);

    if (!workerOnline) {
      // Create alert if not already active
      if (!activeAlertTypes.has("worker.offline")) {
        await createAlert({
          familyId,
          type: "worker.offline",
          severity: "critical",
          message: `Worker has not sent heartbeat in ${WORKER_OFFLINE_THRESHOLD_MINUTES} minutes`,
          meta: { thresholdMinutes: WORKER_OFFLINE_THRESHOLD_MINUTES },
        });
        results.alertsCreated.push("worker.offline");
      }
    } else {
      // Resolve existing alert if worker is back online
      const existingAlert = activeAlerts.find((a) => a.type === "worker.offline");
      if (existingAlert) {
        await resolveAlert(existingAlert.id);
        results.alertsResolved.push("worker.offline");
      }
    }

    return NextResponse.json({
      ok: true,
      ...results,
    });
  } catch (error: any) {
    console.error("[/api/admin/alerts/check POST]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to check alerts" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/admin/alerts/check
 * Get current alert status
 */
export async function GET(req: NextRequest) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

  try {
    const activeAlerts = await getActiveAlerts(familyId);
    const workerOnline = await isWorkerOnline(familyId);

    // Get quick stats
    const ingestKoCount = await countMetricsInWindow({
      familyId,
      type: "ingest.ko",
      windowMinutes: INGEST_KO_WINDOW_MINUTES,
    });

    return NextResponse.json({
      ok: true,
      data: {
        activeAlerts,
        workerOnline,
        ingestKoLastHour: ingestKoCount,
        thresholds: {
          ingestKo: INGEST_KO_THRESHOLD,
          workerOfflineMinutes: WORKER_OFFLINE_THRESHOLD_MINUTES,
        },
      },
    });
  } catch (error: any) {
    console.error("[/api/admin/alerts/check GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to get alert status" },
      { status: 500 }
    );
  }
}
