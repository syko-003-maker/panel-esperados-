import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";

type DebtRowRaw = {
  memberId: string | null;
  steamId: string;
  discordId: string | null;
  rpName: string | null;
  net: bigint;
  lastAt: Date | null;
};

export type DebtRow = {
  memberId: string | null;
  steamId: string;
  discordId: string | null;
  rpName: string | null;
  net: number;
  deficitAmount: number;
  lastAt: Date | null;
};

const NET_EXPR = Prisma.sql`
  SUM(CASE WHEN b."type" = 2 THEN b."money" ELSE -b."money" END)
`;

export async function getDebtRows(params: {
  familyId: string;
  threshold?: number;
  limit?: number;
  onlyLinked?: boolean;
}) {
  const threshold = Number.isFinite(params.threshold) ? Number(params.threshold) : 0;
  const limit = params.limit && params.limit > 0 ? params.limit : 0;

  const havingClause =
    threshold > 0
      ? Prisma.sql`HAVING ${NET_EXPR} <= ${-threshold}`
      : Prisma.sql`HAVING ${NET_EXPR} < 0`;

  const limitClause = limit > 0 ? Prisma.sql`LIMIT ${limit}` : Prisma.empty;
  const linkedClause = params.onlyLinked ? Prisma.sql`AND m."id" IS NOT NULL` : Prisma.empty;

  const rows = await prisma.$queryRaw<DebtRowRaw[]>`
    SELECT
      m."id" AS "memberId",
      b."steamId" AS "steamId",
      m."discordId" AS "discordId",
      m."rpName" AS "rpName",
      ${NET_EXPR} AS "net",
      MAX(b."at") AS "lastAt"
    FROM "BankLog" b
    LEFT JOIN "Member" m
      ON m."steamId" = b."steamId"
      AND m."familyId" = b."familyId"
    WHERE b."familyId" = ${params.familyId}
    ${linkedClause}
    GROUP BY m."id", m."discordId", m."rpName", b."steamId"
    ${havingClause}
    ORDER BY ${NET_EXPR} ASC
    ${limitClause}
  `;

  return rows.map((row) => {
    const net = Number(row.net);
    return {
      memberId: row.memberId,
      steamId: row.steamId,
      discordId: row.discordId,
      rpName: row.rpName,
      net,
      deficitAmount: Math.abs(net),
      lastAt: row.lastAt,
    };
  });
}

export async function getMemberDebt(params: { familyId: string; memberId: string }) {
  const member = await prisma.member.findUnique({
    where: { id: params.memberId },
    select: { id: true, steamId: true, discordId: true, rpName: true, familyId: true },
  });
  if (!member || !member.steamId) {
    return { ok: false, error: "MEMBER_NOT_LINKED", member: null };
  }

  const rows = await prisma.$queryRaw<{ net: bigint | null; lastAt: Date | null }[]>`
    SELECT
      SUM(CASE WHEN "type" = 2 THEN "money" ELSE - "money" END) AS "net",
      MAX("at") AS "lastAt"
    FROM "BankLog"
    WHERE "familyId" = ${params.familyId}
      AND "steamId" = ${member.steamId}
  `;

  const net = rows[0]?.net ? Number(rows[0].net) : 0;
  const lastAt = rows[0]?.lastAt ?? null;
  const deficitAmount = Math.abs(Math.min(net, 0));

  return {
    ok: net < 0,
    net,
    deficitAmount,
    lastAt,
    member,
  };
}
