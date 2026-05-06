/**
 * Fragment Prisma.Sql qui filtre les rows de banklog dont le `Member` joint
 * (LEFT JOIN) est "displayable" (pas démote/blacklist/réserviste, présent
 * en guild, pas missingFromLyg, etc.).
 *
 * Couvre AUSSI le cas "pas de member joint" (m.id IS NULL) : la row reste
 * incluse — sera affichée comme "Non lié" côté UI.
 *
 * Cohérent avec isDisplayableStaffMember côté JS (src/lib/staff/member-scope.ts).
 *
 * Extrait de app/api/banklogs/route.ts (Lot 8).
 */

import { Prisma } from "@/lib/db";
import { BLACKLIST_ROLE_ID, RESERVIST_ROLE_ID } from "@/lib/discord-grade";
import { DEMOTE_ROLE_ID } from "@/lib/discord-rbac";

export function buildDisplayableMemberSql(): Prisma.Sql {
  return Prisma.sql`
    (
      m."id" IS NULL
      OR (
        m."isActive" = true
        AND COALESCE(m."isGhost", false) = false
        AND (m."discordId" IS NULL OR m."discordInGuild" IS DISTINCT FROM false)
        AND m."missingFromLygSince" IS NULL
        AND NOT (
          COALESCE(m."rankRoleId", '') = ${DEMOTE_ROLE_ID}
          OR ${DEMOTE_ROLE_ID} = ANY(COALESCE(m."discordRoleIds", ARRAY[]::text[]))
          OR LOWER(COALESCE(m."grade", '')) LIKE '%demote%'
          OR LOWER(COALESCE(m."rankLabel", '')) LIKE '%demote%'
          OR ${BLACKLIST_ROLE_ID} = ANY(COALESCE(m."discordRoleIds", ARRAY[]::text[]))
          OR LOWER(COALESCE(m."grade", '')) LIKE '%blacklist%'
          OR LOWER(COALESCE(m."rankLabel", '')) LIKE '%blacklist%'
          OR COALESCE(m."rankRoleId", '') = ${RESERVIST_ROLE_ID}
          OR ${RESERVIST_ROLE_ID} = ANY(COALESCE(m."discordRoleIds", ARRAY[]::text[]))
          OR LOWER(COALESCE(m."grade", '')) LIKE '%réserviste%'
          OR LOWER(COALESCE(m."grade", '')) LIKE '%reserviste%'
          OR LOWER(COALESCE(m."grade", '')) LIKE '%reservist%'
          OR LOWER(COALESCE(m."rankLabel", '')) LIKE '%réserviste%'
          OR LOWER(COALESCE(m."rankLabel", '')) LIKE '%reserviste%'
          OR LOWER(COALESCE(m."rankLabel", '')) LIKE '%reservist%'
        )
      )
    )
  `;
}
