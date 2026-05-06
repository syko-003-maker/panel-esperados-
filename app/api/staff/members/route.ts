import { NextResponse } from "next/server";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { jsonError } from "@/lib/api-errors";
import { prisma } from "@/lib/db";
import { logError } from "@/lib/obs";
import type { StaffMemberDto } from "@/types/staff";
import { ensureFreshFamilyPlaytime } from "@/lib/staff/ensure-fresh-playtime";
import { getAvatarHashesFast, warmAvatarCache } from "@/lib/discord/avatar-cache";

import { parseMembersQuery, makeCacheKey } from "@/lib/staff/members/query-params";
import { fetchMembersForFamily } from "@/lib/staff/members/fetch-members";
import {
  normalizeMember,
  sortNormalizedByGradeAndName,
  type NormalizedMember,
} from "@/lib/staff/members/member-normalize";
import { buildStaffMemberRow } from "@/lib/staff/members/build-row";
import { loadPreviousWeekPlaytime } from "@/lib/staff/members/playtime-history";
import { enrichRowsWithActiveAbsences } from "@/lib/staff/members/active-absences";
import { matchesSearch, sortRowsStable } from "@/lib/staff/members/row-status";
import {
  acquireFlight,
  lookupCache,
  storeInCache,
} from "@/lib/staff/members/response-cache";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

/**
 * GET /api/staff/members
 *
 * Route orchestrateur fin (post Lot 7) — toute la logique métier est dans
 * src/lib/staff/members/. Cette route fait :
 *   1. Auth (requireChefOrEtatMajor)
 *   2. Parse query params
 *   3. Cache lookup + coalescing (tt 15s)
 *   4. Fetch members + normalisation + filtrage scope
 *   5. Enrichissement (avatars, playtime history, active absences)
 *   6. Build DTOs + tri + search + slice limit
 *   7. NextResponse.json
 *
 * Le shape de la réponse est inchangé depuis la version monolithique :
 *   { ok: true, rows: StaffMemberDto[], meta: { ... } }
 *   { ok: true, familyId, count } si countOnly=1
 */
export async function GET(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  // Variables hoistées hors du try pour cleanup en cas d'exception
  let cacheKey: string | null = null;
  let finishFlight: ((payload: unknown, err?: unknown) => void) | null = null;

  try {
    const url = new URL(req.url);
    const query = parseMembersQuery(url);
    cacheKey = makeCacheKey(query);

    // ── Cache + coalescing ────────────────────────────────────────────
    const cacheLookup = lookupCache(cacheKey);
    if (cacheLookup.hit) {
      return NextResponse.json(cacheLookup.payload);
    }
    if (cacheLookup.inFlight) {
      return NextResponse.json(await cacheLookup.inFlight);
    }
    const flight = acquireFlight(cacheKey);
    finishFlight = flight.finish;

    // ── Famille ───────────────────────────────────────────────────────
    const family = await prisma.family.findUnique({
      where: { slug: query.familySlug },
      select: { id: true },
    });
    if (!family) {
      return jsonError(404, "FAMILY_NOT_FOUND", "Family not found", { rows: [] });
    }

    await ensureFreshFamilyPlaytime(query.familySlug);

    // ── Fetch members + normalisation + filtre scope ──────────────────
    const members = await fetchMembersForFamily({
      familyId: family.id,
      familySlug: query.familySlug,
      includeInactive: query.includeInactive,
    });

    const normalizedMembers = sortNormalizedByGradeAndName(
      members
        .map((m) => normalizeMember(m, query.scope))
        .filter((m): m is NormalizedMember => m !== null)
    );

    // ── countOnly : early return ──────────────────────────────────────
    if (query.countOnly) {
      const payload = {
        ok: true,
        familyId: query.familySlug,
        count: normalizedMembers.length,
      };
      storeInCache(cacheKey, payload);
      finishFlight(payload);
      return NextResponse.json(payload);
    }

    // ── Enrichissement : history playtime ─────────────────────────────
    const memberIds = normalizedMembers.map((m) => m.id);
    const { previousWeekMap, analyticsAvailable, historyReadFailed, historyModelAvailable } =
      await loadPreviousWeekPlaytime({ memberIds, familySlug: query.familySlug });

    // ── Enrichissement : avatars Discord (cache rapide + warming bg) ──
    const discordIds = Array.from(
      new Set(
        normalizedMembers
          .map((m) => m.discordId)
          .filter((id): id is string => typeof id === "string" && id.trim() !== "")
      )
    );
    const avatarHashByDiscordId =
      discordIds.length > 0
        ? await getAvatarHashesFast(discordIds)
        : new Map<string, string | null>();
    if (discordIds.length > 0) warmAvatarCache(discordIds);

    // ── Build rows ────────────────────────────────────────────────────
    const rows: StaffMemberDto[] = normalizedMembers.map((m) =>
      buildStaffMemberRow(m, avatarHashByDiscordId, previousWeekMap)
    );

    // ── Enrichissement : absences actives ─────────────────────────────
    await enrichRowsWithActiveAbsences({ rows, familyId: family.id });

    // ── Search + tri stable + slice ───────────────────────────────────
    const filteredRows = rows.filter((row) => matchesSearch(row, query.search));
    const sortedRows = sortRowsStable(filteredRows, query.sortBy, query.sortDir).slice(0, query.limit);

    // ── Réponse finale (shape inchangé, à ne pas modifier) ────────────
    const finalPayload = {
      ok: true,
      rows: sortedRows,
      meta: {
        scope: query.scope,
        sortBy: query.sortBy,
        sortDir: query.sortDir,
        limit: query.limit,
        search: query.search,
        analyticsAvailable,
        historyReadFailed,
        historyModelAvailable,
      },
    };

    storeInCache(cacheKey, finalPayload);
    finishFlight(finalPayload);
    return NextResponse.json(finalPayload);
  } catch (error) {
    if (finishFlight) finishFlight(null, error);
    logError("staff_members_failed", { path: "/api/staff/members" }, error);
    return jsonError(500, "INTERNAL_ERROR", "Failed to load staff members", { rows: [] });
  }
}
