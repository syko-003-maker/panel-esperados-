/**
 * Helpers pour classer / filtrer / trier les rows de la response /api/staff/members.
 * Fonctions pures : prennent un StaffMemberDto en entrée.
 *
 * Extrait de app/api/staff/members/route.ts (Lot 7).
 */

import type { StaffMemberDto } from "@/types/staff";
import { getDiscordGradeMappings } from "@/lib/discord-grade";
import type { MembersSortBy, MembersSortDir } from "./query-params";

export type RowStatus = "active" | "demoted" | "blacklisted" | "non_link" | "reservist";

/**
 * Map nom de grade (lowercase) → niveau hiérarchique.
 * Les grades les plus hauts ont les plus grands niveaux.
 * Construit une seule fois au module load.
 */
const GRADE_LEVEL_BY_NAME = new Map(
  getDiscordGradeMappings().map((entry, index, arr) => [
    entry.grade.toLowerCase(),
    arr.length - index,
  ])
);

export function getRowStatus(row: StaffMemberDto): RowStatus {
  const grade = row.currentGradeName ?? "";
  if (grade === "Blacklist") return "blacklisted";
  if (grade === "Demote") return "demoted";
  if (grade === "Réserviste" || grade === "Reservist") return "reservist";
  if (!row.discordId) return "non_link";
  return "active";
}

export function matchesSearch(row: StaffMemberDto, search: string): boolean {
  if (!search) return true;
  const needle = search.toLowerCase();
  return [row.rpName, row.steamId, row.discordId]
    .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    .some((value) => value.toLowerCase().includes(needle));
}

const STATUS_ORDER = { active: 0, blacklisted: 1, reservist: 2, demoted: 3, non_link: 4 } as const;

export function compareRows(
  a: StaffMemberDto,
  b: StaffMemberDto,
  sortBy: MembersSortBy,
  sortDir: MembersSortDir
): number {
  const direction = sortDir === "desc" ? -1 : 1;

  switch (sortBy) {
    case "grade": {
      const levelA = GRADE_LEVEL_BY_NAME.get((a.currentGradeName ?? "").toLowerCase()) ?? -1;
      const levelB = GRADE_LEVEL_BY_NAME.get((b.currentGradeName ?? "").toLowerCase()) ?? -1;
      if (levelA !== levelB) return direction * (levelA - levelB);
      break;
    }
    case "playtime7d": {
      const playtimeA = typeof a.playtime7d === "number" ? a.playtime7d : 0;
      const playtimeB = typeof b.playtime7d === "number" ? b.playtime7d : 0;
      if (playtimeA !== playtimeB) return direction * (playtimeA - playtimeB);
      break;
    }
    case "status": {
      const statusA = STATUS_ORDER[getRowStatus(a)];
      const statusB = STATUS_ORDER[getRowStatus(b)];
      if (statusA !== statusB) return direction * (statusA - statusB);
      break;
    }
    case "name":
    default:
      break;
  }

  // Fallback : tri alphabétique stable sur rpName (locale FR)
  return (a.rpName ?? "").localeCompare(b.rpName ?? "", "fr");
}

/**
 * Tri stable de l'array via sort + index secondaire (préserve l'ordre d'origine
 * pour les égalités).
 */
export function sortRowsStable(
  rows: StaffMemberDto[],
  sortBy: MembersSortBy,
  sortDir: MembersSortDir
): StaffMemberDto[] {
  return rows
    .map((row, index) => ({ row, index }))
    .sort((left, right) => {
      const result = compareRows(left.row, right.row, sortBy, sortDir);
      return result !== 0 ? result : left.index - right.index;
    })
    .map(({ row }) => row);
}
