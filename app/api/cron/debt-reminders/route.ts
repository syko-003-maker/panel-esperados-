import { NextRequest, NextResponse } from "next/server";
import { runDebtReminderCycle } from "@/lib/bank-debts-smart";
import { logInfo, logError, makeRequestId } from "@/lib/obs";

/**
 * Cycle AUTOMATIQUE de rappels de dettes (appelé par le worker toutes les X h).
 * Ne fait rien si `bankDebtAutoEnabled` est off. Auth : x-ingest-secret (comme
 * les autres routes cron internes) ou Bearer CRON_SECRET.
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
    const result = await runDebtReminderCycle({ trigger: "auto" });
    logInfo("debt_reminders_cron_done", { requestId, ...result });
    return NextResponse.json({ ...result, requestId });
  } catch (err) {
    logError("debt_reminders_cron_error", { requestId }, err);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ ok: true, hint: "POST avec x-ingest-secret pour lancer le cycle de rappels." });
}
