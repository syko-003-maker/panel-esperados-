import { NextRequest, NextResponse } from "next/server";

// ---------------------------------------------------------------------------
// In-memory rate limiter (par IP, réinitialisé au redémarrage)
// ---------------------------------------------------------------------------
type RateLimitEntry = { count: number; resetAt: number };
const rateLimitStore = new Map<string, RateLimitEntry>();

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("cf-connecting-ip") ??       // Cloudflare
    req.headers.get("x-real-ip") ??
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

function rateLimit(key: string, maxRequests: number, windowMs: number): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(key);

  if (!entry || now > entry.resetAt) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs });
    return true; // allowed
  }

  entry.count++;
  if (entry.count > maxRequests) return false; // blocked
  return true;
}

// Nettoyage périodique pour éviter les fuites mémoire
// (Next.js middleware est stateless mais on nettoie quand même)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of rateLimitStore.entries()) {
      if (now > entry.resetAt) rateLimitStore.delete(key);
    }
  }, 60_000);
}

// ---------------------------------------------------------------------------
// Config des limites par route
// ---------------------------------------------------------------------------
const RATE_LIMIT_RULES: Array<{
  pattern: RegExp;
  maxRequests: number;
  windowMs: number;
  label: string;
}> = [
  // Auth — protection brute force
  { pattern: /^\/api\/auth\//, maxRequests: 20, windowMs: 60_000, label: "auth" },
  // Contact & link — anti-spam
  { pattern: /^\/api\/contact\//, maxRequests: 5, windowMs: 60_000, label: "contact" },
  // Ingest — bot/worker, assez généreux
  { pattern: /^\/api\/ingest\//, maxRequests: 60, windowMs: 60_000, label: "ingest" },
  // Staff routes — usage normal
  { pattern: /^\/api\/staff\//, maxRequests: 120, windowMs: 60_000, label: "staff" },
  // Admin routes — très restrictif
  { pattern: /^\/api\/admin\//, maxRequests: 30, windowMs: 60_000, label: "admin" },
  // Discord worker routes
  { pattern: /^\/api\/discord\/resync/, maxRequests: 5, windowMs: 60_000, label: "discord-resync" },
  { pattern: /^\/api\/discord\/role-jobs/, maxRequests: 10, windowMs: 60_000, label: "discord-role-jobs" },
];

// ---------------------------------------------------------------------------
// Middleware principal
// ---------------------------------------------------------------------------
export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Trouver la règle applicable
  const rule = RATE_LIMIT_RULES.find((r) => r.pattern.test(pathname));
  if (rule) {
    const ip = getClientIp(req);
    const key = `${rule.label}:${ip}`;
    const allowed = rateLimit(key, rule.maxRequests, rule.windowMs);

    if (!allowed) {
      return new NextResponse(
        JSON.stringify({ error: "Too Many Requests", retryAfter: Math.ceil(rule.windowMs / 1000) }),
        {
          status: 429,
          headers: {
            "Content-Type": "application/json",
            "Retry-After": String(Math.ceil(rule.windowMs / 1000)),
            "X-RateLimit-Limit": String(rule.maxRequests),
          },
        }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/api/auth/:path*",
    "/api/contact/:path*",
    "/api/ingest/:path*",
    "/api/staff/:path*",
    "/api/admin/:path*",
    "/api/discord/resync",
    "/api/discord/role-jobs/:path*",
  ],
};
