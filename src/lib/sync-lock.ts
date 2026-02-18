/**
 * Sync Lock Utility
 * Purpose: Prevent concurrent syncs for same family/resource
 * 
 * Uses in-memory lock with TTL to avoid database overhead
 * Useful for preventing 10 users triggering 10 simultaneous syncs
 */

const locks = new Map<string, number>(); // key => expiresAt timestamp

export type SyncLockResult = 
  | { locked: false; acquired: boolean }
  | { locked: true; remainingMs: number; lockedAt: number };

/**
 * Try to acquire a lock
 * @param key Lock identifier (e.g., "sync:members:los-esperados")
 * @param ttlMs Lock duration in ms (default: 30s)
 * @returns Lock result
 */
export function acquireSyncLock(key: string, ttlMs = 30000): SyncLockResult {
  const now = Date.now();
  const existingLock = locks.get(key);

  // Check if lock is expired
  if (existingLock && existingLock > now) {
    return {
      locked: true,
      remainingMs: existingLock - now,
      lockedAt: existingLock - ttlMs,
    };
  }

  // Acquire lock
  locks.set(key, now + ttlMs);

  return {
    locked: false,
    acquired: true,
  };
}

/**
 * Release a lock manually
 * @param key Lock identifier
 */
export function releaseSyncLock(key: string): void {
  locks.delete(key);
}

/**
 * Check if locked without acquiring
 * @param key Lock identifier
 */
export function isSyncLocked(key: string): boolean {
  const now = Date.now();
  const existingLock = locks.get(key);
  return existingLock ? existingLock > now : false;
}

/**
 * Clean up expired locks (call periodically)
 */
export function cleanupExpiredLocks(): number {
  const now = Date.now();
  let cleaned = 0;

  for (const [key, expiresAt] of locks.entries()) {
    if (expiresAt <= now) {
      locks.delete(key);
      cleaned++;
    }
  }

  return cleaned;
}

// Auto-cleanup every 60 seconds
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const cleaned = cleanupExpiredLocks();
    if (cleaned > 0) {
      console.log(`[sync-lock] Cleaned ${cleaned} expired locks`);
    }
  }, 60000);
}
