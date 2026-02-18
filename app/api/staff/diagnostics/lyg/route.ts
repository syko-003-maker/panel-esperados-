import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { lygFetchJson, lygFetchText, type LygResponse } from "@/lib/lyg-client";
import { fetchLygBanklogs } from "@/lib/lyg-banklogs";
import { debug } from "@/lib/logger";

const FAMILY_ID = "esperados";

/**
 * GET /api/staff/diagnostics/lyg
 * 
 * Test LYG API connectivity with real body snippets, headers, and status codes
 * RBAC: Chef Famille or État-Major only
 * 
 * Returns detailed diagnostics:
 * - Environment flags (hasBaseUrl, hasToken, hasFamilyId)
 * - Each endpoint: name, url, status, duration, contentType, bodySnippet (800 chars)
 * - For banklogs: triedUrls showing fallback chain
 * - If any endpoint fails with fetch/SSL error: includes node error code and message
 */
export async function GET() {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const timestamp = new Date().toISOString();
  
  // Environment diagnostics
  const envDiags = {
    hasBaseUrl: !!process.env.LYG_BASE_URL,
    baseUrlValue: process.env.LYG_BASE_URL 
      ? process.env.LYG_BASE_URL.slice(0, 50) + "..." 
      : "NOT SET",
    hasToken: !!process.env.LYG_TOKEN,
    tokenPrefix: process.env.LYG_TOKEN 
      ? process.env.LYG_TOKEN.slice(0, 10) + "***" 
      : "NOT SET",
    hasFamilyId: !!FAMILY_ID,
    familyId: FAMILY_ID,
  };

  const tests: Array<{
    name: string;
    url: string;
    ok: boolean;
    status: number;
    duration: number;
    contentType?: string | null;
    bodySnippet?: string;
    error?: string;
    hint?: string;
    triedUrls?: Array<{ 
      url: string; 
      status: number; 
      tried: boolean;
      contentType?: string | null;
      bodySnippet?: string;
    }>;
  }> = [];

  // Test endpoints in parallel
  const [membersResult, infosResult, banklogsResult] = await Promise.all([
    testEndpoint("members", `/familles/${FAMILY_ID}/members`),
    testEndpoint("infos", `/familles/${FAMILY_ID}/infos`),
    testBanklogs(), // Special handling for banklogs with fallback
  ]);

  tests.push(membersResult, infosResult, banklogsResult);

  const allSuccess = tests.every((t) => t.ok);

  return NextResponse.json({
    ok: allSuccess,
    timestamp,
    environment: envDiags,
    endpoints: tests,
  });
}

async function testEndpoint(
  name: string,
  path: string
): Promise<{
  name: string;
  url: string;
  ok: boolean;
  status: number;
  duration: number;
  contentType?: string | null;
  bodySnippet?: string;
  error?: string;
  hint?: string;
}> {
  debug(`[lyg-diag] Testing ${name}: ${path}`);

  try {
    // Try JSON first
    const result = await lygFetchJson<any>(path, { timeoutMs: 15_000 });

    let bodySnippet: string | undefined;

    // If failed or non-JSON, try text to get raw response
    if (!result.ok || !result.data) {
      const textResult = await lygFetchText(path, { timeoutMs: 15_000 });
      if (textResult.text) {
        bodySnippet = textResult.text.slice(0, 800);
      }
    } else if (result.text) {
      bodySnippet = result.text.slice(0, 800);
    }

    return {
      name,
      url: result.resolvedUrl || path,
      ok: result.ok,
      status: result.status,
      duration: result.duration || 0,
      contentType: result.contentType,
      bodySnippet,
      error: result.error,
      hint: result.hint,
    };
  } catch (err: any) {
    return {
      name,
      url: path,
      ok: false,
      status: 0,
      duration: 0,
      error: `Exception: ${err.message}`,
      hint: `Node error: ${err.code || err.name}`,
    };
  }
}

async function testBanklogs(): Promise<{
  name: string;
  url: string;
  ok: boolean;
  status: number;
  duration: number;
  contentType?: string | null;
  bodySnippet?: string;
  error?: string;
  hint?: string;
  triedUrls?: Array<{ 
    url: string; 
    status: number; 
    tried: boolean;
    contentType?: string | null;
    bodySnippet?: string;
  }>;
}> {
  debug(`[lyg-diag] Testing banklogs...`);

  try {
    const result = await fetchLygBanklogs(FAMILY_ID, { timeoutMs: 15_000 });

    let bodySnippet: string | undefined;

    // If failed, get text response for debugging
    if (!result.ok && result.text) {
      bodySnippet = result.text.slice(0, 800);
    } else if (result.ok && result.text) {
      bodySnippet = result.text.slice(0, 800);
    }

    // Generate specific hint based on status
    let hint: string;

    if (result.ok) {
      hint = `✓ Success: Banklogs available`;
    } else if (result.status === 401 || result.status === 403) {
      hint = `✗ Authentication failed: Check LYG_TOKEN is valid and has banklogs permission.`;
    } else if (result.status === 404) {
      hint = `✗ Banklogs endpoint not found (route mismatch).`;
    } else {
      hint = result.error || "Banklogs endpoint unavailable (check logs for details).";
    }

    return {
      name: "banklogs",
      url: result.url || "unknown",
      ok: result.ok,
      status: result.status,
      duration: result.durationMs || 0,
      contentType: undefined,
      bodySnippet,
      error: result.error,
      hint,
      triedUrls: [],
    };
  } catch (err: any) {
    return {
      name: "banklogs",
      url: "unknown",
      ok: false,
      status: 0,
      duration: 0,
      error: `Exception: ${err.message}`,
      hint: `Node error: ${err.code || err.name}`,
    };
  }
}
