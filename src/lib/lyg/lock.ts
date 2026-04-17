import { acquireLock, releaseLock } from "@/lib/cache";

export type SyncLockHandle = {
  key: string;
  holder: string;
};

export async function acquireSyncTypeLock(type: "members" | "banklogs" | "infos" | "playtime", familyId: string, ttlMs = 60_000): Promise<SyncLockHandle | null> {
  const key = `lyg:sync:${type}:${familyId}`;
  const holder = await acquireLock(key, ttlMs);
  if (!holder) return null;
  return { key, holder };
}

export async function releaseSyncTypeLock(handle: SyncLockHandle | null): Promise<void> {
  if (!handle) return;
  await releaseLock(handle.key, handle.holder);
}
