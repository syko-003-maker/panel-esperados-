import { NextRequest, NextResponse } from "next/server";
import { recordWorkerMetric } from "@/lib/metrics";

const INGEST_SECRET = process.env.INGEST_SECRET;

/**
 * POST /api/ingest/metrics
 * Record metrics from worker
 */
export async function POST(req: NextRequest) {
  // Verify secret
  const auth = req.headers.get("authorization");
  if (!INGEST_SECRET) {
    console.warn("[ingest/metrics] INGEST_SECRET not configured");
    return NextResponse.json({ ok: false, error: "Not configured" }, { status: 503 });
  }

  if (auth !== `Bearer ${INGEST_SECRET}`) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();

    // Support single event or batch
    const events = Array.isArray(body) ? body : [body];

    const results = await Promise.all(
      events.map((event) =>
        recordWorkerMetric(event.type, event.ref ?? null, event.meta ?? null)
      )
    );

    return NextResponse.json({
      ok: true,
      recorded: results.length,
    });
  } catch (error: any) {
    console.error("[/api/ingest/metrics POST]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to record metrics" },
      { status: 500 }
    );
  }
}
