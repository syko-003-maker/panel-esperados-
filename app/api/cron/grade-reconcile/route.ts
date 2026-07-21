import { NextRequest, NextResponse } from "next/server";
import { reconcileMemberGrades } from "@/lib/staff/reconcile-member-grades";
import { logInfo, logError, makeRequestId } from "@/lib/obs";

/**
 * Réconciliation des grades : aligne le champ grade stocké de chaque membre sur
 * son rôle Discord réel (aucune écriture Discord, base uniquement). Appelé par le
 * worker. Auth : x-ingest-secret ou Bearer CRON_SECRET. `?dryRun=1` pour simuler.
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
    const result = await reconcileMemberGrades({ dryRun });
    logInfo("grade_reconcile_cron_done", {
      requestId,
      dryRun,
      checked: result.checked,
      synced: result.synced.length,
    });
    return NextResponse.json({ ...result, requestId });
  } catch (err) {
    logError("grade_reconcile_cron_error", { requestId }, err);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    hint: "POST avec x-ingest-secret (?dryRun=1 pour simuler) — aligne le grade stocké sur le rôle Discord.",
  });
}
