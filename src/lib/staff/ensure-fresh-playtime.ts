import { syncMemberPlaytime7d } from "@/lib/sync/syncMemberPlaytime7d";
import { logWarn } from "@/lib/obs";

const LAST_SYNC_BY_FAMILY = new Map<string, number>();
const DEFAULT_MIN_INTERVAL_MS = 5 * 60 * 1000;

export async function ensureFreshFamilyPlaytime(
  familyId: string,
  options?: { minIntervalMs?: number }
): Promise<boolean> {
  const token = process.env.LYG_TOKEN?.trim();
  if (!token) return false;

  const minIntervalMs = options?.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS;
  const now = Date.now();
  const lastSyncAt = LAST_SYNC_BY_FAMILY.get(familyId) ?? 0;

  if (now - lastSyncAt < minIntervalMs) {
    return false;
  }

  LAST_SYNC_BY_FAMILY.set(familyId, now);

  try {
    await syncMemberPlaytime7d({ familyId, token });
    return true;
  } catch (error) {
    // Ce chemin était totalement muet : une panne LYG ici ne laissait aucune
    // trace, alors que c'est lui qui rafraîchit le playtime au chargement des
    // pages staff. On journalise sans changer le comportement — la page doit
    // continuer à s'afficher avec les valeurs déjà en base.
    logWarn("playtime_ensure_fresh_failed", {
      familyId,
      error: error instanceof Error ? error.message : String(error),
    });
    LAST_SYNC_BY_FAMILY.delete(familyId);
    return false;
  }
}
