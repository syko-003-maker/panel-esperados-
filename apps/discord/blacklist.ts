/**
 * User blacklist management
 * Temporary bans for abuse
 */

type BlacklistEntry = {
  reason: string;
  expiresAt: number;
};

const blacklist = new Map<string, BlacklistEntry>();
const violations = new Map<string, number>();

export function isBlacklisted(userId: string): {
  blocked: boolean;
  reason?: string;
  expiresAt?: number;
} {
  const entry = blacklist.get(userId);
  if (!entry) return { blocked: false };

  const now = Date.now();
  if (now >= entry.expiresAt) {
    blacklist.delete(userId);
    return { blocked: false };
  }

  return {
    blocked: true,
    reason: entry.reason,
    expiresAt: entry.expiresAt,
  };
}

export function addToBlacklist(userId: string, minutes: number, reason: string): void {
  const expiresAt = Date.now() + minutes * 60 * 1000;
  blacklist.set(userId, { reason, expiresAt });
  console.log(`[blacklist] User ${userId} blacklisted for ${minutes}min: ${reason}`);
}

export function recordViolation(userId: string, type: "spam" | "abuse"): void {
  const count = (violations.get(userId) || 0) + 1;
  violations.set(userId, count);

  // Auto-blacklist after 3 violations
  if (count >= 3) {
    addToBlacklist(userId, 30, `Violations répétées (${type})`);
    violations.delete(userId);
  }
}

// Cleanup expired entries every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [userId, entry] of blacklist.entries()) {
    if (now >= entry.expiresAt) {
      blacklist.delete(userId);
    }
  }

  // Reset violations after 1 hour
  for (const [userId, _] of violations.entries()) {
    violations.delete(userId);
  }
}, 10 * 60 * 1000);
