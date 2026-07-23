/**
 * Stats de la famille pour le bot Discord (« on est combien ? », « combien de
 * gens en dette ? »…). Auth : x-ingest-secret (comme les crons).
 *
 * ⚠️ L'appartenance à la famille ne se déduit PAS de `isActive` seul (périmé
 * pour beaucoup d'ex-membres) : on réutilise `isActiveMembersScopeMember`,
 * la règle qui alimente déjà /staff/members, pour que le bot annonce
 * exactement le même effectif que le panel.
 *
 * GET → { ok, membersCount, playtimeDone, playtimeRequiredDefault,
 *         inDebtCount, totalDebt, topPlaytime }
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveFamilyId } from "@/lib/family";
import { isActiveMembersScopeMember } from "@/lib/staff/member-scope";
import { resolveRequiredPlaytimeMinutes, MEETING_PLAYTIME_THRESHOLD_MINUTES } from "@/lib/meetings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  if (req.headers.get("x-ingest-secret") !== process.env.INGEST_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const familyId = await resolveFamilyId("esperados");
  const members = await prisma.member.findMany({
    where: { familyId },
    select: {
      rpName: true,
      steamId: true,
      playtime7d: true,
      playtimeRequiredMinutes: true,
      isActive: true,
      isGhost: true,
      discordId: true,
      discordInGuild: true,
      discordRoleIds: true,
      missingFromLygSince: true,
      grade: true,
      rankRoleId: true,
      rankLabel: true,
    },
  });

  const inFamily = members.filter((m) => isActiveMembersScopeMember(m));

  // Playtime : chacun peut avoir un seuil perso (0 = exempté).
  let playtimeDone = 0;
  let topPlaytime: { name: string; minutes: number } | null = null;
  for (const m of inFamily) {
    const required = resolveRequiredPlaytimeMinutes(m.playtimeRequiredMinutes);
    if (required === 0 || (m.playtime7d ?? 0) >= required) playtimeDone += 1;
    if (!topPlaytime || (m.playtime7d ?? 0) > topPlaytime.minutes) {
      topPlaytime = { name: m.rpName ?? "?", minutes: m.playtime7d ?? 0 };
    }
  }

  // Dettes : solde négatif au coffre (même calcul que getMemberDebt). On agrège
  // toute la famille en une requête, puis on ne garde que les membres du scope.
  const steamIds = new Set(inFamily.map((m) => m.steamId).filter((v): v is string => Boolean(v)));
  let inDebtCount = 0;
  let totalDebt = 0;
  if (steamIds.size > 0) {
    const rows = await prisma.$queryRaw<{ steamId: string; net: bigint | null }[]>`
      SELECT "steamId", SUM(CASE WHEN "type" = 2 THEN "money" ELSE -"money" END) AS "net"
      FROM "BankLog"
      WHERE "familyId" = ${familyId}
      GROUP BY "steamId"
    `.catch(() => [] as { steamId: string; net: bigint | null }[]);
    for (const r of rows) {
      if (!steamIds.has(r.steamId)) continue;
      const net = r.net ? Number(r.net) : 0;
      if (net < 0) {
        inDebtCount += 1;
        totalDebt += Math.abs(net);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    membersCount: inFamily.length,
    playtimeDone,
    playtimeRequiredDefault: MEETING_PLAYTIME_THRESHOLD_MINUTES,
    inDebtCount,
    totalDebt,
    topPlaytime,
  });
}
