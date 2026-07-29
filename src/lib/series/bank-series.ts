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
// Le farm (categories "production" et "genetics") est exclu : la courbe
// montre ce que le membre a verse a la FAMILLE, pas tout l'argent qu'il a
// brasse. Meme regle que le calcul des dettes, pour que les deux concordent.
// Les lignes sans categorie datent d'avant ce champ : traitees comme "bank".
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
                 SUM(CASE WHEN COALESCE("raw"->>'category', 'bank') = 'bank'
                          THEN (CASE WHEN "type" = 2 THEN "money" ELSE -"money" END)
                          ELSE 0 END)::bigint AS delta
          FROM "BankLog"
          WHERE ("familyId" = ${familyDbId} OR "familyId" = ${familySlug})
            AND "steamId" = ${steamId}
          GROUP BY day
          ORDER BY day ASC
        `
      : await prisma.$queryRaw<Array<{ day: Date; delta: bigint }>>`
          SELECT date_trunc('day', "at") AS day,
                 SUM(CASE WHEN COALESCE("raw"->>'category', 'bank') = 'bank'
                          THEN (CASE WHEN "type" = 2 THEN "money" ELSE -"money" END)
                          ELSE 0 END)::bigint AS delta
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
