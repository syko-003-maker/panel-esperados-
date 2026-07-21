export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { getBankBalanceSeries } from "@/lib/series/bank-series";
import { getPlaytimeSeries } from "@/lib/series/playtime-series";

/**
 * GET /api/member/series
 * Séries d'évolution du membre connecté : argent (solde coffre) + playtime.
 */
export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const scope = await getMemberScopeOrNull(session);
  if (!scope) {
    return NextResponse.json({ ok: false, code: "MEMBER_NOT_LINKED" }, { status: 403 });
  }

  const { steamId, memberId } = scope;
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);

  // La courbe playtime = historique HEBDO des réunions finalisées (semaines
  // passées) → elle ne révèle pas la semaine en cours, donc pas de masquage
  // week-end ici (le nombre "cette semaine" du dashboard, lui, reste masqué).
  const [moneyPoints, playtime] = await Promise.all([
    getBankBalanceSeries({ familyDbId, familySlug: DEFAULT_FAMILY_ID, steamId }),
    getPlaytimeSeries({ familyDbId, memberId }),
  ]);

  return NextResponse.json({
    ok: true,
    money: { points: moneyPoints, unit: "€" },
    playtime: { points: playtime.points, unit: "min", count: playtime.count },
  });
}
