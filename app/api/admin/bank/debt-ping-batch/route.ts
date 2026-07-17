import { NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import { getSession } from "@/auth";
import { runDebtReminderCycle } from "@/lib/bank-debts-smart";
import { logInfo, logWarn, logError, makeRequestId } from "@/lib/obs";

/**
 * Lancement MANUEL d'une vague de rappels de dettes (bouton Chef dans Stats →
 * Dettes). Délègue à runDebtReminderCycle (logique intelligente : cooldown par
 * membre en jours, escalade des messages, alerte État-Major au 3e+, reset des
 * payeurs). Le même cycle tourne aussi en auto via /api/cron/debt-reminders.
 */
export async function POST(req: Request) {
  const requestId = makeRequestId();
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const createdByUserId = String(session?.user?.id ?? "");
  if (!createdByUserId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED", requestId }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const thresholdRaw = Number(body?.threshold);
    const thresholdOverride = Number.isFinite(thresholdRaw) && thresholdRaw > 0 ? Math.floor(thresholdRaw) : null;

    const result = await runDebtReminderCycle({ trigger: "manual", thresholdOverride });

    if (!result.ok) {
      logWarn("debt_reminder_manual_blocked", { requestId, reason: result.reason });
      const errMap: Record<string, string> = {
        disabled: "BANK_PING_DISABLED",
        no_channel: "MISSING_BANK_ALERTS_CHANNEL",
        no_threshold: "MISSING_THRESHOLD",
      };
      return NextResponse.json(
        { ok: false, error: errMap[result.reason ?? ""] ?? result.reason ?? "CYCLE_FAILED", requestId },
        { status: 400 }
      );
    }

    logInfo("debt_reminder_manual_done", { requestId, ...result, createdByUserId });
    return NextResponse.json({ ...result, requestId });
  } catch (err) {
    logError("debt_reminder_manual_error", { requestId }, err);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}
