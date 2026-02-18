/**
 * /api/debug/lyg - LYG API Health Check
 * 
 * TESTING CHECKLIST:
 * 1. GET /api/debug/lyg - Should return JSON with:
 *    - envLoaded: { hasBaseUrl, hasToken, hasFamilyId, familyIdValue }
 *    - endpoints: Array of { name, url, status, duration, data?, error? }
 * 2. Verify LYG_BASE_URL, LYG_TOKEN, FAMILY_ID in .env.local
 * 3. Expected responses:
 *    - Status 200 if authenticated
 *    - Status 401/403 if missing env vars
 *    - Each endpoint shows HTTP status + response time
 * 
 * DEV ONLY: This endpoint is protected by requirePrivileged()
 */

import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { LYG_BASE_URL, LYG_TOKEN } from "@/lib/lyg";
import { getFamilySlug } from "@/lib/family";
import { fetchFamilyEndpointText, getLygEndpointDiagnostics } from "@/lib/lyg-client";

export async function GET() {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const familySlug = getFamilySlug();

  // Check environment variables (mask token)
  const envLoaded = {
    hasBaseUrl: !!LYG_BASE_URL,
    hasToken: !!LYG_TOKEN,
    tokenPrefix: LYG_TOKEN ? `${LYG_TOKEN.slice(0, 4)}***` : null,
    familyId: familySlug,
    familySlug,
  };

  const [membersProbe, banklogsProbe] = await Promise.all([
    fetchFamilyEndpointText("members", familySlug, { timeoutMs: 8_000 }),
    fetchFamilyEndpointText("banklogs", familySlug, { timeoutMs: 8_000 }),
  ]);

  const endpoints = {
    members: {
      tested: membersProbe.tested ?? [],
      chosen: membersProbe.pathUsed,
      lastStatus: membersProbe.status,
    },
    banklogs: {
      tested: banklogsProbe.tested ?? [],
      chosen: banklogsProbe.pathUsed,
      lastStatus: banklogsProbe.status,
    },
  };

  return NextResponse.json({
    ok: membersProbe.ok && banklogsProbe.ok,
    envLoaded,
    endpoints,
    diagnostics: getLygEndpointDiagnostics(),
    timestamp: new Date().toISOString(),
  });
}
