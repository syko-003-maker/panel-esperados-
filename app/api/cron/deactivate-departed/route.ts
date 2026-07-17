import { NextRequest, NextResponse } from "next/server";
import { deactivateDepartedLygMembers } from "@/lib/lyg/deactivate-departed";
import { logInfo, logError, makeRequestId } from "@/lib/obs";

/**
 * Désactive les membres partis de la famille LYG (vus il y a > grace min par
 * rapport au dernier sync). Appelé par le worker toutes les ~10 min.
 * Auth : x-ingest-secret (ou Bearer CRON_SECRET).
 */
function authorized(req: NextRequest): boolean {
  const ingestSecret = req.headers.get("x-ingest-secret");
  const expectedIngest = process.env.INGEST_SECRET;
  if (ingestSecret && expectedIngest && ingestSecret === expectedIngest) return true;
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (authHeader && cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  return false;
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const requestId = makeRequestId();
  try {
    const graceRaw = Number(req.nextUrl.searchParams.get("graceMinutes"));
    const graceMinutes = Number.isFinite(graceRaw) && graceRaw > 0 ? Math.floor(graceRaw) : 30;
    const result = await deactivateDepartedLygMembers({ graceMinutes });
    if (result.deactivated > 0) {
      logInfo("deactivate_departed_done", { requestId, ...result });
    }
    return NextResponse.json({ ok: true, ...result, requestId });
  } catch (err) {
    logError("deactivate_departed_error", { requestId }, err);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST avec x-ingest-secret pour désactiver les partis." });
}
