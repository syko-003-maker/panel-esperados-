import { runControlledLygSync, type ControlledSyncResult, type SyncSource } from "@/lib/lyg/sync-runner";
import { syncMemberPlaytime7d, type SyncPlaytime7dResult } from "@/lib/sync/syncMemberPlaytime7d";

export type PlaytimeSyncResult = ControlledSyncResult<SyncPlaytime7dResult>;

export async function runLygPlaytimeSync(source: SyncSource = "cron"): Promise<PlaytimeSyncResult> {
  const token = process.env.LYG_TOKEN?.trim();
  if (!token) {
    return {
      ok: false,
      type: "playtime",
      source,
      reason: "LYG_TOKEN missing",
      durationMs: 0,
    };
  }

  return runControlledLygSync<SyncPlaytime7dResult>({
    type: "playtime",
    source,
    familyId: "esperados",
    minIntervalMs: 60 * 60_000,
    lockTtlMs: 120_000,
    run: async () => syncMemberPlaytime7d({ familyId: "esperados", token }),
  });
}