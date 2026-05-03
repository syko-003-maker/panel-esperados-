export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaffAccess } from "@/lib/rbac";
import { DEFAULT_FAMILY_ID, resolveFamilyId, FAMILY_SLUG } from "@/lib/family";
import { getMemberDisplayName } from "@/lib/member-display";
import { isDisplayableStaffMember } from "@/lib/staff/member-scope";

export async function GET() {
  const guard = await requireStaffAccess();
  if (guard instanceof Response) return guard;

  try {
    const familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);

    // ── Family bank balance ────────────────────────────────────────────────
    let familyBankBalance: number | null = null;
    const syncKeys = [`lyg-sync:infos:${FAMILY_SLUG}`, `infos:${FAMILY_SLUG}`];
    for (const key of syncKeys) {
      const row = await prisma.syncState.findUnique({ where: { key }, select: { meta: true } });
      const meta = row?.meta as any;
      const money = meta?.metrics?.money ?? meta?.money ?? null;
      if (money != null) {
        const parsed = typeof money === "number" ? Math.trunc(money)
          : typeof money === "string" ? (Number.isFinite(Number(money.replace(/\s+/g, ""))) ? Math.trunc(Number(money.replace(/\s+/g, ""))) : null)
          : null;
        if (parsed != null) { familyBankBalance = parsed; break; }
      }
    }

    // ── Debtors ───────────────────────────────────────────────────────────
    type Row = { steamId: string; net: bigint };
    const rows = await prisma.$queryRaw<Row[]>`
      SELECT "steamId",
        SUM(CASE WHEN "type" = 2 THEN "money" ELSE -"money" END) AS "net"
      FROM "BankLog"
      GROUP BY "steamId"
      HAVING SUM(CASE WHEN "type" = 2 THEN "money" ELSE -"money" END) < 0
    `;

    const steamIds = rows.map(r => r.steamId).filter(Boolean);
    const members = steamIds.length ? await prisma.member.findMany({
      where: { steamId: { in: steamIds }, familyId },
      select: {
        steamId: true, rpName: true, discordDisplayName: true, discordUsername: true,
        discordId: true, isActive: true, isGhost: true, discordInGuild: true,
        missingFromLygSince: true, grade: true, rankRoleId: true, rankLabel: true, discordRoleIds: true,
      },
      take: 500,
    }) : [];

    const activeSteamIds = new Set(
      members
        .filter(m => isDisplayableStaffMember({
          discordId: m.discordId, isActive: m.isActive, isGhost: m.isGhost,
          discordInGuild: m.discordInGuild, missingFromLygSince: m.missingFromLygSince,
          grade: m.grade, rankRoleId: m.rankRoleId, rankLabel: m.rankLabel, discordRoleIds: m.discordRoleIds,
        }))
        .map(m => String(m.steamId ?? "").trim())
        .filter(Boolean)
    );

    const rpBySteam       = new Map(members.filter(m => m.steamId).map(m => [String(m.steamId).trim(), getMemberDisplayName(m)]));
    const discordIdBySteam = new Map(members.filter(m => m.steamId && m.discordId).map(m => [String(m.steamId).trim(), String(m.discordId).trim()]));

    const debtors = rows
      .filter(r => activeSteamIds.has(r.steamId))
      .map(r => ({ steamId: r.steamId, rpName: rpBySteam.get(r.steamId) ?? null, discordId: discordIdBySteam.get(r.steamId) ?? null, debt: Math.abs(Number(r.net)) }))
      .sort((a, b) => b.debt - a.debt)
      .slice(0, 5);

    return NextResponse.json({ ok: true, familyBankBalance, debtors, debtorCount: debtors.length });
  } catch (e: any) {
    console.error("[dashboard/bank-summary]", e?.message);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}
