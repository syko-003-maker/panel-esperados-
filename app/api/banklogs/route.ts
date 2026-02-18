// app/api/banklogs/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { resolveFamilyId } from "@/lib/family";
import { debug, error as logError } from "@/lib/logger";
import { getBanklogsCache, setBanklogsCache } from "@/lib/banklogs-cache";

export const runtime = "nodejs";

// ✅ RÈGLE ABSOLUE: Force slug + family name
const FAMILY_SLUG = "esperados";
const FAMILY_NAME = "Los Esperados";

// ✅ Doc LYG: GET /api/darkrp/familles/{familyName}/banklogs
// Si ton LYG n'utilise pas /api/darkrp/, change ici:
const LYG_BANKLOGS_PATH = `/api/darkrp/familles/${encodeURIComponent(FAMILY_NAME)}/banklogs`;
const LYG_MEMBERS_PATH = `/api/darkrp/familles/${FAMILY_SLUG}/members`;

function jsonOk(payload: any, status = 200) {
  return NextResponse.json(payload, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

function jsonErr(message: string, status = 500, extra?: Record<string, any>) {
  return NextResponse.json(
    {
      ok: false,
      error: "BANKLOGS_FAILED",
      message,
      familySlug: FAMILY_SLUG,
      ...(extra ?? {}),
    },
    {
      status,
      headers: { "cache-control": "no-store" },
    }
  );
}

/**
 * ⚠️ CRITICAL: Joins base URL + path intelligently.
 * Avoids double /api if LYG_BASE_URL already ends with /api
 *
 * Examples:
 * - base: https://api.lyg.fr, path: /api/darkrp/... → https://api.lyg.fr/api/darkrp/...
 * - base: https://api.lyg.fr/api, path: /api/darkrp/... → https://api.lyg.fr/api/darkrp/...
 */
function joinUrl(baseUrl: string, path: string): string {
  // Remove trailing slashes from base
  const base = baseUrl.replace(/\/+$/, "");

  // If base ends with /api and path starts with /api, remove /api from path
  let normalizedPath = path;
  if (base.endsWith("/api") && path.startsWith("/api/")) {
    normalizedPath = path.slice(4); // Remove /api from start
  }

  // Ensure path starts with /
  const pathPrefix = normalizedPath.startsWith("/") ? "" : "/";

  return `${base}${pathPrefix}${normalizedPath}`;
}

function getLygBaseUrl() {
  const base = process.env.LYG_BASE_URL;
  if (!base) throw new Error("LYG_BASE_URL missing");
  return base;
}

function getLygToken() {
  const token = process.env.LYG_TOKEN;
  if (!token) throw new Error("LYG_TOKEN missing");
  return token;
}

function safeJsonParse(text: string) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

async function fetchLygJsonSafe(path: string, init?: RequestInit) {
  const base = getLygBaseUrl();
  const url = joinUrl(base, path);
  const token = getLygToken();

  const headers = new Headers(init?.headers);
  headers.set("accept", "application/json");
  headers.set("authorization", `Bearer ${token}`);
  if (init?.body && !headers.get("content-type")) {
    headers.set("content-type", "application/json");
  }

  const method = init?.method ?? "GET";
  console.log(`[LYG] -> ${method} ${url}`);
  debug("[LYG] ->", { method, url });

  const res = await fetch(url, {
    ...init,
    headers,
    cache: "no-store",
  });

  console.log(`[LYG] <- ${res.status} ${method} ${url}`);
  debug("[LYG] <-", { status: res.status, method, url });

  const contentType = res.headers.get("content-type") || "";
  const rawText = await res.text().catch(() => "");

  const maybeJson =
    contentType.includes("application/json") ? safeJsonParse(rawText) : null;

  return {
    ok: res.ok,
    status: res.status,
    url,
    contentType,
    rawText: rawText ? rawText.slice(0, 2000) : "",
    json: maybeJson,
  };
}

/**
 * GET /api/banklogs
 * => Lit de la DB Prisma (pas d'appel LYG).
 * => Ne doit JAMAIS crasher si LYG_* manque.
 */
export async function GET(req: Request) {
  try {
    const guard = await requirePrivileged();
    if (guard instanceof Response) return guard;

    const { searchParams } = new URL(req.url);

    // ✅ FORCÉ : on ignore toute valeur envoyée par l'UI/app
    const familySlugFromUi = searchParams.get("familyId");
    if (familySlugFromUi && familySlugFromUi !== FAMILY_SLUG) {
      console.warn(`[banklogs] GET: Ignoring familyId param (forced slug). Received: ${familySlugFromUi}, Using: ${FAMILY_SLUG}`);
      debug("[banklogs] GET: Forced slug", {
        received: familySlugFromUi,
        forced: FAMILY_SLUG,
      });
    }

    // Resolve family cuid from FORCED slug
    const familyDbId = await resolveFamilyId(FAMILY_SLUG);

    const pageRaw = Number(searchParams.get("page") ?? "1");
    const limitRaw = Number(searchParams.get("limit") ?? "50");
    const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
    const limit = Math.min(
      Math.max(Number.isFinite(limitRaw) ? limitRaw : 50, 1),
      200
    );

    const typeRaw = searchParams.get("type"); // "1" | "2" | ""
    const steamIdRaw = (searchParams.get("steamId") ?? "").trim();
    const daysRaw = Number(searchParams.get("days") ?? "0"); // 7/30/90/0

    // ✅ CACHE CHECK
    const cacheParams = {
      familyDbId,
      page,
      limit,
      type: (typeRaw === "1" || typeRaw === "2" ? typeRaw : null) as "1" | "2" | null,
      steamId: steamIdRaw || null,
      days: daysRaw > 0 ? daysRaw : null,
    };

    const cached = getBanklogsCache(cacheParams);
    if (cached) {
      debug("[banklogs] GET cache hit", { page, limit });
      return jsonOk({ ...cached, source: "cache", cacheAgeMs: 0 });
    }

    const skip = (page - 1) * limit;

    console.log("[banklogs] GET", {
      page,
      limit,
      familySlug: FAMILY_SLUG,
      familyDbId,
    });
    debug("[banklogs] GET page", {
      page,
      limit,
      familySlug: FAMILY_SLUG,
      familyDbId,
      typeRaw,
      steamIdRaw,
      daysRaw,
    });

    const where: any = { familyId: familyDbId };

    if (typeRaw === "1" || typeRaw === "2") {
      where.type = Number(typeRaw);
    }

    if (steamIdRaw) {
      where.steamId = { contains: steamIdRaw };
    }

    if (Number.isFinite(daysRaw) && daysRaw > 0) {
      const from = new Date(Date.now() - daysRaw * 24 * 60 * 60 * 1000);
      where.at = { gte: from };
    }

    const [items, total] = await Promise.all([
      prisma.bankLog.findMany({
        where,
        orderBy: { at: "desc" },
        skip,
        take: limit,
        select: {
          at: true,
          type: true,
          money: true,
          steamId: true,
        },
      }),
      prisma.bankLog.count({ where }),
    ]);

    console.log("[banklogs] GET success", { page, limit, total, itemsCount: items.length });
    debug("[banklogs] GET success", {
      page,
      limit,
      total,
      itemsCount: items.length,
    });

    const result = {
      ok: true,
      familySlug: FAMILY_SLUG,
      page,
      limit,
      total,
      items: items.map((item) => ({
        ...item,
        at: item.at.toISOString(),
      })),
    };

    // ✅ CACHE WRITE
    setBanklogsCache(cacheParams, result);

    return jsonOk({ ...result, source: "db" });
  } catch (err: any) {
    console.error("[banklogs] crash", err);

    return NextResponse.json({
      ok: false,
      error: "BANKLOGS_CRASH",
      message: String(err?.message ?? err),
    }, { status: 500 });
  }
}

/**
 * POST /api/banklogs
 * => Sync (robuste): appelle LYG, log url + status, pas de .json() dangereux.
 *
 * ⚠️ Si ton bouton sync appelle une autre route (ex /api/banklogs/sync),
 * dis-moi et je te donne le fichier exact correspondant.
 */
export async function POST(req: Request) {
  try {
    const guard = await requirePrivileged();
    if (guard instanceof Response) return guard;

    // On force slug
    const familyDbId = await resolveFamilyId(FAMILY_SLUG);

    // Optionnel: read body pour paramètres de sync
    let body: any = null;
    try {
      const text = await req.text();
      body = text ? safeJsonParse(text) : null;
    } catch {
      body = null;
    }

    console.log("[banklogs] POST sync requested", {
      familySlug: FAMILY_SLUG,
      familyDbId,
    });
    debug("[banklogs] POST sync requested", {
      familySlug: FAMILY_SLUG,
      familyDbId,
      body,
    });

    // ✅ Appel LYG safe
    const r = await fetchLygJsonSafe(LYG_BANKLOGS_PATH, {
      method: "GET",
    });

    if (!r.ok || !r.json) {
      console.error("[banklogs] POST LYG fetch failed", {
        url: r.url,
        status: r.status,
        contentType: r.contentType,
        rawTextLength: r.rawText.length,
      });
      return jsonErr("LYG banklogs fetch failed (non-JSON or HTTP error)", 502, {
        url: r.url,
        status: r.status,
        contentType: r.contentType,
        rawText: r.rawText,
      });
    }

    // Normalise formats possibles
    const raw: any = r.json;
    const items: any[] =
      Array.isArray(raw) ? raw :
      Array.isArray(raw?.data) ? raw.data :
      Array.isArray(raw?.items) ? raw.items :
      Array.isArray(raw?.banklogs) ? raw.banklogs :
      [];

    console.log("[banklogs] POST LYG returned", { itemsCount: items.length });
    debug("[banklogs] POST raw response", { itemsCount: items.length, keys: Object.keys(raw).slice(0, 5) });

    // Si tu as déjà une table BankLog en DB, on tente un insert “best-effort”.
    // ⚠️ Sans connaître tes contraintes uniques, on évite de casser :
    // - On crée des entrées minimales si présentes.
    // - On wrap dans try/catch (ne jamais planter la route).
    let created = 0;
    let stored = false;

    try {
      // Map minimal vers ton schema actuel (at/type/money/steamId/familyId)
      const data = items
        .map((x) => {
          const at = x.at ?? x.date ?? x.createdAt ?? x.time;
          const type = x.type ?? x.kind ?? x.actionType;
          const money = x.money ?? x.amount ?? x.value;
          const steamId = (x.steamId ?? x.steam ?? x.playerSteamId ?? "").toString();

          if (!at || type === undefined || money === undefined) return null;

          const atDate = at instanceof Date ? at : new Date(at);
          if (isNaN(atDate.getTime())) return null;

          return {
            familyId: familyDbId,
            at: atDate,
            type: Number(type),
            money: Number(money),
            steamId: steamId || null,
          };
        })
        .filter(Boolean) as any[];

      if (data.length > 0) {
        // createMany si disponible + skipDuplicates (si tu as une contrainte unique)
        // Si skipDuplicates n'est pas supporté selon ton provider, Prisma lèvera -> catch
        const res = await prisma.bankLog.createMany({
          data,
          skipDuplicates: true as any,
        });

        // createMany retourne { count }
        created = (res as any)?.count ?? 0;
        stored = true;
        console.log("[banklogs] POST DB insert success", { created, total: data.length });
        debug("[banklogs] POST DB insert success", { created, total: data.length });
      } else {
        stored = true;
        console.log("[banklogs] POST no items to insert (empty or invalid format)");
        debug("[banklogs] POST no valid items to insert");
      }
    } catch (e: any) {
      // On ne casse pas la route : la sync renvoie quand même les items
      console.error("[banklogs] POST DB insert failed (non-blocking):", e?.message ?? e);
      logError("[banklogs] POST DB insert failed", e);
      stored = false;
    }

    return jsonOk({
      ok: true,
      familySlug: FAMILY_SLUG,
      lyg: { url: r.url, status: r.status },
      itemsCount: items.length,
      stored,
      created,
      // Optionnel: renvoyer un aperçu
      preview: items.slice(0, 3),
    });
  } catch (err: any) {
    console.error("[banklogs] crash", err);

    return NextResponse.json({
      ok: false,
      error: "BANKLOGS_CRASH",
      message: String(err?.message ?? err),
    }, { status: 500 });
  }
}
