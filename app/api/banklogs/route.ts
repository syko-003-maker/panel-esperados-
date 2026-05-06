// app/api/banklogs/route.ts
//
// Route refondue (Lot 8) : orchestrateur fin uniquement. Toute la logique
// métier est dans src/lib/banklogs/.
//
// Endpoints :
//   GET  → lecture paginée DB (cache TTL via banklogs-cache module-level)
//          Auth : INGEST_SECRET worker OU staff session
//   POST → sync depuis LYG vers DB (best-effort)
//          Auth : INGEST_SECRET worker OU privileged session
//
// Aucun changement de shape API depuis avant Lot 8 :
//   GET  : { ok, familySlug, page, limit, total, items[], source }
//   POST : { ok, familySlug, lyg: {url, status}, itemsCount, stored, created, preview }

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { requireStaffAccess } from "@/lib/rbac";
import { resolveFamilyId } from "@/lib/family";
import { debug, logger } from "@/lib/logger";
import { getBanklogsCache, setBanklogsCache } from "@/lib/banklogs-cache";

import { FAMILY_SLUG } from "@/lib/banklogs/constants";
import { jsonOk, jsonErr, hasValidIngestSecret, safeJsonParse } from "@/lib/banklogs/responses";
import { parseBanklogsQuery, makeBanklogsCacheParams } from "@/lib/banklogs/query-params";
import { fetchBanklogsPage } from "@/lib/banklogs/query-banklogs";
import {
  buildBanklogRows,
  serializeBanklogRows,
  computeDebugStats,
} from "@/lib/banklogs/build-row";
import { syncBanklogsFromLyg } from "@/lib/banklogs/sync-from-lyg";

// ─────────────────────────────────────────────────────────────────────
// GET /api/banklogs — lecture DB paginée + filtres
// ─────────────────────────────────────────────────────────────────────
export async function GET(req: Request) {
  try {
    if (!hasValidIngestSecret(req)) {
      const guard = await requireStaffAccess();
      if (guard instanceof Response) return guard;
    }

    const url = new URL(req.url);

    // ✅ FORCÉ : on ignore toute valeur envoyée par l'UI/app
    const familySlugFromUi = url.searchParams.get("familyId");
    if (familySlugFromUi && familySlugFromUi !== FAMILY_SLUG) {
      console.warn(
        `[banklogs] GET: Ignoring familyId param (forced slug). Received: ${familySlugFromUi}, Using: ${FAMILY_SLUG}`
      );
    }

    const familyDbId = await resolveFamilyId(FAMILY_SLUG);
    const query = parseBanklogsQuery(url);

    // Cache lookup
    const cacheParams = makeBanklogsCacheParams(familyDbId, query);
    const cached = getBanklogsCache(cacheParams);
    if (cached) {
      debug("[banklogs] GET cache hit", { page: query.page, limit: query.limit });
      return jsonOk({ ...cached, source: "cache", cacheAgeMs: 0 });
    }

    console.log("[banklogs] GET", {
      page: query.page,
      limit: query.limit,
      familySlug: FAMILY_SLUG,
      familyDbId,
    });
    debug("[banklogs] GET page", { ...query, familySlug: FAMILY_SLUG, familyDbId });

    // Fetch DB
    const { items: itemsRaw, total } = await fetchBanklogsPage({ familyDbId, query });

    // Map → rows + sérialisation
    const rows = buildBanklogRows(itemsRaw);

    // Debug verbose si DEBUG_BANKLOGS=1
    if (process.env.DEBUG_BANKLOGS === "1") {
      const stats = computeDebugStats(itemsRaw);
      console.log(`[banklogs] 👻 ghostMembers used: ${stats.ghostUsedCount}`);
      if (stats.unlinkedCount > 0) {
        console.log(
          `\n[banklogs] ⚠️  ${stats.unlinkedCount}/${rows.length} records show "Non lié"`
        );
        stats.unlinkedSamples.forEach((item, idx) => {
          console.log(`   ${idx + 1}. steamId: ${item.steamId}`);
          console.log(`      type: ${item.type} (${item.type === 1 ? "withdrawal" : "deposit"})`);
          console.log(`      money: ${item.money}`);
          console.log(`      Family filter: familyId IN ('${familyDbId}', '${FAMILY_SLUG}')`);
        });
        console.log(
          `   💡 These steamIds don't exist in Member table for this family\n`
        );
      }
    }

    console.log("[banklogs] GET success", {
      page: query.page,
      limit: query.limit,
      total,
      itemsCount: rows.length,
    });

    const result = {
      ok: true,
      familySlug: FAMILY_SLUG,
      page: query.page,
      limit: query.limit,
      total,
      items: serializeBanklogRows(rows),
    };

    setBanklogsCache(cacheParams, result);
    return jsonOk({ ...result, source: "db" });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    logger.error("banklogs", "GET failed", { err: errMsg, stack: errStack });

    return NextResponse.json(
      { ok: false, error: "BANKLOGS_FAILED", message: errMsg },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}

// ─────────────────────────────────────────────────────────────────────
// POST /api/banklogs — sync depuis LYG (best-effort)
// ─────────────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    if (!hasValidIngestSecret(req)) {
      const guard = await requirePrivileged();
      if (guard instanceof Response) return guard;
    }

    const familyDbId = await resolveFamilyId(FAMILY_SLUG);

    // Body optionnel (paramètres de sync futurs)
    let body: unknown = null;
    try {
      const text = await req.text();
      body = text ? safeJsonParse(text) : null;
    } catch {
      body = null;
    }

    console.log("[banklogs] POST sync requested", { familySlug: FAMILY_SLUG, familyDbId });
    debug("[banklogs] POST sync requested", { familySlug: FAMILY_SLUG, familyDbId, body });

    const result = await syncBanklogsFromLyg({ familyDbId });

    if (!result.ok) {
      const err = result.error!;
      logger.error("banklogs", "LYG fetch failed", {
        url: result.lyg.url,
        status: result.lyg.status,
        contentType: err.contentType,
        rawTextLength: err.rawText.length,
        rawText: err.rawText,
      });
      return jsonErr(err.message, 502, {
        url: result.lyg.url,
        status: result.lyg.status,
        contentType: err.contentType,
        rawText: err.rawText,
      });
    }

    console.log("[banklogs] POST LYG returned", { itemsCount: result.itemsCount });
    if (result.stored) {
      console.log("[banklogs] POST DB insert success", {
        created: result.created,
        total: result.itemsCount,
      });
    }

    return jsonOk({
      ok: true,
      familySlug: FAMILY_SLUG,
      lyg: { url: result.lyg.url, status: result.lyg.status },
      itemsCount: result.itemsCount,
      stored: result.stored,
      created: result.created,
      preview: result.preview,
    });
  } catch (err: unknown) {
    const errMsg = err instanceof Error ? err.message : String(err);
    const errStack = err instanceof Error ? err.stack : undefined;
    logger.error("banklogs", "POST failed", { err: errMsg, stack: errStack });

    return NextResponse.json(
      { ok: false, error: "BANKLOGS_FAILED", message: errMsg },
      { status: 502, headers: { "Cache-Control": "no-store" } }
    );
  }
}
