import { NextResponse } from "next/server";

/**
 * Route legacy désactivée : doublon de /api/staff/recruitment/[id]/decide
 * sans vérification de claim ni journal d'audit, qui permettait à tout
 * recruteur de valider n'importe quel ticket (et déclencher la WL).
 * Le front n'a aucun appelant vers cette route.
 */
export async function POST() {
  return NextResponse.json({ ok: false, error: "ENDPOINT_DISABLED" }, { status: 410 });
}
