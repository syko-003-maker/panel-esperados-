/**
 * Batch Discord member status endpoint
 * Now uses discord-batch-reliable.ts for cache + persistence + backoff
 */
import { NextResponse } from "next/server";
import { debug } from "@/lib/logger";
import { batchFetchDiscordMembers } from "@/lib/discord-batch-reliable";
import { requireChefOrEtatMajor } from "@/lib/guards";

export async function GET(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;
  const url = new URL(req.url);
  const idsParam = url.searchParams.get("ids");

  if (!idsParam) {
    return NextResponse.json({ error: "Missing ?ids parameter" }, { status: 400 });
  }

  const ids = idsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);

  if (ids.length === 0) {
    return NextResponse.json({ error: "No valid Discord IDs provided" }, { status: 400 });
  }

  const startTime = Date.now();
  debug("[discord-batch] request start", { requestedIds: ids.length, ids: ids.slice(0, 5) });

  const results = await batchFetchDiscordMembers(ids);

  const durationMs = Date.now() - startTime;
  
  // Compute stats
  const stats = {
    requested: ids.length,
    ok: Object.values(results.statuses || {}).filter((s: any) => s.ok).length,
    rateLimited: Object.values(results.statuses || {}).filter((s: any) => s.errorCode === "RATE_LIMIT").length,
    unavailable: Object.values(results.statuses || {}).filter((s: any) => s.errorCode === "UNAVAILABLE").length,
    durationMs,
  };

  debug("[discord-batch] response", stats);

  return NextResponse.json(
    { ...results, stats, durationMs },
    { status: 200 }
  );
}
