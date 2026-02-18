import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { makeRequestId, logInfo } from "@/lib/obs";

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/signin",
  "/access-denied",
  "/api/auth",
  "/api/health",
  "/api/ingest",
  "/api/ping",
  "/_next",
  "/assets",
  "/images",
];

const PUBLIC_PATHS = new Set([
  "/favicon.ico",
  "/logo-esperados.svg",
  "/robots.txt",
  "/sitemap.xml",
]);

/**
 * Worker endpoints that can be accessed via x-ingest-secret header
 * instead of NextAuth session
 */
const WORKER_ACCESSIBLE_PREFIXES = [
  "/api/staff/link",
  "/api/ingest/",
  "/api/health",
  "/api/ping",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function isWorkerAccessiblePath(pathname: string): boolean {
  return WORKER_ACCESSIBLE_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function getSessionToken(req: NextRequest): string | undefined {
  return (
    req.cookies.get("__Secure-next-auth.session-token")?.value ??
    req.cookies.get("next-auth.session-token")?.value ??
    req.cookies.get("__Host-next-auth.session-token")?.value
  );
}

export default function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  
  // Generate requestId if not present
  const requestId = req.headers.get("x-request-id") || makeRequestId();
  
  // Log request (skip static assets and healthchecks)
  if (!pathname.startsWith("/_next/static") && !pathname.startsWith("/api/ping") && !pathname.startsWith("/api/health")) {
    logInfo("http_request", {
      requestId,
      method: req.method,
      path: pathname,
    });
  }

  if (isPublicPath(pathname)) {
    const response = NextResponse.next();
    response.headers.set("x-request-id", requestId);
    return response;
  }

  // ✅ SECURITY: Check for worker authentication (machine-to-machine)
  // If request has valid x-ingest-secret header and targets worker-accessible endpoint,
  // bypass NextAuth session check and let route handler validate the secret
  const ingestSecret = req.headers.get("x-ingest-secret");
  const expectedSecret = process.env.INGEST_SECRET;
  
  if (ingestSecret && expectedSecret && ingestSecret === expectedSecret && isWorkerAccessiblePath(pathname)) {
    // Valid worker auth - bypass session check
    if (process.env.NODE_ENV !== "production") {
      console.log("[middleware] ingest bypass", pathname);
    }
    const response = NextResponse.next();
    response.headers.set("x-request-id", requestId);
    return response;
  }

  const token = getSessionToken(req);
  if (!token) {
    const nextPath = `${pathname}${search ?? ""}`;
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", nextPath);
    const response = NextResponse.redirect(url);
    response.headers.set("x-request-id", requestId);
    if (process.env.NODE_ENV !== "production") {
      console.log("[middleware] no token, redirect", { from: pathname, to: "/login" });
    }
    return response;
  }

  // ✅ FIX: Don't auto-redirect /login anymore - let /login/page.tsx handle logic
  // This prevents infinite loops when reason=not_linked is present
  // The /login page will check searchParams and decide whether to redirect or show form

  // ✅ Debug logging for troubleshooting (temporary)
  if (process.env.NODE_ENV !== "production" && !pathname.startsWith("/_next")) {
    console.log("[middleware] passthrough", { 
      pathname, 
      hasToken: !!token,
      search: search || "(none)" 
    });
  }

  const response = NextResponse.next();
  response.headers.set("x-request-id", requestId);
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
