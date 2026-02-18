/**
 * GET /api/staff/diagnostics/lyg/members
 * 
 * Diagnostic endpoint to debug LYG member fetching
 * Returns: urlUsed, status, contentType, extractedCount, rootKeys, firstTwoItems, precisionWarning
 */

import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { debug } from "@/lib/logger";
import { lygFetchMembers } from "@/lib/lyg-client";

const FAMILY_ID = "esperados";

export async function GET(req: Request) {
  try {
    // ✅ Check authorization
    const guard = await requirePrivileged();
    if (guard instanceof Response) {
      return guard;
    }

    debug("[diagnostics/lyg/members] Fetching members for diagnostics...");

    const response = await lygFetchMembers(FAMILY_ID, { timeoutMs: 15_000 });

    // Safely extract first two items with detailed info
    const firstTwoItems = response.data
      ? response.data.slice(0, 2).map(item => {
          // Truncate strings to 100 chars for safety, preserve steamId types
          const truncated: any = {};
          for (const [key, value] of Object.entries(item || {})) {
            if (key === 'steamId' || key === 'steamid') {
              // For steamId fields, show type and value explicitly
              truncated[key] = {
                type: typeof value,
                value: String(value).length > 20 ? String(value).slice(0, 20) + "..." : String(value),
              };
            } else if (typeof value === 'string') {
              truncated[key] = value.length > 100 ? value.slice(0, 100) + "..." : value;
            } else {
              truncated[key] = value;
            }
          }
          return truncated;
        })
      : [];

    const result = {
      ok: response.ok,
      status: response.status,
      error: response.error,
      meta: response.meta ? {
        urlUsed: response.meta.urlUsed,
        contentType: response.meta.contentType,
        rootKeys: response.meta.rootKeys,
        extractedCount: response.meta.extractedCount,
        skippedInvalid: response.meta.skippedInvalid,
        precisionWarning: response.meta.precisionWarning || false,
        precisionWarningNote: response.meta.precisionWarning 
          ? "Numeric steamId (17 digits) detected and converted to string to prevent precision loss"
          : undefined,
      } : undefined,
      firstTwoItems,
      totalCount: response.data?.length || 0,
    };

    debug("[diagnostics/lyg/members] Result:", result);

    return NextResponse.json(result);
  } catch (err: any) {
    console.error("[diagnostics/lyg/members] Exception:", err.message);
    return NextResponse.json(
      {
        ok: false,
        error: err.message,
      },
      { status: 500 }
    );
  }
}
