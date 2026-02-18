import { NextResponse, NextRequest } from "next/server";
import { lygFetchMembers } from "@/lib/lyg-client";

/**
 * DEBUG: Show raw response from LYG API
 * Usage: GET /api/debug/lyg-members-raw?familyId=esperados
 * 
 * Returns:
 * - fetch status and HTTP code
 * - contentType from LYG
 * - rootKeys: top-level JSON keys
 * - chosenKey: extraction method (direct, preferred:xxx, nested:xxx, fallback:xxx)
 * - extractedLength: items found
 * - validatedLength: items with valid steamId
 * - skippedInvalid: items skipped (no steamId)
 * - firstItemKeys: structure of first item
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
  const familyId = url.searchParams.get("familyId") || process.env.FAMILY_ID || "esperados";

  try {
    console.log("\n=== LYG API EXTRACTION DEBUG ===");
    console.log(`Family: ${familyId}`);

    const response = await lygFetchMembers(familyId, { timeoutMs: 15_000 });

    console.log("✓ Fetch success:", response.ok);
    console.log("✓ HTTP status:", response.status);
    console.log("✓ Content-Type:", response.meta?.contentType);
    console.log("✓ Root keys:", response.meta?.rootKeys?.join(", "));
    console.log("✓ Extraction method (chosenKey):", response.meta?.chosenKey);
    console.log("✓ Extracted items:", response.meta?.extractedCount);
    console.log("✓ Validated items:", response.data?.length);
    console.log("✓ Skipped (invalid steamId):", response.meta?.skippedInvalid);
    console.log("✓ URL used:", response.meta?.urlUsed);

    const firstItemKeys =
      response.data && response.data[0] && typeof response.data[0] === "object"
        ? Object.keys(response.data[0] as any)
        : [];

    if (response.data && response.data.length > 0) {
      console.log(`\n✓ Sample (first item) keys: ${firstItemKeys.join(", ")}`);
      console.log("  Data:", JSON.stringify(response.data[0], null, 2).split('\n').slice(0, 15).join('\n'));
    } else if (response.meta?.extractedCount === 0) {
      console.log("\n❌ No array found in response (extraction failed)");
      console.log("   chosenKey:", response.meta?.chosenKey);
      console.log("   rootKeys:", response.meta?.rootKeys?.join(", "));
    } else {
      console.log("\n❌ Array found but all items invalid");
      console.log("   Likely reason: steamId field name mismatch or invalid format");
    }

    console.log("\n=== END DEBUG ===\n");

    return NextResponse.json({
      success: response.ok,
      fetch: {
        status: response.status,
        error: response.error,
        urlUsed: response.meta?.urlUsed,
        contentType: response.meta?.contentType,
      },
      response: {
        rootKeys: response.meta?.rootKeys || [],
        chosenKey: response.meta?.chosenKey,
        precisionWarning: response.meta?.precisionWarning,
      },
      extraction: {
        extractedLength: response.meta?.extractedCount || 0,
        validatedLength: response.data?.length || 0,
        skippedInvalid: response.meta?.skippedInvalid || 0,
      },
      firstItemKeys,
      sampleFirstItem: response.data && response.data[0] 
        ? JSON.stringify(response.data[0]).slice(0, 500)
        : null,
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
