import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { requirePrivileged } from "@/lib/guards";
import { runLygMembersSync } from "@/lib/lyg/sync-members";
import { runLygBanklogsSync } from "@/lib/lyg/sync-banklogs";
import { runLygPlaytimeSync } from "@/lib/lyg/sync-playtime";

export async function POST(req: Request) {
  const startedAt = Date.now();
  const mode = new URL(req.url).searchParams.get("mode") === "members-only" ? "members-only" : "full";

  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const source = "manual";

  const members = await runLygMembersSync(source);
  const result: any = {
    ok: members.ok,
    message: "",
    members: {
      ok: members.ok,
      fetched: Number(members.metrics?.fetched ?? 0),
      upserted: Number((members.metrics?.created ?? 0) + (members.metrics?.updated ?? 0)),
      created: Number(members.metrics?.created ?? 0),
      updated: Number(members.metrics?.updated ?? 0),
      unchanged: Number(members.metrics?.unchanged ?? 0),
      skipped: Number(members.metrics?.skippedInvalid ?? 0),
      reason: members.reason,
      backoffMs: members.backoffMs,
      durationMs: members.durationMs,
    },
    warnings: [] as Array<{ type: string; error: string; hint?: string }>,
  };

  if (!members.ok) {
    result.message = `Members sync failed: ${members.reason ?? "unknown"}`;
    result.elapsedMs = Date.now() - startedAt;
    return NextResponse.json(result, { status: 502 });
  }

  if (mode === "full") {
    const playtime = await runLygPlaytimeSync(source);
    result.playtimeResult = playtime.ok
      ? { ok: true, ...(playtime.metrics ?? {}), durationMs: playtime.durationMs }
      : { ok: false, error: playtime.reason ?? "Playtime sync failed", backoffMs: playtime.backoffMs, durationMs: playtime.durationMs };
    if (!playtime.ok) {
      result.warnings.push({
        type: "playtime7d",
        error: playtime.reason ?? "Playtime sync failed",
        hint: "Members synced; playtime failed.",
      });
    }

    const banklogs = await runLygBanklogsSync(source);
    result.banklogs = {
      ok: banklogs.ok,
      inserted: Number(banklogs.metrics?.inserted ?? 0),
      skipped: Number(banklogs.metrics?.skipped ?? 0),
      reason: banklogs.reason,
      backoffMs: banklogs.backoffMs,
      durationMs: banklogs.durationMs,
      pagesAttempted: Number(banklogs.metrics?.pagesAttempted ?? 0),
      pagesFetched: Number(banklogs.metrics?.pagesFetched ?? 0),
      stopReason: banklogs.metrics?.stopReason ?? null,
    };

    if (!banklogs.ok) {
      result.warnings.push({
        type: "banklogs",
        error: banklogs.reason ?? "banklogs failed",
        hint: "Will retry with lock/backoff protections.",
      });
    }
  }

  result.ok = true;
  result.message = `Sync ${mode} OK: members created=${result.members.created}, updated=${result.members.updated}, unchanged=${result.members.unchanged}`;
  result.elapsedMs = Date.now() - startedAt;

  try {
    revalidatePath("/staff/members");
    revalidatePath("/staff/banklogs");
  } catch {
    // Non-blocking.
  }

  return NextResponse.json(result);
}
