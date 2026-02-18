import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guards";
import { getOrCreateDiscordConfig, enqueueBankDebtPingSingle } from "@/lib/discord/discord";
import { getMemberDebt } from "@/lib/bank-debts";

export async function POST(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof Response) return guard;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const memberId = String(body.memberId ?? "").trim();
  if (!memberId) {
    return NextResponse.json({ ok: false, error: "MISSING_MEMBER_ID" }, { status: 400 });
  }

  const familyId = "esperados";
  const config = await getOrCreateDiscordConfig(familyId);
  if (!config.bankDebtPingEnabled) {
    return NextResponse.json({ ok: false, error: "BANK_PING_DISABLED" }, { status: 400 });
  }
  if (!config.bankAlertsChannelId) {
    return NextResponse.json({ ok: false, error: "MISSING_BANK_ALERTS_CHANNEL" }, { status: 400 });
  }

  const debt = await getMemberDebt({ familyId, memberId });
  if (!debt.member) {
    return NextResponse.json({ ok: false, error: debt.error || "MEMBER_NOT_FOUND" }, { status: 404 });
  }
  if (!debt.ok || debt.deficitAmount <= 0) {
    return NextResponse.json({ ok: false, error: "NO_DEFICIT" }, { status: 400 });
  }

  const created = await enqueueBankDebtPingSingle({
    familyId,
    memberId,
    deficitAmount: debt.deficitAmount,
    discordId: debt.member.discordId ?? null,
    steamId: debt.member.steamId ?? null,
    rpName: debt.member.rpName ?? null,
    lastAt: debt.lastAt,
  });

  return NextResponse.json({ ok: true, enqueued: Boolean(created), alreadyQueued: !created });
}
