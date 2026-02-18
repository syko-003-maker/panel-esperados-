import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { getOrCreateDiscordConfig, enqueueBankDebtPingBatch } from "@/lib/discord/discord";
import { getDebtRows } from "@/lib/bank-debts";

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof Response) return guard;

  const body = await req.json().catch(() => null);
  const thresholdRaw = body?.threshold;
  const familyId = "esperados";

  const config = await getOrCreateDiscordConfig(familyId);
  if (!config.bankDebtPingEnabled) {
    return NextResponse.json({ ok: false, error: "BANK_PING_DISABLED" }, { status: 400 });
  }
  if (!config.bankAlertsChannelId) {
    return NextResponse.json({ ok: false, error: "MISSING_BANK_ALERTS_CHANNEL" }, { status: 400 });
  }

  const thresholdValue = Number(thresholdRaw);
  const threshold =
    Number.isFinite(thresholdValue) && thresholdValue > 0
      ? Math.floor(thresholdValue)
      : config.bankDebtPingThreshold ?? 0;

  if (!threshold || threshold <= 0) {
    return NextResponse.json({ ok: false, error: "MISSING_THRESHOLD" }, { status: 400 });
  }

  const cooldownMinutes = config.bankDebtPingCooldownMinutes ?? 60;
  const now = new Date();

  const lastBatch = await prisma.discordOutbox.findFirst({
    where: {
      familyId,
      type: "BANK_DEBT_PING_BATCH",
      status: { in: ["PENDING", "SENDING", "SENT"] },
    },
    orderBy: { createdAt: "desc" },
  });

  if (lastBatch) {
    const diffMs = now.getTime() - lastBatch.createdAt.getTime();
    if (diffMs < cooldownMinutes * 60 * 1000) {
      return NextResponse.json(
        { ok: false, error: "COOLDOWN_ACTIVE", cooldownMinutes },
        { status: 400 }
      );
    }
  }

  const debtors = await getDebtRows({ familyId, threshold, limit: 1, onlyLinked: true });
  if (debtors.length === 0) {
    return NextResponse.json({ ok: false, error: "NO_DEBTORS" }, { status: 400 });
  }

  const session: any = (guard as any).session;
  const createdByUserId = String(session?.user?.id ?? "");
  if (!createdByUserId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const created = await enqueueBankDebtPingBatch({
    familyId,
    threshold,
    createdByUserId,
    now,
  });

  return NextResponse.json({
    ok: true,
    threshold,
    enqueued: Boolean(created),
    alreadyQueued: !created,
  });
}
