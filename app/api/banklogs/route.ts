// app/api/banklogs/route.ts
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { prisma, Prisma } from "@/lib/db";
import { resolveFamilyId } from "@/lib/family";
import { debug, error as logError, logger } from "@/lib/logger";
import { getBanklogsCache, setBanklogsCache } from "@/lib/banklogs-cache";
import { getMemberDisplayName } from "@/lib/member-display";
import { requireStaffAccess } from "@/lib/rbac";
import { BLACKLIST_ROLE_ID, RESERVIST_ROLE_ID } from "@/lib/discord-grade";
import { DEMOTE_ROLE_ID } from "@/lib/discord-rbac";
import { isDisplayableStaffMember } from "@/lib/staff/member-scope";

export const runtime = "nodejs";

// ✅ RÈGLE ABSOLUE: Force slug + family name
const FAMILY_SLUG = "esperados";
const FAMILY_NAME = "Los Esperados";

// ✅ Doc LYG: GET /api/darkrp/familles/{familyName}/banklogs
// Si ton LYG n'utilise pas /api/darkrp/, change ici:
const LYG_BANKLOGS_PATH = `/api/darkrp/familles/${encodeURIComponent(FAMILY_NAME)}/banklogs`;
const LYG_MEMBERS_PATH = `/api/darkrp/familles/${FAMILY_SLUG}/members`;

function buildDisplayableMemberSql(): Prisma.Sql {
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

function hasValidIngestSecret(req: Request): boolean {
  const expected = process.env.INGEST_SECRET;
  if (!expected) return false;
  const provided = req.headers.get("x-ingest-secret");
  return Boolean(provided && provided === expected);
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
    if (!hasValidIngestSecret(req)) {
      const guard = await requireStaffAccess();
      if (guard instanceof Response) return guard;
    }

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
    const memberRaw = (searchParams.get("member") ?? "").trim();
    const daysRaw = Number(searchParams.get("days") ?? "0"); // 7/30/90/0
    const typeParsed = typeRaw ? Number(typeRaw) : NaN;

    // ✅ CACHE CHECK
    const cacheParams = {
      familyDbId,
      page,
      limit,
      type: Number.isFinite(typeParsed) ? String(typeParsed) : null,
      steamId: steamIdRaw || null,
      member: memberRaw || null,
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
      memberRaw,
      steamIdRaw,
      daysRaw,
    });

    const where: any = { familyId: familyDbId };

    if (Number.isFinite(typeParsed)) {
      where.type = typeParsed;
    }

    if (steamIdRaw) {
      where.steamId = { contains: steamIdRaw };
    }

    if (Number.isFinite(daysRaw) && daysRaw > 0) {
      const from = new Date(Date.now() - daysRaw * 24 * 60 * 60 * 1000);
      where.at = { gte: from };
    }

    // ✅ Use raw query to LEFT JOIN Member and include rpName with fallback
    // This supports both cuid and slug familyId for backward compatibility
    const displayableMemberSql = buildDisplayableMemberSql();

    const itemsRaw = await prisma.$queryRaw<Array<{
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
    }>>`
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
        ${Number.isFinite(typeParsed) ? Prisma.sql`AND b."type" = ${typeParsed}` : Prisma.empty}
        ${steamIdRaw ? Prisma.sql`AND b."steamId" LIKE ${'%' + steamIdRaw + '%'}` : Prisma.empty}
        ${memberRaw ? Prisma.sql`AND COALESCE(m."rpName", m."discordDisplayName", m."discordUsername", '') ILIKE ${'%' + memberRaw + '%'}` : Prisma.empty}
        ${Number.isFinite(daysRaw) && daysRaw > 0 ? Prisma.sql`AND b."at" >= ${new Date(Date.now() - daysRaw * 24 * 60 * 60 * 1000)}` : Prisma.empty}
        AND ${displayableMemberSql}
      ORDER BY b."at" DESC
      LIMIT ${limit}
      OFFSET ${skip}
    `;

    const totalRows = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*)::bigint AS count
      FROM "BankLog" b
      LEFT JOIN "Member" m
        ON m."steamId" = b."steamId"
        AND (m."familyId" = ${familyDbId} OR m."familyId" = ${FAMILY_SLUG})
      WHERE b."familyId" = ${familyDbId}
        ${Number.isFinite(typeParsed) ? Prisma.sql`AND b."type" = ${typeParsed}` : Prisma.empty}
        ${steamIdRaw ? Prisma.sql`AND b."steamId" LIKE ${'%' + steamIdRaw + '%'}` : Prisma.empty}
        ${memberRaw ? Prisma.sql`AND COALESCE(m."rpName", m."discordDisplayName", m."discordUsername", '') ILIKE ${'%' + memberRaw + '%'}` : Prisma.empty}
        ${Number.isFinite(daysRaw) && daysRaw > 0 ? Prisma.sql`AND b."at" >= ${new Date(Date.now() - daysRaw * 24 * 60 * 60 * 1000)}` : Prisma.empty}
        AND ${displayableMemberSql}
    `;
    const total = Number(totalRows?.[0]?.count ?? 0);

    const items = itemsRaw
      .filter((item) => !item.memberId || isDisplayableStaffMember(item))
      .map((item) => {
      const hasMemberRow = Boolean(item.memberId);
      const isDisplayableMember = hasMemberRow && isDisplayableStaffMember(item);
      const resolvedName = isDisplayableMember
        ? getMemberDisplayName(item)
        : null;

      return {
        at: item.at,
        type: item.type,
        money: item.money,
        steamId: item.steamId,
        rpName: resolvedName,
        isGhost: Boolean(item.isGhost),
      };
    });

    // 🔍 DEBUG: Log unlinked records when DEBUG_BANKLOGS=1
    if (process.env.DEBUG_BANKLOGS === "1") {
      const ghostUsedCount = itemsRaw.filter((item) => item.isGhost && !item.rpName).length;
      const unlinkedCount = itemsRaw.filter((item) => !item.rpName && !item.isGhost).length;
      console.log(`[banklogs] 👻 ghostMembers used: ${ghostUsedCount}`);
      if (unlinkedCount > 0) {
        console.log(`\n[banklogs] ⚠️  ${unlinkedCount}/${items.length} records show "Non lié"`);
        const unlinkedSamples = itemsRaw.filter((item) => !item.rpName && !item.isGhost).slice(0, 5);
        unlinkedSamples.forEach((item, idx) => {
          console.log(`   ${idx + 1}. steamId: ${item.steamId}`);
          console.log(`      type: ${item.type} (${item.type === 1 ? "withdrawal" : "deposit"})`);
          console.log(`      money: ${item.money}`);
          console.log(`      JOIN field: BankLog.steamId = Member.steamId`);
          console.log(`      Result: ❌ No Member found with steamId "${item.steamId}"`);
          console.log(`      Family filter: familyId IN ('${familyDbId}', '${FAMILY_SLUG}')`);
        });
        console.log(`   💡 These steamIds don't exist in Member table for this family\n`);
      }
    }

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
        at: item.at.toISOString(),
        type: item.type,
        money: item.money,
        steamId: item.steamId,
        rpName: item.rpName,
      })),
    };

    // ✅ CACHE WRITE
    setBanklogsCache(cacheParams, result);

    return jsonOk({ ...result, source: "db" });
  } catch (err: any) {
    logger.error("banklogs", "GET failed", {
      err: String(err),
      stack: err?.stack,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "BANKLOGS_FAILED",
        message: String(err),
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      }
    );
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
    if (!hasValidIngestSecret(req)) {
      const guard = await requirePrivileged();
      if (guard instanceof Response) return guard;
    }

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
      logger.error("banklogs", "LYG fetch failed", {
        url: r.url,
        status: r.status,
        contentType: r.contentType,
        rawTextLength: r.rawText.length,
        rawText: r.rawText,
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
    logger.error("banklogs", "POST failed", {
      err: String(err),
      stack: err?.stack,
    });

    return NextResponse.json(
      {
        ok: false,
        error: "BANKLOGS_FAILED",
        message: String(err),
      },
      {
        status: 502,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }
}
