import crypto from "crypto";
import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { clearBanklogsCache } from "@/lib/banklogs-cache";
import { fetchBanklogsPage } from "@/lib/lyg/client";
import { runControlledLygSync, type ControlledSyncResult, type SyncSource } from "@/lib/lyg/sync-runner";

export type BanklogsSyncMetrics = {
  pagesAttempted: number;
  pagesFetched: number;
  stopReason: "empty_page" | "short_page" | "full_duplicate_page" | "max_pages";
  received: number;
  valid: number;
  ignoredInvalid: number;
  ignoredDuplicate: number;
  inserted: number;
  skipped: number;
};

export type BanklogsSyncResult = ControlledSyncResult<BanklogsSyncMetrics>;

const PAGE_LIMIT = 100;
const MAX_PAGES = Math.min(Math.max(Number(process.env.LYG_BANKLOGS_MAX_PAGES ?? 5) || 5, 1), 20);

function makeFingerprint(it: any) {
  const s = `${it.family_id}|${it.steamid}|${it.type}|${it.money}|${it.date}`;
  return crypto.createHash("sha256").update(s).digest("hex");
}

function normalizeSteamId(value: unknown): string | null {
  const steamId = String(value ?? "").trim();
  return steamId.length > 0 ? steamId : null;
}

export async function runLygBanklogsSync(source: SyncSource = "cron"): Promise<BanklogsSyncResult> {
  const familySlug = DEFAULT_FAMILY_ID;
  const result = await runControlledLygSync<BanklogsSyncMetrics>({
    type: "banklogs",
    source,
    familyId: familySlug,
    minIntervalMs: 60_000,
    lockTtlMs: 60_000,
    run: async () => {
      const familyDbId = await resolveFamilyId(familySlug);

      const allItems: any[] = [];
      const seenFetchedFingerprints = new Set<string>();
      let pagesAttempted = 0;
      let pagesFetched = 0;
      let stopReason: BanklogsSyncMetrics["stopReason"] = "max_pages";

      for (let page = 1; page <= MAX_PAGES; page++) {
        pagesAttempted += 1;
        const pageRes = await fetchBanklogsPage(page, PAGE_LIMIT);

        if (!pageRes.ok) {
          const e: any = new Error(pageRes.error ?? "LYG banklogs fetch failed");
          e.status = pageRes.status;
          e.endpoint = "banklogs";
          e.page = page;
          throw e;
        }

        const pageItems = Array.isArray(pageRes.data) ? pageRes.data : [];
        pagesFetched += 1;

        if (pageItems.length === 0) {
          stopReason = "empty_page";
          break;
        }

        const pageFingerprints = pageItems.map((it: any) => makeFingerprint(it));
        const uniqueOnPage = pageFingerprints.filter((fp) => !seenFetchedFingerprints.has(fp));
        const fullDuplicatePage = uniqueOnPage.length === 0;

        for (const item of pageItems) allItems.push(item);
        for (const fp of pageFingerprints) seenFetchedFingerprints.add(fp);

        if (fullDuplicatePage) {
          stopReason = "full_duplicate_page";
          break;
        }

        if (pageItems.length < PAGE_LIMIT) {
          stopReason = "short_page";
          break;
        }
      }

      const received = allItems.length;
      const validItems = allItems.filter((it: any) => {
        const steamId = normalizeSteamId(it?.steamid);
        return Boolean(it?.date && it?.money !== undefined && it?.type !== undefined && steamId);
      });
      const ignoredInvalid = Math.max(0, received - validItems.length);

      const steamIds = Array.from(
        new Set(validItems.map((it: any) => normalizeSteamId(it.steamid)).filter((v): v is string => Boolean(v)))
      );

      const membersBySteam = steamIds.length
        ? await prisma.member.findMany({
            where: {
              steamId: { in: steamIds },
              OR: [{ familyId: familyDbId }, { familyId: familySlug }],
            },
            select: { id: true, steamId: true, rpName: true, discordUsername: true },
          })
        : [];

      const memberBySteam = new Map(
        membersBySteam
          .filter((m) => m.steamId)
          .map((m) => [
            m.steamId as string,
            {
              memberId: m.id,
              rpName: m.rpName ?? m.discordUsername ?? null,
            },
          ])
      );

      const fingerprints = validItems.map((it: any) => makeFingerprint(it));
      const existing = fingerprints.length
        ? await prisma.bankLog.findMany({
            where: { fingerprint: { in: fingerprints } },
            select: { fingerprint: true },
          })
        : [];

      const existingSet = new Set(existing.map((row) => row.fingerprint));

      const candidateRows = validItems
        .map((it: any) => {
          const fingerprint = makeFingerprint(it);
          const steamId = normalizeSteamId(it.steamid);
          if (!steamId) return null;
          const resolvedMember = memberBySteam.get(steamId) ?? null;

          return {
            fingerprint,
            id: `banklog_${fingerprint}`,
            raw: {
              ...it,
              steamid: steamId,
              steamId,
              resolvedMemberId: resolvedMember?.memberId ?? null,
              resolvedMemberRpName: resolvedMember?.rpName ?? null,
            },
            at: new Date(it.date),
            type: Number(it.type),
            money: Number(it.money),
            steamId,
            familyId: familyDbId,
          };
        })
        .filter((row): row is NonNullable<typeof row> => Boolean(row));

      const uniqueNewRowsByFingerprint = new Map<string, (typeof candidateRows)[number]>();
      for (const row of candidateRows) {
        if (existingSet.has(row.fingerprint)) continue;
        if (uniqueNewRowsByFingerprint.has(row.fingerprint)) continue;
        uniqueNewRowsByFingerprint.set(row.fingerprint, row);
      }

      const newRows = Array.from(uniqueNewRowsByFingerprint.values());
      let inserted = 0;

      if (newRows.length > 0) {
        const createResult = await prisma.bankLog.createMany({
          data: newRows,
          skipDuplicates: true,
        });
        inserted = createResult.count;
        clearBanklogsCache();
      }

      const ignoredDuplicate = Math.max(0, validItems.length - inserted);
      const skipped = ignoredInvalid + ignoredDuplicate;

      return {
        pagesAttempted,
        pagesFetched,
        stopReason,
        received,
        valid: validItems.length,
        ignoredInvalid,
        ignoredDuplicate,
        inserted,
        skipped,
      };
    },
  });

  const compatKey = `banklogs:${familySlug}`;
  const nowIso = new Date().toISOString();
  const prev = await prisma.syncState.findUnique({ where: { key: compatKey } });
  const prevMeta = (prev?.meta as Record<string, any>) ?? {};

  if (result.ok) {
    await prisma.syncState.upsert({
      where: { key: compatKey },
      update: {
        syncedAt: new Date(),
        meta: {
          ...prevMeta,
          source,
          newLogs: Number(result.metrics?.inserted ?? 0),
          skipped: Number(result.metrics?.skipped ?? 0),
          audit: {
            received: Number(result.metrics?.received ?? 0),
            valid: Number(result.metrics?.valid ?? 0),
            ignoredInvalid: Number(result.metrics?.ignoredInvalid ?? 0),
            ignoredDuplicate: Number(result.metrics?.ignoredDuplicate ?? 0),
            inserted: Number(result.metrics?.inserted ?? 0),
          },
          lastAttemptAt: nowIso,
          lastSuccessAt: nowIso,
          lastRunDurationMs: result.durationMs,
          backoffMs: 0,
          backoffUntil: null,
          lastError: null,
          lastErrorAt: null,
        },
      },
      create: {
        key: compatKey,
        syncedAt: new Date(),
        meta: {
          source,
          newLogs: Number(result.metrics?.inserted ?? 0),
          skipped: Number(result.metrics?.skipped ?? 0),
          audit: {
            received: Number(result.metrics?.received ?? 0),
            valid: Number(result.metrics?.valid ?? 0),
            ignoredInvalid: Number(result.metrics?.ignoredInvalid ?? 0),
            ignoredDuplicate: Number(result.metrics?.ignoredDuplicate ?? 0),
            inserted: Number(result.metrics?.inserted ?? 0),
          },
          lastAttemptAt: nowIso,
          lastSuccessAt: nowIso,
          lastRunDurationMs: result.durationMs,
          backoffMs: 0,
          backoffUntil: null,
          lastError: null,
          lastErrorAt: null,
        },
      },
    });
  } else {
    const backoffUntil = result.backoffMs && result.backoffMs > 0 ? new Date(Date.now() + result.backoffMs).toISOString() : null;
    await prisma.syncState.upsert({
      where: { key: compatKey },
      update: {
        meta: {
          ...prevMeta,
          source,
          lastAttemptAt: nowIso,
          lastRunDurationMs: result.durationMs,
          lastError: result.reason ?? "BANKLOGS_SYNC_FAILED",
          lastErrorAt: nowIso,
          backoffMs: result.backoffMs ?? 0,
          backoffUntil,
        },
      },
      create: {
        key: compatKey,
        syncedAt: prev?.syncedAt ?? null,
        meta: {
          source,
          lastAttemptAt: nowIso,
          lastRunDurationMs: result.durationMs,
          lastError: result.reason ?? "BANKLOGS_SYNC_FAILED",
          lastErrorAt: nowIso,
          backoffMs: result.backoffMs ?? 0,
          backoffUntil,
        },
      },
    });
  }

  return result;
}
