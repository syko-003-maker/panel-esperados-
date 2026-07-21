import { prisma } from "@/lib/db";
import type { SeriesPoint } from "./bank-series";

export type PlaytimeSeries = {
  points: SeriesPoint[];
  /** Nombre de points (réunions). L'UI affiche "pas assez" tant que < 2. */
  count: number;
};

/**
 * Série d'évolution du playtime HEBDOMADAIRE, depuis les réunions finalisées
 * (`MeetingRow.playtimeMinutes` daté par `Meeting.meetingDate`, status FINAL).
 *
 * Chaque réunion (hebdo) enregistre le temps de jeu de la semaine → on obtient
 * tout l'historique du membre « depuis son entrée » (sa 1ʳᵉ réunion) et on voit
 * clairement les périodes de forte/faible activité. Bien plus parlant que le
 * playtime7d glissant (qui, lui, n'a pas d'historique daté).
 *
 * - `memberId` fourni → playtime du membre à chaque réunion.
 * - `memberId` absent → SOMME du playtime famille par réunion.
 */
export async function getPlaytimeSeries(opts: {
  familyDbId: string;
  memberId?: string | null;
}): Promise<PlaytimeSeries> {
  const { familyDbId, memberId } = opts;

  const rows =
    memberId != null && memberId !== ""
      ? await prisma.$queryRaw<Array<{ d: Date; v: bigint }>>`
          SELECT m."meetingDate" AS d, r."playtimeMinutes"::bigint AS v
          FROM "MeetingRow" r
          JOIN "Meeting" m ON m.id = r."meetingId"
          WHERE r."memberId" = ${memberId} AND m.status = 'FINAL'
          ORDER BY m."meetingDate" ASC
        `
      : await prisma.$queryRaw<Array<{ d: Date; v: bigint }>>`
          SELECT m."meetingDate" AS d, SUM(r."playtimeMinutes")::bigint AS v
          FROM "MeetingRow" r
          JOIN "Meeting" m ON m.id = r."meetingId"
          WHERE m."familyId" = ${familyDbId} AND m.status = 'FINAL'
          GROUP BY m."meetingDate"
          ORDER BY m."meetingDate" ASC
        `;

  const points: SeriesPoint[] = rows.map((r) => ({
    t: new Date(r.d).getTime(),
    v: Number(r.v),
  }));
  return { points, count: points.length };
}
