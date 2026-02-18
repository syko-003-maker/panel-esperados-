import { NextRequest, NextResponse } from "next/server";
import { updateWorkerHeartbeat } from "@/lib/metrics";

const INGEST_SECRET = process.env.INGEST_SECRET;

/**
 * POST /api/ingest/heartbeat
 * Worker heartbeat endpoint
 */
export async function POST(req: NextRequest) {
  // Verify secret
  const auth = req.headers.get("authorization");
  if (!INGEST_SECRET) {
    console.warn("[ingest/heartbeat] INGEST_SECRET not configured");
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  }

  if (auth !== `Bearer ${INGEST_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const familyId = body.familyId ?? "esperados";
    const workerName = body.workerName ?? "discord-worker";
    const meta = body.meta ?? null;

    await updateWorkerHeartbeat(familyId, workerName, meta);

    return NextResponse.json({
      ok: true,
      message: "Heartbeat recorded",
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    console.error("[/api/ingest/heartbeat POST]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to record heartbeat" },
      { status: 500 }
    );
  }
}

/**
 * GET /api/ingest/heartbeat
 * Check worker status (no auth required, for monitoring)
 */
export async function GET(req: NextRequest) {
  try {
    const { getWorkerHeartbeat, isWorkerOnline } = await import("@/lib/metrics");
    const familyId = req.nextUrl.searchParams.get("familyId") ?? "esperados";

    const heartbeat = await getWorkerHeartbeat(familyId);
    const online = await isWorkerOnline(familyId);

    return NextResponse.json({
      ok: true,
      online,
      lastSeenAt: heartbeat?.lastSeenAt ?? null,
      workerName: heartbeat?.workerName ?? null,
    });
  } catch (error: any) {
    console.error("[/api/ingest/heartbeat GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to check heartbeat" },
      { status: 500 }
    );
  }
}
