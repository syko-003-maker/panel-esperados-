/**
 * Parsing des query params de /api/banklogs (GET).
 * Pure : prend une URL, retourne un BanklogsQuery validé.
 *
 * Extrait de app/api/banklogs/route.ts (Lot 8).
 */

export interface BanklogsQuery {
  page: number;
  limit: number;
  type: number | null; // 1 = withdrawal, 2 = deposit (LYG convention)
  steamId: string;
  member: string;
  days: number; // 0 = pas de filtre temporel, sinon N derniers jours
}

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;
const MIN_LIMIT = 1;

export function parseBanklogsQuery(url: URL): BanklogsQuery {
  const sp = url.searchParams;

  const pageRaw = Number(sp.get("page") ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;

  const limitRaw = Number(sp.get("limit") ?? String(DEFAULT_LIMIT));
  const limit = Math.min(
    Math.max(Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT, MIN_LIMIT),
    MAX_LIMIT
  );

  const typeRaw = sp.get("type");
  const typeParsed = typeRaw ? Number(typeRaw) : NaN;
  const type = Number.isFinite(typeParsed) ? typeParsed : null;

  const steamId = (sp.get("steamId") ?? "").trim();
  const member = (sp.get("member") ?? "").trim();

  const daysRaw = Number(sp.get("days") ?? "0");
  const days = Number.isFinite(daysRaw) && daysRaw > 0 ? daysRaw : 0;

  return { page, limit, type, steamId, member, days };
}

/**
 * Clé de cache déterministe (utilisée par banklogs-cache module-level).
 * familyDbId injecté côté route après resolveFamilyId.
 */
export function makeBanklogsCacheParams(
  familyDbId: string,
  q: BanklogsQuery
): {
  familyDbId: string;
  page: number;
  limit: number;
  type: string | null;
  steamId: string | null;
  member: string | null;
  days: number | null;
} {
  return {
    familyDbId,
    page: q.page,
    limit: q.limit,
    type: q.type !== null ? String(q.type) : null,
    steamId: q.steamId || null,
    member: q.member || null,
    days: q.days > 0 ? q.days : null,
  };
}
