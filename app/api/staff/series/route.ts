export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextRequest, NextResponse } from "next/server";
import { requireStaffAccess } from "@/lib/rbac";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { getBankBalanceSeries } from "@/lib/series/bank-series";
import { getPlaytimeSeries } from "@/lib/series/playtime-series";

/**
 * GET /api/staff/series
 * - ?memberId=<id> → séries d'UN membre (fiche = Chef/État-Major)
 * - sans param     → séries de TOUTE la famille (page Stats = accès staff de base)
 * Renvoie argent (solde cumulé) + playtime. Gardes alignées sur les pages qui
 * affichent ces courbes (la page Stats n'exige PAS STATS_VIEW).
 */
export async function GET(req: NextRequest) {
  const memberId = req.nextUrl.searchParams.get("memberId");

  const guard = memberId ? await requireChefOrEtatMajor() : await requireStaffAccess();
  if (guard instanceof Response) return guard;

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);

  let steamId: string | null = null;
  let resolvedMemberId: string | null = null;
  if (memberId) {
    const m = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, steamId: true },
    });
    if (!m) {
      return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });
    }
    steamId = m.steamId;
    resolvedMemberId = m.id;
  }

  const [moneyPoints, playtime] = await Promise.all([
    getBankBalanceSeries({ familyDbId, familySlug: DEFAULT_FAMILY_ID, steamId }),
    getPlaytimeSeries({ familyDbId, memberId: resolvedMemberId }),
  ]);

  return NextResponse.json({
    ok: true,
    scope: memberId ? "member" : "family",
    money: { points: moneyPoints, unit: "€" },
    playtime: { points: playtime.points, unit: "min", count: playtime.count },
  });
}
