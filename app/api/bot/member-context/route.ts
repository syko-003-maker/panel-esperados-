/**
 * Contexte membre pour le bot Discord (feature « clap back » qui répond aux
 * questions perso : dette, grade, WL, playtime). Auth : x-ingest-secret (comme
 * les crons). Réutilise getMemberDebt pour un calcul de dette CORRECT.
 *
 * POST { discordId } → { ok, found, rpName, grade, wlClass, playtime7dMin, debt }
 * (discordId dans le body, jamais en query string.)
 */
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { resolveFamilyId } from "@/lib/family";
import { getMemberDebt } from "@/lib/bank-debts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  if (req.headers.get("x-ingest-secret") !== process.env.INGEST_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}) as Record<string, unknown>);
  const discordId = String((body as { discordId?: unknown }).discordId ?? "").trim();
  if (!discordId) {
    return NextResponse.json({ ok: false, error: "no_discordId" }, { status: 400 });
  }

  const familyId = await resolveFamilyId("esperados");
  const member = await prisma.member.findFirst({
    where: { familyId, discordId },
    select: { id: true, rpName: true, rankLabel: true, wlClass: true, playtime7d: true, steamId: true },
  });
  if (!member) {
    return NextResponse.json({ ok: true, found: false });
  }

  // Dette via la logique officielle (net = SUM signé des BankLog ; deficit = |min(net,0)|).
  let debt: { inDebt: boolean; deficit: number; net: number } | null = null;
  try {
    const d = await getMemberDebt({ familyId, memberId: member.id });
    if (d.member) debt = { inDebt: d.net < 0, deficit: d.deficitAmount, net: d.net };
  } catch {
    // non calculable → repli ci-dessous
  }

  // Repli : getMemberDebt refuse les membres inactifs / démote / réserviste
  // (règles des RAPPELS de dette). Le bot, lui, veut juste le solde → même
  // calcul, sans les règles d'éligibilité. Évite qu'il n'ait que le playtime.
  if (!debt && member.steamId) {
    const rows = await prisma.$queryRaw<{ net: bigint | null }[]>`
      SELECT SUM(CASE WHEN COALESCE("raw"->>'category', 'bank') = 'bank' THEN (CASE WHEN "type" = 2 THEN "money" ELSE -"money" END) ELSE 0 END) AS "net"
      FROM "BankLog"
      WHERE "familyId" = ${familyId} AND "steamId" = ${member.steamId}
    `;
    const net = rows[0]?.net ? Number(rows[0].net) : 0;
    debt = { inDebt: net < 0, deficit: Math.abs(Math.min(net, 0)), net };
  }

  return NextResponse.json({
    ok: true,
    found: true,
    rpName: member.rpName,
    grade: member.rankLabel,
    wlClass: member.wlClass,
    playtime7dMin: member.playtime7d,
    debt,
  });
}
