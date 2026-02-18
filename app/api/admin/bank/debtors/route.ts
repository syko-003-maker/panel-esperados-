export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/guards";
import { getOrCreateDiscordConfig } from "@/lib/discord/discord";
import { getDebtRows } from "@/lib/bank-debts";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";

export async function GET(req: Request) {
  const guard = await requireAdmin();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familySlug = searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const familyId = await resolveFamilyId(familySlug);
  const limitRaw = Number(searchParams.get("limit") ?? "50");
  const limit = Math.min(Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1), 200);
  const thresholdRaw = searchParams.get("threshold");
  const thresholdValue = thresholdRaw ? Number(thresholdRaw) : undefined;
  const threshold =
    thresholdValue !== undefined && Number.isFinite(thresholdValue) && thresholdValue > 0
      ? Math.floor(thresholdValue)
      : undefined;

  const config = await getOrCreateDiscordConfig(familyId);
  const data = await getDebtRows({
    familyId,
    threshold,
    limit,
  });
  const safeData = data.map((row) => ({
    ...row,
    lastAt: row.lastAt ? row.lastAt.toISOString() : null,
  }));

  return NextResponse.json({
    ok: true,
    data: safeData,
    familySlug,
    config: {
      bankAlertsChannelId: config.bankAlertsChannelId ?? null,
      bankDebtPingThreshold: config.bankDebtPingThreshold ?? null,
      bankDebtPingEnabled: config.bankDebtPingEnabled ?? false,
      bankDebtPingCooldownMinutes: config.bankDebtPingCooldownMinutes ?? 60,
    },
  });
}
