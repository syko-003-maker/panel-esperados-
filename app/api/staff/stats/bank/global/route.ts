/**
 * GET /api/staff/stats/bank/global
 * Retourne top positif (balance > 0) par steamId
 * - Utilise UNIQUEMENT steamId comme clé
 * - Calcul: balance = SUM(type=2) - SUM(type=1)
 * - Filtre: family.id OR family.slug  
 * - Membre fallback si non trouvé
 */

export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  try {

    const familySlug = request.nextUrl.searchParams.get("familyId") ?? "esperados";
    // Check auth
    const guard = await requirePermission("STATS_VIEW");
    if (guard instanceof Response) {
      return guard;
    }

    // Get family by slug
    const family = await prisma.family.findUnique({
      where: { slug: familySlug },
      select: { id: true, slug: true },
    });

    if (!family) {
      return NextResponse.json({ ok: false, error: "Family not found" }, { status: 404 });
    }

    console.log(`[bank/global] Query for: ${family.slug} (id=${family.id})`);

    // Aggregate credits (type=2) and debits (type=1) by steamId
    const allTimeData = await prisma.$queryRaw<Array<{
      steamId: string;
      totalCredits: bigint;
      totalDebits: bigint;
    }>>`
      SELECT
        "steamId",
        SUM(CASE WHEN "type" = 2 THEN "money" ELSE 0 END)::bigint AS "totalCredits",
        SUM(CASE WHEN "type" = 1 THEN "money" ELSE 0 END)::bigint AS "totalDebits"
      FROM "BankLog"
      WHERE ("familyId" = ${family.id} OR "familyId" = ${family.slug})
        AND "steamId" IS NOT NULL
        AND "steamId" <> ''
      GROUP BY "steamId"
    `;

    console.log(`[bank/global] Found ${allTimeData.length} users with transactions`);

    // Map steamIds to member info  
    const steamIds = allTimeData.map(r => r.steamId);
    const members = steamIds.length > 0
      ? await prisma.member.findMany({
          where: { steamId: { in: steamIds } },
          select: { steamId: true, rpName: true, discordUsername: true },
          take: 2000,
        })
      : [];

    const rpMap = new Map(
      members
        .filter(m => m.steamId)
        .map(m => [m.steamId, m.rpName || m.discordUsername])
    );

    // Build items with balance calculation
    const items = allTimeData.map(row => {
      const credits = Number(row.totalCredits);
      const debits = Number(row.totalDebits);
      const balance = credits - debits;

      return {
        steamId: row.steamId,
        rpName: rpMap.get(row.steamId) || null,
        totalCreditsAllTime: credits,
        totalDebitsAllTime: debits,
        balanceAllTime: balance,
        usdGlobal: Math.max(0, -balance),  // Display compatibility
      };
    });

    // Filter positifs (balance > 0) and sort descending
    const positifs = items
      .filter(x => x.balanceAllTime > 0)
      .sort((a, b) => b.balanceAllTime - a.balanceAllTime);

    console.log(`[bank/global] Result: totalItems=${items.length}, positifs=${positifs.length}`);

    return NextResponse.json({
      ok: true,
      family: { id: family.id, slug: family.slug },
      summary: {
        total: items.length,
        positifs: positifs.length,
        negatifs: items.length - positifs.length,
      },
      items,
      positifs,
    });
  } catch (error) {
    console.error("[bank/global] ERROR:", error);
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : "Unknown error",
    }, { status: 500 });
  }
}
