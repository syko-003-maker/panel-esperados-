/**
 * Lecture paginée des banklog en DB via Prisma.$queryRaw.
 * LEFT JOIN Member pour récupérer rpName + flags displayability.
 *
 * Extrait de app/api/banklogs/route.ts (Lot 8).
 *
 * Compat backward : `Member.familyId` peut historiquement être soit un cuid
 * soit un slug — on accepte les deux dans le JOIN.
 */

import { prisma, Prisma } from "@/lib/db";
import { FAMILY_SLUG } from "./constants";
import { buildDisplayableMemberSql } from "./displayable-member-sql";
import type { BanklogsQuery } from "./query-params";

export interface BanklogRowRaw {
  memberId: string | null;
  at: Date;
  type: number;
  money: number;
  steamId: string;
  rpName: string | null;
  discordId: string | null;
  discordDisplayName: string | null;
  discordUsername: string | null;
  isActive: boolean | null;
  isGhost: boolean | null;
  discordInGuild: boolean | null;
  missingFromLygSince: Date | null;
  grade: string | null;
  rankRoleId: string | null;
  rankLabel: string | null;
  discordRoleIds: string[] | null;
}

/**
 * Construit les fragments SQL conditionnels selon les filtres query.
 * Chaque retour est `Prisma.empty` si le filtre est inactif.
 */
function buildFilters(q: BanklogsQuery): {
  type: Prisma.Sql;
  steamId: Prisma.Sql;
  member: Prisma.Sql;
  days: Prisma.Sql;
} {
  return {
    type: q.type !== null ? Prisma.sql`AND b."type" = ${q.type}` : Prisma.empty,
    steamId: q.steamId
      ? Prisma.sql`AND b."steamId" LIKE ${"%" + q.steamId + "%"}`
      : Prisma.empty,
    member: q.member
      ? Prisma.sql`AND COALESCE(m."rpName", m."discordDisplayName", m."discordUsername", '') ILIKE ${"%" + q.member + "%"}`
      : Prisma.empty,
    days:
      q.days > 0
        ? Prisma.sql`AND b."at" >= ${new Date(Date.now() - q.days * 24 * 60 * 60 * 1000)}`
        : Prisma.empty,
  };
}

export async function fetchBanklogsPage(params: {
  familyDbId: string;
  query: BanklogsQuery;
}): Promise<{ items: BanklogRowRaw[]; total: number }> {
  const { familyDbId, query } = params;
  const skip = (query.page - 1) * query.limit;
  const f = buildFilters(query);
  const displayableMemberSql = buildDisplayableMemberSql();

  const itemsRaw = await prisma.$queryRaw<BanklogRowRaw[]>`
    SELECT
      m."id" AS "memberId",
      b."at" AS "at",
      b."type" AS "type",
      b."money" AS "money",
      b."steamId" AS "steamId",
      m."rpName" AS "rpName",
      m."discordId" AS "discordId",
      m."discordDisplayName" AS "discordDisplayName",
      m."discordUsername" AS "discordUsername",
      m."isActive" AS "isActive",
      COALESCE(m."isGhost", false) AS "isGhost",
      m."discordInGuild" AS "discordInGuild",
      m."missingFromLygSince" AS "missingFromLygSince",
      m."grade" AS "grade",
      m."rankRoleId" AS "rankRoleId",
      m."rankLabel" AS "rankLabel",
      m."discordRoleIds" AS "discordRoleIds"
    FROM "BankLog" b
    LEFT JOIN "Member" m
      ON m."steamId" = b."steamId"
      AND (m."familyId" = ${familyDbId} OR m."familyId" = ${FAMILY_SLUG})
    WHERE b."familyId" = ${familyDbId}
      ${f.type}
      ${f.steamId}
      ${f.member}
      ${f.days}
      AND ${displayableMemberSql}
    ORDER BY b."at" DESC
    LIMIT ${query.limit}
    OFFSET ${skip}
  `;

  const totalRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
    SELECT COUNT(*)::bigint AS count
    FROM "BankLog" b
    LEFT JOIN "Member" m
      ON m."steamId" = b."steamId"
      AND (m."familyId" = ${familyDbId} OR m."familyId" = ${FAMILY_SLUG})
    WHERE b."familyId" = ${familyDbId}
      ${f.type}
      ${f.steamId}
      ${f.member}
      ${f.days}
      AND ${displayableMemberSql}
  `;

  const total = Number(totalRows?.[0]?.count ?? 0);
  return { items: itemsRaw, total };
}
