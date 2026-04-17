import { fetchBanklogsPage } from "@/lib/lyg/client";

export type LygBanklogsResult = {
  ok: boolean;
  status: number;
  data?: any;
  text?: string;
  url?: string;
  error?: string;
  durationMs?: number;
  meta?: {
    urlUsed?: string;
    status?: number;
    contentType?: string;
    durationMs?: number;
    rootKeys?: string[];
    extractedCount?: number;
    chosenKey?: string;
  };
};

/**
 * Fetch LYG banklogs using FAMILY_NAME endpoint.
 */
export async function fetchLygBanklogs(
  familyId?: string,
  opts?: { timeoutMs?: number; limit?: number; page?: number }
): Promise<LygBanklogsResult> {
  const limitRaw = opts?.limit ?? Number(process.env.LYG_BANKLOGS_LIMIT ?? 100);
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(Math.trunc(limitRaw), 1), 500) : 100;
  const pageRaw = opts?.page ?? 1;
  const page = Number.isFinite(pageRaw) ? Math.max(Math.trunc(pageRaw), 1) : 1;

  if (familyId && familyId !== "esperados") {
    console.warn("[lyg-banklogs] Ignoring non-slug familyId, using fixed endpoint", {
      received: familyId,
      enforced: "esperados",
    });
  }

  const result = await fetchBanklogsPage(page, limit);

  return {
    ok: result.ok,
    status: result.status,
    data: result.data,
    text: result.text,
    url: result.url,
    error: result.error,
    durationMs: result.durationMs,
    meta: {
      urlUsed: result.url,
      status: result.status,
      durationMs: result.durationMs,
      extractedCount: Array.isArray(result.data) ? result.data.length : 0,
      chosenKey: "modular:page",
    },
  };
}

