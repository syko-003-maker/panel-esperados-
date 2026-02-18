import { NextRequest, NextResponse } from "next/server";
import { formatBanklogTime } from "@/lib/banklogs-formatter";

/**
 * Alias for backward compatibility with debug code
 * New code should use formatBanklogTime from @/lib/banklogs-formatter
 */
const formatBrussels = formatBanklogTime;

/**
 * DEBUG: Verify banklogs timezone formatting
 * 
 * Usage: GET /api/debug/banklogs-time?lastSyncRaw=2026-02-03T18:45:00Z&firstRowRaw=2026-02-03T18:45:00Z
 * 
 * Returns:
 * - Raw values (as provided in query)
 * - Formatted values (after formatBrussels)
 * - TZ detection for each value (has timezone or not)
 * - Match: whether they render identically
 * 
 * DEV ONLY: Returns 403 in production
 */
export async function GET(req: NextRequest) {
  // DEV ONLY: only expose in non-production
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { error: "Debug endpoint disabled in production" },
      { status: 403 }
    );
  }

  const url = new URL(req.url);
  
  // For testing: allow passing values via query params
  // In real usage, we'd fetch from sync-state and banklogs API
  const lastSyncRaw = url.searchParams.get("lastSyncRaw") || new Date().toISOString();
  const firstRowRaw = url.searchParams.get("firstRowRaw") || new Date().toISOString();

  try {
    const lastSyncFormatted = formatBrussels(lastSyncRaw);
    const firstRowFormatted = formatBrussels(firstRowRaw);
    
    const lastSyncHasTz = /T.*(Z|[+-]\d{2}:?\d{2})$/.test(lastSyncRaw);
    const firstRowHasTz = /T.*(Z|[+-]\d{2}:?\d{2})$/.test(firstRowRaw);
    
    const match = lastSyncFormatted === firstRowFormatted;

    console.log("\n=== BANKLOGS TIMEZONE DEBUG ===");
    console.log(`lastSync (raw): ${lastSyncRaw}`);
    console.log(`lastSync (fmt): ${lastSyncFormatted}`);
    console.log(`lastSync TZ: ${lastSyncHasTz ? "ISO+TZ" : "local/other"}`);
    console.log(`firstRow (raw): ${firstRowRaw}`);
    console.log(`firstRow (fmt): ${firstRowFormatted}`);
    console.log(`firstRow TZ: ${firstRowHasTz ? "ISO+TZ" : "local/other"}`);
    console.log(`Match: ${match ? "✓ YES" : "✗ NO (mismatch)"}`);
    console.log("=== END DEBUG ===\n");

    return NextResponse.json({
      success: true,
      lastSync: {
        raw: lastSyncRaw,
        formatted: lastSyncFormatted,
        hasTZ: lastSyncHasTz,
      },
      firstRow: {
        raw: firstRowRaw,
        formatted: firstRowFormatted,
        hasTZ: firstRowHasTz,
      },
      match,
      recommendation: !match
        ? "Values format differently. Check if one has TZ and other doesn't."
        : "✓ Both values render identically in Europe/Brussels timezone",
      note: "This endpoint is DEV ONLY and will return 403 in production",
    });
  } catch (error: any) {
    console.error("DEBUG ERROR:", error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
        note: "This endpoint is DEV ONLY and will return 403 in production",
      },
      { status: 500 }
    );
  }
}
