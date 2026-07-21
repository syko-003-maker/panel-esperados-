import { prisma } from "@/lib/db";

/** Un point de série temporelle : `t` = epoch ms, `v` = valeur. */
export type SeriesPoint = { t: number; v: number };

/**
 * Série d'évolution du solde bancaire (cumulé signé), agrégée par jour.
 *
 * Solde = SUM(type=2 → +money, sinon → −money) — identique au calcul de dette
 * (`src/lib/bank-debts.ts`). Seuls les types 1 (retrait) et 2 (dépôt) existent.
 * On cumule les deltas journaliers dans l'ordre chronologique → courbe du solde.
 *
 * - `steamId` fourni  → solde d'UN membre (sa contribution nette au coffre).
 * - `steamId` absent  → solde de TOUTE la famille (coffre global).
 *
 * ⚠️ `BankLog.familyId` contient historiquement soit l'id (cuid) soit le slug
 * ("esperados") — on matche les deux, comme /api/staff/stats/bank/global.
 */
export async function getBankBalanceSeries(opts: {
  familyDbId: string;
  familySlug: string;
  steamId?: string | null;
}): Promise<SeriesPoint[]> {
  const { familyDbId, familySlug, steamId } = opts;

  const rows =
    steamId != null && steamId !== ""
      ? await prisma.$queryRaw<Array<{ day: Date; delta: bigint }>>`
          SELECT date_trunc('day', "at") AS day,
                 SUM(CASE WHEN "type" = 2 THEN "money" ELSE -"money" END)::bigint AS delta
          FROM "BankLog"
          WHERE ("familyId" = ${familyDbId} OR "familyId" = ${familySlug})
            AND "steamId" = ${steamId}
          GROUP BY day
          ORDER BY day ASC
        `
      : await prisma.$queryRaw<Array<{ day: Date; delta: bigint }>>`
          SELECT date_trunc('day', "at") AS day,
                 SUM(CASE WHEN "type" = 2 THEN "money" ELSE -"money" END)::bigint AS delta
          FROM "BankLog"
          WHERE ("familyId" = ${familyDbId} OR "familyId" = ${familySlug})
          GROUP BY day
          ORDER BY day ASC
        `;

  let cumulative = 0;
  const points: SeriesPoint[] = [];
  for (const r of rows) {
    cumulative += Number(r.delta);
    points.push({ t: new Date(r.day).getTime(), v: cumulative });
  }
  return points;
}
