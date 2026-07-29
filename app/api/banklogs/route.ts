// app/api/banklogs/route.ts
//
// Route refondue (Lot 8) : orchestrateur fin uniquement. Toute la logique
// métier est dans src/lib/banklogs/.
//
// Endpoints :
//   GET  → lecture paginée DB (cache TTL via banklogs-cache module-level)
//          Auth : INGEST_SECRET worker OU staff session
//          Réponse : { ok, familySlug, page, limit, total, items[], source }
//
// Il exista un POST de sync depuis LYG. Il n'a jamais rien écrit : son insert
// omettait id, fingerprint et raw, trois colonnes NOT NULL sans valeur par
// défaut, et l'échec était avalé par un catch marqué « non-blocking ». Aucun
// appelant en quinze jours de logs, et zéro ligne de cette origine en base.
// Le vrai sync est runLygBanklogsSync (src/lib/lyg/sync-banklogs.ts), branché
// sur le cron et les boutons staff. Le POST a donc été retiré plutôt que
// réparé : deux implémentations du même sync, dont une muette, est un piège.

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { requireStaffAccess } from "@/lib/rbac";
import { resolveFamilyId } from "@/lib/family";
import { debug, logger } from "@/lib/logger";
import { getBanklogsCache, setBanklogsCache } from "@/lib/banklogs-cache";

import { FAMILY_SLUG } from "@/lib/banklogs/constants";
import { jsonOk, hasValidIngestSecret } from "@/lib/banklogs/responses";
import { parseBanklogsQuery, makeBanklogsCacheParams } from "@/lib/banklogs/query-params";
import { fetchBanklogsPage } from "@/lib/banklogs/query-banklogs";
import {
  buildBanklogRows,
  serializeBanklogRows,
  computeDebugStats,
} from "@/lib/banklogs/build-row";

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
