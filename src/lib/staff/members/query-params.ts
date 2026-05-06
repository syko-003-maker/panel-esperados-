/**
 * Parsing des query params de /api/staff/members.
 * Fonctions pures : pas de Prisma, pas d'auth, juste validation.
 *
 * Extrait de app/api/staff/members/route.ts (Lot 7).
 */

export type MembersScope =
  | "active"
  | "all"
  | "demoted"
  | "non_link"
  | "blacklisted"
  | "reservists"
  | "everything";

export type MembersSortBy = "name" | "grade" | "playtime7d" | "status";
export type MembersSortDir = "asc" | "desc";

export const MAX_SEARCH_LENGTH = 120;

export function parseScope(raw: string | null): MembersScope {
  if (
    raw === "all" ||
    raw === "demoted" ||
    raw === "non_link" ||
    raw === "blacklisted" ||
    raw === "reservists" ||
    raw === "everything"
  ) {
    return raw;
  }
  return "active";
}

export function parseSortBy(raw: string | null): MembersSortBy {
  if (raw === "grade" || raw === "playtime7d" || raw === "status") return raw;
  return "name";
}

export function parseSortDir(raw: string | null): MembersSortDir {
  return raw === "desc" ? "desc" : "asc";
}

export function parseLimit(raw: string | null): number {
  const parsed = Number.parseInt(raw ?? "200", 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 200;
  }
  return Math.min(parsed, 500);
}

export function sanitizeSearch(raw: string | null): string {
  return (raw ?? "").trim().slice(0, MAX_SEARCH_LENGTH);
}

/**
 * Bundle parse complet pour usage centralisé dans la route.
 */
export interface ParsedMembersQuery {
  familySlug: string;
  scope: MembersScope;
  countOnly: boolean;
  search: string;
  sortBy: MembersSortBy;
  sortDir: MembersSortDir;
  limit: number;
  includeInactive: boolean;
}

export function parseMembersQuery(url: URL): ParsedMembersQuery {
  const familySlug = url.searchParams.get("familyId") ?? "esperados";
  const scope = parseScope(url.searchParams.get("scope"));
  const countOnly = url.searchParams.get("countOnly") === "1";
  const search = sanitizeSearch(url.searchParams.get("search") ?? url.searchParams.get("q"));
  const sortBy = parseSortBy(url.searchParams.get("sortBy"));
  const sortDir = parseSortDir(url.searchParams.get("sortDir"));
  const limit = parseLimit(url.searchParams.get("limit"));
  const includeInactive = scope !== "active";

  return { familySlug, scope, countOnly, search, sortBy, sortDir, limit, includeInactive };
}

/**
 * Clé de cache déterministe (utilisée par response-cache).
 * Ne pas inclure includeInactive (dérivé de scope).
 */
export function makeCacheKey(q: ParsedMembersQuery): string {
  return JSON.stringify({
    familySlug: q.familySlug,
    scope: q.scope,
    countOnly: q.countOnly,
    search: q.search,
    sortBy: q.sortBy,
    sortDir: q.sortDir,
    limit: q.limit,
  });
}
