import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { extractArrayFromLygResponse } from "@/lib/lyg-client";
import { fetchLygBanklogs } from "@/lib/lyg-banklogs";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { debug, error as logError } from "@/lib/logger";
import crypto from "crypto";

function makeFingerprint(it: any) {
  const s = `${it.family_id}|${it.steamid}|${it.type}|${it.money}|${it.date}`;
  return crypto.createHash("sha256").update(s).digest("hex");
}

export async function POST(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  try {
    const familySlug = DEFAULT_FAMILY_ID;
    
    // Resolve family cuid from slug
    const familyDbId = await resolveFamilyId(familySlug);

    console.log("[banklogs-sync] -> POST /api/staff/sync/banklogs", { familyId: familySlug });

    // Use single-source LYG banklogs fetch (stable endpoint, no fallback)
    debug("[sync/banklogs] Fetching from LYG...");

    const banklogsResponse = await fetchLygBanklogs(DEFAULT_FAMILY_ID, {
      timeoutMs: 15_000,
    });

    const meta = {
      urlUsed: banklogsResponse.meta?.urlUsed,
      status: banklogsResponse.status,
      contentType: banklogsResponse.meta?.contentType,
    };

    console.log("[banklogs-sync] <- LYG response", {
      status: banklogsResponse.status,
      count: Array.isArray(banklogsResponse.data) ? banklogsResponse.data.length : "n/a",
      meta,
    });

    if (!banklogsResponse.ok) {
      logError("[sync/banklogs] LYG fetch failed", {
        status: banklogsResponse.status,
        error: banklogsResponse.error,
        meta,
      });
      console.log("[banklogs-sync] fail", {
        status: banklogsResponse.status,
        error: banklogsResponse.error,
        meta,
      });
      const httpStatus = banklogsResponse.status === 404 ? 404 : (banklogsResponse.status || 500);
      return NextResponse.json(
        { 
          ok: false,
          error: banklogsResponse.error ?? "LYG banklogs fetch failed",
          status: banklogsResponse.status,
          meta,
        },
        { status: httpStatus }
      );
    }

    // Parse array from response (handles {data: [...]} or direct array)
    const { array: items } = extractArrayFromLygResponse(banklogsResponse.data);
    
    // Even if 0 items, it's success (no error, just empty batch)
    if (!items || items.length === 0) {
      console.log("[banklogs-sync] success (0 items)", {
        hasData: !!banklogsResponse.data,
        responseStatus: banklogsResponse.status,
        meta,
      });
      debug("[sync/banklogs] No items extracted from LYG response", { meta });
      return NextResponse.json({
        ok: true,
        imported: 0,
        message: "No banklogs to sync",
        meta,
      });
    }

    let imported = 0;

    for (const it of items) {
      if (!it?.date || it?.money === undefined || it?.steamid === undefined || it?.type === undefined) continue;

      const fingerprint = makeFingerprint(it);
      const id = `banklog_${fingerprint}`;

      await prisma.bankLog.upsert({
        where: { fingerprint },
        update: {
          raw: it,
          at: new Date(it.date),
          type: Number(it.type),
          money: Number(it.money),
          steamId: String(it.steamid),
          familyId: familyDbId,  // Use resolved cuid
        },
        create: {
          id,
          fingerprint,
          raw: it,
          at: new Date(it.date),
          type: Number(it.type),
          money: Number(it.money),
          steamId: String(it.steamid),
          familyId: familyDbId,  // Use resolved cuid
        },
      });

      imported++;
    }

    await prisma.syncState.upsert({
      where: { key: `banklogs:${familySlug}` },
      update: { syncedAt: new Date(), meta: { imported } },
      create: { key: `banklogs:${familySlug}`, syncedAt: new Date(), meta: { imported } },
    });

    console.log("[banklogs-sync] success", { 
      imported, 
      meta 
    });

    return NextResponse.json({ 
      ok: true, 
      imported,
      meta,
    });
  } catch (e: any) {
    console.error("[banklogs-sync] error", { 
      error: String(e?.message ?? e),
    });
    return NextResponse.json({ 
      ok: false, 
      error: String(e?.message ?? e) 
    }, { status: 500 });
  }
}
