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
    // 2 min 30, calé SOUS la cadence du cron worker (3 min, cf.
    // PLAYTIME_AUTO_SYNC_INTERVAL_MS). L'ancienne valeur d'1 h sautait 19 tirs
    // sur 20 — mesuré : 19 `skip_min_interval` pour 1 exécution réelle par
    // heure, le tout journalisé « ok 200 », donc invisible.
    //
    // La marge de 30 s absorbe la dérive d'ordonnancement sans jamais bloquer
    // un tir légitime, tout en refusant encore les rafales (un
    // /api/staff/sync/all lancé juste après un tick reste ignoré).
    //
    // Coût : 1 appel LYG par synchro (l'endpoint renvoie toute la famille),
    // soit +19/h sur ~942 — l'endpoint est déjà appelé 720 fois par heure par
    // in-family-loop. Effet de bord voulu : la fraîcheur du playtime ne dépend
    // plus de ensureFreshFamilyPlaytime (garde 5 min, en mémoire, déclenchée
    // par les pages staff) et tient donc aussi la nuit.
    minIntervalMs: 150_000,
    lockTtlMs: 120_000,
    run: async () => syncMemberPlaytime7d({ familyId: "esperados", token }),
  });
}