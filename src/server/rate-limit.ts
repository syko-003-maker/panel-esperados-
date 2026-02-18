import { prisma } from "@/lib/db";

export type RateLimitResult =
  | { ok: true; remaining: number; resetAt: Date }
  | { ok: false; retryAfterMs: number; resetAt: Date };

type RateLimitOptions = {
  discordId: string;
  key: string;
  limit?: number;
  windowMs?: number;
};

const DEFAULT_LIMIT = 3;
const DEFAULT_WINDOW_MS = 10 * 60 * 1000;

export async function enforceRateLimit({
  discordId,
  key,
  limit = DEFAULT_LIMIT,
  windowMs = DEFAULT_WINDOW_MS,
}: RateLimitOptions): Promise<RateLimitResult> {
  const now = new Date();
  const prismaClient = prisma as any;

  const existing = await prismaClient.rateLimit.findUnique({
    where: { discordId_key: { discordId, key } },
  });

  if (!existing) {
    const created = await prismaClient.rateLimit.create({
      data: {
        discordId,
        key,
        windowStart: now,
        count: 1,
      },
    });

    return {
      ok: true,
      remaining: Math.max(limit - 1, 0),
      resetAt: new Date(created.windowStart.getTime() + windowMs),
    };
  }

  const elapsed = now.getTime() - existing.windowStart.getTime();

  if (elapsed >= windowMs) {
    const updated = await prismaClient.rateLimit.update({
      where: { id: existing.id },
      data: { windowStart: now, count: 1 },
    });

    return {
      ok: true,
      remaining: Math.max(limit - 1, 0),
      resetAt: new Date(updated.windowStart.getTime() + windowMs),
    };
  }

  if (existing.count >= limit) {
    return {
      ok: false,
      retryAfterMs: windowMs - elapsed,
      resetAt: new Date(existing.windowStart.getTime() + windowMs),
    };
  }

  const updated = await prismaClient.rateLimit.update({
    where: { id: existing.id },
    data: { count: { increment: 1 } },
  });

  return {
    ok: true,
    remaining: Math.max(limit - updated.count, 0),
    resetAt: new Date(updated.windowStart.getTime() + windowMs),
  };
}
