const BACKOFF_STEPS_MS = [5 * 60_000, 15 * 60_000, 30 * 60_000];

export function nextBackoffMs(currentBackoffMs?: number | null): number {
  const cap = Math.max(Number(process.env.LYG_BACKOFF_MAX_MS ?? 60 * 60_000) || 60 * 60_000, 5 * 60_000);
  const current = Number(currentBackoffMs ?? 0);

  for (const step of BACKOFF_STEPS_MS) {
    if (current < step) return Math.min(step, cap);
  }

  return Math.min(cap, Math.max(current, BACKOFF_STEPS_MS[BACKOFF_STEPS_MS.length - 1]));
}

export function isRateLimitError(status: number, error?: string): boolean {
  const msg = String(error ?? "").toLowerCase();
  return status === 429 || msg.includes("rate limit") || msg.includes("trop de requ");
}
