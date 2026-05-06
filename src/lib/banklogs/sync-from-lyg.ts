/**
 * Sync banklogs depuis LYG vers la DB. Best-effort : si l'insert DB échoue,
 * on retourne quand même les items récupérés (la route ne crashe pas).
 *
 * Extrait de app/api/banklogs/route.ts POST (Lot 8).
 */

import { prisma } from "@/lib/db";
import { error as logError } from "@/lib/logger";
import { LYG_BANKLOGS_PATH } from "./constants";
import { fetchLygJsonSafe, type LygFetchResult } from "./lyg-client";

export interface SyncResult {
  ok: boolean;
  lyg: { url: string; status: number; ok: boolean };
  itemsCount: number;
  stored: boolean;
  created: number;
  preview: unknown[];
  error?: { message: string; contentType: string; rawText: string };
}

/**
 * Normalise un item LYG vers le shape `BankLog.create` :
 * - Accepte plusieurs alias (at|date|createdAt|time, type|kind|actionType, ...)
 * - Retourne null si un champ obligatoire manque ou est invalide
 */
export function normalizeLygItem(
  x: any,
  familyDbId: string
): { familyId: string; at: Date; type: number; money: number; steamId: string | null } | null {
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
}

/**
 * Extrait l'array d'items depuis les variations de format LYG :
 *   raw, raw.data, raw.items, raw.banklogs
 */
export function extractItemsFromLygResponse(raw: any): any[] {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  if (Array.isArray(raw?.items)) return raw.items;
  if (Array.isArray(raw?.banklogs)) return raw.banklogs;
  return [];
}

/**
 * Effectue le sync complet : LYG fetch + normalize + createMany.
 */
export async function syncBanklogsFromLyg(params: {
  familyDbId: string;
}): Promise<SyncResult> {
  const { familyDbId } = params;

  const r: LygFetchResult = await fetchLygJsonSafe(LYG_BANKLOGS_PATH, { method: "GET" });

  if (!r.ok || !r.json) {
    return {
      ok: false,
      lyg: { url: r.url, status: r.status, ok: r.ok },
      itemsCount: 0,
      stored: false,
      created: 0,
      preview: [],
      error: {
        message: "LYG banklogs fetch failed (non-JSON or HTTP error)",
        contentType: r.contentType,
        rawText: r.rawText,
      },
    };
  }

  const items = extractItemsFromLygResponse(r.json);

  let created = 0;
  let stored = false;

  try {
    // Cast `any` car BankLogCreateManyInput exige id/fingerprint/raw que
    // Prisma calcule lui-même (defaults schema). Pattern préservé du code
    // pré-Lot 8 qui marchait sans erreur runtime.
    const data = items
      .map((x) => normalizeLygItem(x, familyDbId))
      .filter(Boolean) as any[];

    if (data.length > 0) {
      const res = await prisma.bankLog.createMany({
        data,
        skipDuplicates: true,
      } as any);
      created = (res as any)?.count ?? 0;
      stored = true;
    } else {
      stored = true;
    }
  } catch (e: unknown) {
    // Best-effort : on ne casse pas le sync
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[banklogs] POST DB insert failed (non-blocking):", msg);
    logError("[banklogs] POST DB insert failed", e);
    stored = false;
  }

  return {
    ok: true,
    lyg: { url: r.url, status: r.status, ok: r.ok },
    itemsCount: items.length,
    stored,
    created,
    preview: items.slice(0, 3),
  };
}
