import { NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import { getOrCreateDiscordConfig, enqueueBankDebtPingSingle } from "@/lib/discord/discord";
import { getMemberDebt } from "@/lib/bank-debts";
import { resolveFamilyId } from "@/lib/family";
import { logInfo, logWarn, logError, makeRequestId } from "@/lib/obs";

export async function POST(req: Request) {
  const requestId = makeRequestId();
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  try {
    const body = await req.json().catch(() => null);
    if (!body) {
      logWarn("debt_ping_single_invalid_body", { requestId });
      return NextResponse.json({ ok: false, error: "INVALID_BODY", requestId }, { status: 400 });
    }

    const memberId = String(body.memberId ?? "").trim();
    if (!memberId) {
      logWarn("debt_ping_single_missing_member_id", { requestId });
      return NextResponse.json({ ok: false, error: "MISSING_MEMBER_ID", requestId }, { status: 400 });
    }

    const familySlug = "esperados";
    const familyId = await resolveFamilyId(familySlug); // UUID pour BankLog
    const config = await getOrCreateDiscordConfig(familySlug); // slug pour DiscordConfig
    if (!config.bankDebtPingEnabled) {
      logWarn("debt_ping_single_disabled", { requestId, memberId });
      return NextResponse.json({ ok: false, error: "BANK_PING_DISABLED", requestId }, { status: 400 });
    }
    if (!config.bankAlertsChannelId) {
      logWarn("debt_ping_single_missing_channel", { requestId, memberId });
      return NextResponse.json({ ok: false, error: "MISSING_BANK_ALERTS_CHANNEL", requestId }, { status: 400 });
    }

    const debt = await getMemberDebt({ familyId, memberId }); // familyId = UUID
    if (!debt.member) {
      logWarn("debt_ping_single_member_not_found", { requestId, memberId, error: debt.error });
      return NextResponse.json({ ok: false, error: debt.error || "MEMBER_NOT_FOUND", requestId }, { status: 404 });
    }
    if (!debt.ok || debt.deficitAmount <= 0) {
      logWarn("debt_ping_single_no_deficit", { requestId, memberId });
      return NextResponse.json({ ok: false, error: "NO_DEFICIT", requestId }, { status: 400 });
    }

    const created = await enqueueBankDebtPingSingle({
      familyId: familySlug, // slug dans l'outbox (worker en a besoin pour DiscordConfig)
      memberId,
      deficitAmount: debt.deficitAmount,
      discordId: debt.member.discordId ?? null,
      steamId: debt.member.steamId ?? null,
      rpName: debt.member.rpName ?? null,
      lastAt: debt.lastAt,
    });

    logInfo("debt_ping_single_enqueued", { requestId, memberId, enqueued: Boolean(created) });
    return NextResponse.json({ ok: true, enqueued: Boolean(created), alreadyQueued: !created, requestId });
  } catch (err) {
    logError("debt_ping_single_error", { requestId }, err);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}
