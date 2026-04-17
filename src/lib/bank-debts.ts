import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { GRADE_ROLE_IDS_ORDERED } from "@/lib/grade-colors";

type DebtRowRaw = {
  memberId: string | null;
  steamId: string;
  discordId: string | null;
  rpName: string | null;
  discordRoleIds: string[] | null;
  net: bigint;
  lastAt: Date | null;
};

export type DebtRow = {
  memberId: string | null;
  steamId: string;
  discordId: string | null;
  rpName: string | null;
  grade: string | null;
  gradeLevel: number;
  net: number;
  deficitAmount: number;
  lastAt: Date | null;
};

const NET_EXPR = Prisma.sql`
  SUM(CASE WHEN b."type" = 2 THEN b."money" ELSE -b."money" END)
`;

// Rôles qui excluent un membre du module de dettes (démote, blacklist, réserviste)
const EXCLUDED_DEBT_ROLE_IDS = [
  "1340837563753304075", // DEMOTE
  "1338901141873758288", // BLACKLIST
  "1312845999366209682", // RESERVISTE
] as const;

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

  // Restreindre aux membres actifs de la famille :
  //   - isActive = true
  //   - pas de rôle démote / blacklist / réserviste dans discordRoleIds
  // La condition isActive exclut aussi implicitement les lignes sans membre lié
  // (LEFT JOIN → NULL = true est false en PostgreSQL).
  const rows = await prisma.$queryRaw<DebtRowRaw[]>`
    SELECT
      m."id" AS "memberId",
      b."steamId" AS "steamId",
      m."discordId" AS "discordId",
      m."rpName" AS "rpName",
      m."discordRoleIds" AS "discordRoleIds",
      ${NET_EXPR} AS "net",
      MAX(b."at") AS "lastAt"
    FROM "BankLog" b
    LEFT JOIN "Member" m
      ON m."steamId" = b."steamId"
      AND m."familyId" = b."familyId"
    WHERE b."familyId" = ${params.familyId}
      AND m."isActive" = true
      AND (m."discordInGuild" IS NULL OR m."discordInGuild" = true)
      AND (
        m."discordRoleIds" IS NULL
        OR NOT (m."discordRoleIds" && ARRAY[${Prisma.join(EXCLUDED_DEBT_ROLE_IDS)}]::text[])
      )
    GROUP BY m."id", m."discordId", m."rpName", m."discordRoleIds", b."steamId"
    ${havingClause}
    ${limitClause}
  `;

  // Résoudre le grade depuis les rôles Discord pour chaque membre
  function resolveGrade(roleIds: string[] | null): { grade: string | null; level: number } {
    if (!roleIds || roleIds.length === 0) return { grade: null, level: -1 };
    const roleSet = new Set(roleIds);
    for (let i = 0; i < GRADE_ROLE_IDS_ORDERED.length; i++) {
      if (roleSet.has(GRADE_ROLE_IDS_ORDERED[i])) {
        return { grade: GRADE_ROLE_IDS_ORDERED[i], level: GRADE_ROLE_IDS_ORDERED.length - i };
      }
    }
    return { grade: null, level: -1 };
  }

  const mapped = rows.map((row) => {
    const net = Number(row.net);
    const { grade, level } = resolveGrade(row.discordRoleIds);
    return {
      memberId: row.memberId,
      steamId: row.steamId,
      discordId: row.discordId,
      rpName: row.rpName,
      grade,
      gradeLevel: level,
      net,
      deficitAmount: Math.abs(net),
      lastAt: row.lastAt,
    };
  });

  // Tri : grade descendant (plus haut grade d'abord), puis nom RP alphabétique
  mapped.sort((a, b) => {
    if (a.gradeLevel !== b.gradeLevel) return b.gradeLevel - a.gradeLevel;
    return (a.rpName ?? "").localeCompare(b.rpName ?? "", "fr");
  });

  return mapped;
}

export async function getMemberDebt(params: { familyId: string; memberId: string }) {
  const member = await prisma.member.findUnique({
    where: { id: params.memberId },
    select: {
      id: true,
      steamId: true,
      discordId: true,
      rpName: true,
      familyId: true,
      isActive: true,
      discordRoleIds: true,
    },
  });
  if (!member || !member.steamId) {
    return { ok: false, error: "MEMBER_NOT_LINKED", member: null };
  }
  if (!member.isActive) {
    return { ok: false, error: "MEMBER_INACTIVE", member: null };
  }
  // Exclure les membres démote / blacklist / réserviste
  const hasExcludedRole = member.discordRoleIds?.some((id) =>
    (EXCLUDED_DEBT_ROLE_IDS as readonly string[]).includes(id)
  );
  if (hasExcludedRole) {
    return { ok: false, error: "MEMBER_INELIGIBLE", member: null };
  }

  const rows = await prisma.$queryRaw<{ net: bigint | null; lastAt: Date | null }[]>`
    SELECT
      SUM(CASE WHEN "type" = 2 THEN "money" ELSE -"money" END) AS "net",
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
