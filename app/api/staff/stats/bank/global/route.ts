/**
 * GET /api/staff/stats/bank/global
 * Retourne la dette globale par membre (all-time)
 * Accessible seulement aux staff
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {
    // Check auth
    const guard = await requirePermission("STATS_VIEW");
    if (guard instanceof Response) {
      return guard;
    }

    const familyId = request.nextUrl.searchParams.get("familyId") ?? "esperados";

    // Fetch the family ID from slug
    const family = await prisma.family.findUnique({
      where: { slug: familyId },
      select: { id: true },
    });

    if (!family) {
      return NextResponse.json(
        { ok: false, error: "Family not found" },
        { status: 404 }
      );
    }

    // Aggregate all-time deposits and withdrawals by steamId
    const allTimeData = await prisma.$queryRaw<
      Array<{
        steamId: string;
        totalDeposits: bigint;
        totalWithdrawals: bigint;
      }>
    >`
      SELECT
        "steamId",
        SUM(CASE WHEN "type" = 2 THEN "money" ELSE 0 END) AS "totalDeposits",
        SUM(CASE WHEN "type" = 1 THEN "money" ELSE 0 END) AS "totalWithdrawals"
      FROM "BankLog"
      WHERE "familyId" = ${family.id}
      GROUP BY "steamId"
    `;

    // Get member info (rpName) for all steamIds
    const steamIds = allTimeData.map((r) => r.steamId);
    const members = steamIds.length
      ? await prisma.member.findMany({
          where: {
            steamId: { in: steamIds },
            OR: [{ familyId: family.id }, { familyId: familyId }],
          },
          select: { steamId: true, rpName: true, discordUsername: true },
          take: 2000,
        })
      : [];

    const rpBySteam = new Map(
      members
        .filter((m) => m.steamId)
        .map((m) => [m.steamId, m.rpName || m.discordUsername || null])
    );

    // Build response items
    const items = allTimeData.map((row) => {
      const totalDeposits = Number(row.totalDeposits);
      const totalWithdrawals = Number(row.totalWithdrawals);
      const balance = totalDeposits - totalWithdrawals;
      const debt = Math.max(0, -balance);

      return {
        steamId: row.steamId,
        rpName: rpBySteam.get(row.steamId) || null,
        totalDepositsAllTime: totalDeposits,
        totalWithdrawalsAllTime: totalWithdrawals,
        balanceAllTime: balance,
        debtGlobal: debt,
      };
    });

    return NextResponse.json({
      ok: true,
      items,
    });
  } catch (error) {
    console.error("[stats/bank/global]", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
