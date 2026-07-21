import { NextRequest, NextResponse } from "next/server";
import { reconcileSubtenienteWL3 } from "@/lib/lyg/reconcile-subteniente-wl3";
import { logInfo, logError, makeRequestId } from "@/lib/obs";

/**
 * Réconciliation WL : remonte en WL3 (en direct sur LYG) tout Subteniente encore
 * en WL < 3. Appelé par le worker. Auth : x-ingest-secret ou Bearer CRON_SECRET.
 * `?dryRun=1` pour simuler sans écrire.
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
    const dryRun = req.nextUrl.searchParams.get("dryRun") === "1";
    const result = await reconcileSubtenienteWL3({ dryRun });
    logInfo("wl_reconcile_cron_done", {
      requestId,
      dryRun,
      checked: result.checked,
      upgraded: result.upgraded.length,
      errors: result.errors.length,
    });
    return NextResponse.json({ ...result, requestId });
  } catch (err) {
    logError("wl_reconcile_cron_error", { requestId }, err);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST avec x-ingest-secret (?dryRun=1 pour simuler) — remonte les Subteniente en WL3.",
  });
}
