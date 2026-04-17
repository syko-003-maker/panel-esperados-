import { NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { getOrCreateDiscordConfig, enqueueBankDebtPingBatch } from "@/lib/discord/discord";
import { getDebtRows } from "@/lib/bank-debts";
import { resolveFamilyId } from "@/lib/family";
import { logInfo, logWarn, logError, makeRequestId } from "@/lib/obs";

export async function POST(req: Request) {
  const requestId = makeRequestId();
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const createdByUserId = String(session?.user?.id ?? "");
  if (!createdByUserId) {
    logWarn("debt_ping_batch_unauthenticated", { requestId });
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED", requestId }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => null);
    const thresholdRaw = body?.threshold;
    const familySlug = "esperados";
    const familyId = await resolveFamilyId(familySlug); // UUID pour BankLog

    const config = await getOrCreateDiscordConfig(familySlug); // slug pour DiscordConfig
    if (!config.bankDebtPingEnabled) {
      logWarn("debt_ping_batch_disabled", { requestId });
      return NextResponse.json({ ok: false, error: "BANK_PING_DISABLED", requestId }, { status: 400 });
    }
    if (!config.bankAlertsChannelId) {
      logWarn("debt_ping_batch_missing_channel", { requestId });
      return NextResponse.json({ ok: false, error: "MISSING_BANK_ALERTS_CHANNEL", requestId }, { status: 400 });
    }

    const thresholdValue = Number(thresholdRaw);
    const threshold =
      Number.isFinite(thresholdValue) && thresholdValue > 0
        ? Math.floor(thresholdValue)
        : config.bankDebtPingThreshold ?? 0;

    if (!threshold || threshold <= 0) {
      logWarn("debt_ping_batch_missing_threshold", { requestId });
      return NextResponse.json({ ok: false, error: "MISSING_THRESHOLD", requestId }, { status: 400 });
    }

    const cooldownMinutes = config.bankDebtPingCooldownMinutes ?? 60;
    const now = new Date();

    const lastBatch = await prisma.discordOutbox.findFirst({
      where: {
        familyId: familySlug, // outbox stocke le slug
        type: "BANK_DEBT_PING_BATCH",
        status: { in: ["PENDING", "SENDING", "SENT"] },
      },
      orderBy: { createdAt: "desc" },
    });

    if (lastBatch) {
      const diffMs = now.getTime() - lastBatch.createdAt.getTime();
      if (diffMs < cooldownMinutes * 60 * 1000) {
        logWarn("debt_ping_batch_cooldown_active", { requestId, cooldownMinutes });
        return NextResponse.json(
          { ok: false, error: "COOLDOWN_ACTIVE", cooldownMinutes, requestId },
          { status: 400 }
        );
      }
    }

    const debtors = await getDebtRows({ familyId, threshold, limit: 1 }); // familyId = UUID
    if (debtors.length === 0) {
      logWarn("debt_ping_batch_no_debtors", { requestId, threshold });
      return NextResponse.json({ ok: false, error: "NO_DEBTORS", requestId }, { status: 400 });
    }

    const created = await enqueueBankDebtPingBatch({
      familyId: familySlug, // slug dans l'outbox (worker en a besoin pour DiscordConfig)
      threshold,
      createdByUserId,
      now,
    });

    logInfo("debt_ping_batch_enqueued", { requestId, threshold, enqueued: Boolean(created), createdByUserId });
    return NextResponse.json({
      ok: true,
      threshold,
      enqueued: Boolean(created),
      alreadyQueued: !created,
      requestId,
    });
  } catch (err) {
    logError("debt_ping_batch_error", { requestId }, err);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}
