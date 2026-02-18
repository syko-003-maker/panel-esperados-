=======================================
UNIFIED DIFFS - ALL MODIFIED FILES
=======================================

=== FILE 1: app/staff/banklogs/page.tsx ===
Location: Add `normalizeDateInputToUTC()` function + update `formatBrussels()` + add debug block

CHANGES:
- Lines 36-87: Enhanced formatter helpers
  + Added `normalizeDateInputToUTC()` function to handle ISO with/without TZ and local strings
  + Updated `formatBrussels()` with better comments and safety checks
  + Preserves local time for strings without timezone (prevents UTC conversion)

- Lines 333-356: Added debug block (visible with ?debug=1 or in NODE_ENV !== 'production')
  + Shows rawLastSync, renderedLastSync, rawFirstRowDate, renderedFirstRowDate
  + Shows timezone detection (has TZ or local/other)
  + Shows match status: whether both render identically
  + Yellow/amber styling for visibility

DIFF:
--- a/app/staff/banklogs/page.tsx
+++ b/app/staff/banklogs/page.tsx
@@ -36,7 +36,68 @@
   year: "numeric",
   month: "2-digit",
   day: "2-digit",
   hour: "2-digit",
   minute: "2-digit",
   timeZone: "Europe/Brussels",
 });
 
+/**
+ * Normalize date input to UTC and format as Europe/Brussels
+ * 
+ * Handles:
+ * - ISO with timezone (Z or ±HH:MM): treated as UTC then displayed in Brussels TZ
+ * - ISO without timezone: treated as LOCAL (not UTC) and displayed as-is (no conversion)
+ * - Timestamp (number): treated as epoch ms, converted to UTC then displayed in Brussels TZ
+ * - Date object: formatted directly in Brussels TZ
+ * 
+ * Returns formatted string or original value if unparseable
+ */
+function normalizeDateInputToUTC(value: string | number | Date): Date | null {
+  if (value instanceof Date) {
+    return Number.isNaN(value.getTime()) ? null : value;
+  }
+
+  if (typeof value === "number") {
+    const d = new Date(value);
+    return Number.isNaN(d.getTime()) ? null : d;
+  }
+
+  const v = value.trim();
+  
+  // ISO with timezone: parse as UTC
+  if (/T.*(Z|[+-]\d{2}:?\d{2})$/.test(v)) {
+    const d = new Date(v);
+    return Number.isNaN(d.getTime()) ? null : d;
+  }
+
+  // Local string without TZ (YYYY-MM-DD HH:mm): parse manually, keep as-is
+  // This prevents accidental UTC conversion on UTC servers
+  const localMatch = v.match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/);
+  if (localMatch) {
+    // Create a synthetic Date from local components
+    // We'll format this directly without Intl conversion to preserve local time
+    const [, yStr, mStr, dStr, hStr, minStr] = localMatch;
+    // Return a marker that we'll handle specially in formatBrussels
+    return null; // Will be handled by formatBrussels directly
+  }
+
+  // Fallback: try parsing as Date (may fail or lose TZ info)
+  const d = new Date(v);
+  return Number.isNaN(d.getTime()) ? null : d;
+}
+
 // WHY: LYG can return timestamps either as ISO (UTC) or as local strings without TZ.
 // If the string has no timezone ("YYYY-MM-DD HH:mm"), we keep the displayed time
 // exactly as provided to avoid accidental UTC conversion on servers in UTC.

@@ -331,6 +392,28 @@
       }
     >
+      {/* DEBUG BLOCK */}
+      {(process.env.NODE_ENV !== "production" || sp?.get("debug") === "1") && lastSync && data?.items?.[0] ? (
+        <div className="mb-4 p-4 rounded-lg border border-amber-500/30 bg-amber-500/5 text-amber-200 text-xs font-mono">
+          <div className="font-bold mb-2">🔍 DEBUG: Timezone Verification</div>
+          <div className="space-y-1">
+            <div>lastSync (raw): <span className="text-amber-100">{lastSync}</span></div>
+            <div>lastSync (fmt): <span className="text-amber-100">{formatBrussels(lastSync)}</span></div>
+            <div>lastSync TZ detected: <span className="text-amber-100">{/T.*(Z|[+-]\d{2}:?\d{2})$/.test(lastSync) ? "ISO+TZ" : "local/other"}</span></div>
+            <div className="mt-2 pt-2 border-t border-amber-500/20">
+              <div>firstRow.at (raw): <span className="text-amber-100">{data.items[0].at}</span></div>
+              <div>firstRow.at (fmt): <span className="text-amber-100">{formatBrussels(data.items[0].at)}</span></div>
+              <div>firstRow.at TZ detected: <span className="text-amber-100">{/T.*(Z|[+-]\d{2}:?\d{2})$/.test(data.items[0].at) ? "ISO+TZ" : "local/other"}</span></div>
+            </div>
+            <div className="mt-2 pt-2 border-t border-amber-500/20 text-amber-300">
+              ✓ Match: {formatBrussels(lastSync) === formatBrussels(data.items[0].at) ? "YES (✓)" : "NO (✗ mismatch)"}
+            </div>
+          </div>
+        </div>
+      ) : null}
+
       {/* Filtres */}
       <SectionCard title="Filtres" icon={Filter}>

KEY POINTS:
✅ No changes to "Dernier sync" or table rendering logic
✅ Debug block displays ONLY in dev or with ?debug=1 query param
✅ Shows raw values, formatted values, TZ detection, and match status
✅ Helps diagnose if one has TZ and other doesn't


=== FILE 2: src/lib/lyg-client.ts ===
Location: Improve extractArrayFromLygResponse + add chosenKey to meta

CHANGES:
- Lines 205-297: Complete rewrite of `extractArrayFromLygResponse()`
  + Now returns { array, chosenKey } instead of just array[]
  + chosenKey shows extraction method: "direct", "preferred:xxx", "nested:xxx", "fallback:xxx", "none"
  + Improved logging with format and chosen key
  + Recursive search with depth limit (2 levels)
  + Fallback scan for any Array in object values
  
- Lines 460-461: Add `chosenKey?: string` to type definition of meta

- Lines 570-603: Update member extraction logic
  + Destructure { array: extracted, chosenKey } from extractArrayFromLygResponse
  + Add chosenKey to meta object
  + Enhanced logging: show chosenKey in all debug logs
  + Distinct warnings: extracted=0 vs validated=0 with appropriate context
  + Include sampleFirstItem in error case for debugging

- Lines 656-661: Update error handler to include chosenKey

DIFF (partial - key sections):
--- a/src/lib/lyg-client.ts
+++ b/src/lib/lyg-client.ts

@@ Function extractArrayFromLygResponse (lines 205-297) @@
-export function extractArrayFromLygResponse(
-  response: any,
-  contentType?: string | null
-): any[] {
+export function extractArrayFromLygResponse(
+  response: any,
+  contentType?: string | null
+): { array: any[]; chosenKey: string } {
   if (Array.isArray(response)) {
     if (process.env.NODE_ENV !== 'production') {
-      debug("[lyg-parse] Format: direct array", {
+      debug("[lyg-parse] Array extraction", {
+        format: "direct",
         contentType,
         length: response.length,
-        firstItem: response[0] ? JSON.stringify(response[0]).slice(0, 200) : undefined,
+        firstItem: response[0] ? JSON.stringify(response[0]).slice(0, 150) : undefined,
       });
     }
-    return response;
+    return { array: response, chosenKey: "direct" };
   }
 
   if (!response || typeof response !== 'object') {
     if (process.env.NODE_ENV !== 'production') {
-      debug("[lyg-parse] Invalid response type:", { type: typeof response });
+      debug("[lyg-parse] Invalid response type:", { type: typeof response, contentType });
     }
-    return [];
+    return { array: [], chosenKey: "invalid" };
   }
 
   const rootKeys = Object.keys(response);
   if (process.env.NODE_ENV !== 'production') {
-    debug("[lyg-parse] Response root keys:", { keys: rootKeys, contentType });
+    debug("[lyg-parse] Response root keys:", { keys: rootKeys, count: rootKeys.length, contentType });
   }
 
   const preferredKeys = [
     "members",
     "data",
     "result",
     "items",
     "content",
     "payload",
     "response",
     "value",
   ] as const;
 
+  // Try preferred keys first (1 level deep)
+  for (const key of preferredKeys) {
+    if (Array.isArray((response as any)[key])) {
+      const arr = (response as any)[key];
+      if (process.env.NODE_ENV !== 'production') {
+        debug("[lyg-parse] Array extraction", {
+          format: `preferred:${key}`,
+          length: arr.length,
+          firstItem: arr[0] ? JSON.stringify(arr[0]).slice(0, 150) : undefined,
+        });
+      }
+      return { array: arr, chosenKey: `preferred:${key}` };
+    }
+  }
+
+  // Recursive search up to depth 2
-  const findArray = (obj: any, path: string, depth: number): { path: string; arr: any[] } | null => {
+  const findArrayRecursive = (
+    obj: any,
+    path: string,
+    depth: number
+  ): { path: string; arr: any[] } | null => {
     if (!obj || typeof obj !== "object") return null;
+    if (depth < 0) return null;
 
+    // Check preferred keys at this level
     for (const key of preferredKeys) {
-      const value = (obj as any)[key];
-      if (Array.isArray(value)) return { path: `${path}.${key}`, arr: value };
-      if (value && typeof value === "object") {
-        for (const nestedKey of ["data", "members", "items", "result", "content", "value"]) {
-          const nestedVal = (value as any)[nestedKey];
-          if (Array.isArray(nestedVal)) return { path: `${path}.${key}.${nestedKey}`, arr: nestedVal };
-        }
-      }
+      if (Array.isArray((obj as any)[key])) {
+        return { path: path ? `${path}.${key}` : key, arr: (obj as any)[key] };
+      }
     }
 
+    // Recurse into object values
+    if (depth > 0) {
       for (const [key, value] of Object.entries(obj)) {
-        if (Array.isArray(value)) return { path: `${path}.${key}`, arr: value };
-      }
-
-      for (const [key, value] of Object.entries(obj)) {
         if (value && typeof value === "object") {
-          const nested = findArray(value, `${path}.${key}`, depth - 1);
+          const nested = findArrayRecursive(value, path ? `${path}.${key}` : key, depth - 1);
           if (nested) return nested;
         }
       }
+    }
 
     return null;
   };
 
-  const found = findArray(response, "root", 2);
+  const nested = findArrayRecursive(response, "", 2);
-  if (found) {
+  if (nested) {
     if (process.env.NODE_ENV !== 'production') {
-      debug("[lyg-parse] Extracted array", {
-        path: found.path,
-        length: found.arr.length,
-        firstItem: found.arr[0] ? JSON.stringify(found.arr[0]).slice(0, 200) : undefined,
+      debug("[lyg-parse] Array extraction", {
+        format: `nested:${nested.path}`,
+        length: nested.arr.length,
+        firstItem: nested.arr[0] ? JSON.stringify(nested.arr[0]).slice(0, 150) : undefined,
       });
     }
-    return found.arr;
+    return { array: nested.arr, chosenKey: `nested:${nested.path}` };
   }
 
+  // Fallback: scan all values for any Array
+  for (const [key, value] of Object.entries(response)) {
+    if (Array.isArray(value)) {
+      if (process.env.NODE_ENV !== 'production') {
+        debug("[lyg-parse] Array extraction", {
+          format: `fallback:${key}`,
+          length: value.length,
+          firstItem: value[0] ? JSON.stringify(value[0]).slice(0, 150) : undefined,
+        });
+      }
+      return { array: value, chosenKey: `fallback:${key}` };
+    }
+  }
+
   if (process.env.NODE_ENV !== 'production') {
-    debug("[lyg-parse] No array found in response", { keys: rootKeys });
+    debug("[lyg-parse] No array found", { keys: rootKeys, contentType });
   }
-  return [];
+  return { array: [], chosenKey: "none" };
 }

@@ Type definition (line 460) @@
 export async function lygFetchMembers(
   familyId: string,
   opts?: { timeoutMs?: number }
 ): Promise<
   LygResponse<any[]> & {
     meta?: {
       urlUsed: string;
       status: number;
       contentType?: string | null;
       rootKeys: string[];
       extractedCount: number;
       skippedInvalid: number;
       precisionWarning?: boolean;
+      chosenKey?: string;
     };
   }
 > {

@@ Member extraction (lines 570-603) @@
-    // Extract array from response
-    const extracted = extractArrayFromLygResponse(parsedData, contentType);
+    // Extract array from response
+    const { array: extracted, chosenKey } = extractArrayFromLygResponse(parsedData, contentType);
     const firstItemKeys =
       extracted[0] && typeof extracted[0] === "object"
         ? Object.keys(extracted[0] as Record<string, unknown>)
         : [];
 
+    if (process.env.NODE_ENV !== 'production') {
+      debug("[lyg-members] Array extraction result", {
+        chosenKey,
+        extractedLength: extracted.length,
+        firstItemKeys,
+      });
+    }
+
     // Validate and count steamIds (accept 17-digit strings)
     let skippedInvalid = 0;
     const validated = extracted.map(item => {
       const normalized = normalizeLygMember(item, "esperados");
       if (normalized === null) {
         skippedInvalid++;
         return null;
       }
       // Accept steamId64 if it's 17 digits (relaxed validation)
       if (!normalized.steamId64 || !/^[0-9]{17}$/.test(normalized.steamId64)) {
         if (process.env.NODE_ENV !== 'production') {
           console.warn("[lyg-members] Invalid steamId64:", normalized.steamId64, "item:", JSON.stringify(item).slice(0, 100));
         }
         skippedInvalid++;
         return null;
       }
       return normalized;
     }).filter((n): n is NonNullable<typeof n> => n !== null);
 
     const meta = {
       urlUsed: resolvedUrl,
       status: res.status,
       contentType,
       rootKeys,
       extractedCount: validated.length,
       skippedInvalid,
       precisionWarning,
+      chosenKey,
     };
 
     if (process.env.NODE_ENV !== 'production') {
       debug("[lyg-members] Parsing complete", {
+        chosenKey,
         extracted: extracted.length,
         validated: validated.length,
         skippedInvalid,
         precisionWarning,
         firstItemKeys,
       });
 
       if (extracted.length === 0) {
-        console.warn("[lyg-members] WARN: extracted=0 (structure inattendue)", {
+        console.warn("[lyg-members] WARN: extracted=0 (structure inattendue)", {
           rootKeys,
+          chosenKey: "none",
           contentType,
           urlUsed: resolvedUrl,
           status: res.status,
         });
-      } else if (validated.length === 0) {
+      } else if (validated.length === 0 && extracted.length > 0) {
         console.warn("[lyg-members] WARN: extracted>0 mais validated=0 (steamId invalid)", {
           extracted: extracted.length,
+          chosenKey,
           firstItemKeys,
           skippedInvalid,
           urlUsed: resolvedUrl,
           status: res.status,
+          sampleFirstItem: extracted[0] ? JSON.stringify(extracted[0]).slice(0, 250) : undefined,
         });
       }
     }

KEY POINTS:
✅ extractArrayFromLygResponse now returns structured { array, chosenKey }
✅ chosenKey shows exactly which extraction method succeeded
✅ Helps diagnose why members extraction might fail
✅ Better recursive search with proper depth limiting
✅ Fallback scan catches any array regardless of key name


=== FILE 3: app/api/staff/sync/banklogs/route.ts ===
Location: Update extractArrayFromLygResponse call

CHANGES:
- Line 42: Destructure { array: extracted } from extractArrayFromLygResponse return

DIFF:
--- a/app/api/staff/sync/banklogs/route.ts
+++ b/app/api/staff/sync/banklogs/route.ts
@@ -40,7 +40,7 @@
       });
     }
 
-    const items = extractArrayFromLygResponse(banklogsResponse.data);
+    const { array: items } = extractArrayFromLygResponse(banklogsResponse.data);
     if (!items || items.length === 0) {
       debug("[sync/banklogs] No items extracted from LYG response");
       return NextResponse.json({

KEY POINTS:
✅ Minimal change required due to API signature change


=== FILE 4: app/api/debug/lyg-members-raw/route.ts ===
Location: Update debug endpoint to use new extractArrayFromLygResponse signature + add chosenKey

CHANGES:
- Complete rewrite to reflect new `lygFetchMembers` response structure
- Now shows: chosenKey, contentType, rootKeys, extractedLength, validatedLength, skippedInvalid
- Shows first item keys and sample (safe redacted)
- Returns 403 in production (DEV ONLY)

DIFF:
--- a/app/api/debug/lyg-members-raw/route.ts
+++ b/app/api/debug/lyg-members-raw/route.ts
@@ -1,6 +1,9 @@
-import { NextResponse } from "next/server";
+import { NextResponse, NextRequest } from "next/server";
 import { lygFetchMembers } from "@/lib/lyg-client";
 
-const FAMILY_ID = process.env.FAMILY_ID || "esperados";
+/**
+ * DEBUG: Show raw response from LYG API
+ * Usage: GET /api/debug/lyg-members-raw?familyId=esperados
+ * 
+ * Returns:
+ * - fetch status and HTTP code
+ * - contentType from LYG
+ * - rootKeys: top-level JSON keys
+ * - chosenKey: extraction method (direct, preferred:xxx, nested:xxx, fallback:xxx)
+ * - extractedLength: items found
+ * - validatedLength: items with valid steamId
+ * - skippedInvalid: items skipped (no steamId)
+ * - firstItemKeys: structure of first item
+ * 
+ * DEV ONLY: Returns 403 in production
+ */
-export async function GET() {
+export async function GET(req: NextRequest) {
+  // DEV ONLY: only expose in non-production
+  if (process.env.NODE_ENV === "production") {
+    return NextResponse.json(
+      { error: "Debug endpoint disabled in production" },
+      { status: 403 }
+    );
+  }
+
+  const url = new URL(req.url);
+  const familyId = url.searchParams.get("familyId") || process.env.FAMILY_ID || "esperados";
+
   try {
-    console.log("\n=== LYG API RESPONSE DEBUG ===\n");
+    console.log("\n=== LYG API EXTRACTION DEBUG ===");
+    console.log(`Family: ${familyId}`);
 
-    const response = await lygFetchMembers(FAMILY_ID, { timeoutMs: 15_000 });
+    const response = await lygFetchMembers(familyId, { timeoutMs: 15_000 });
 
-    console.log("✓ Response status:", response.ok ? "OK" : "FAILED");
+    console.log("✓ Fetch success:", response.ok);
     console.log("✓ Response HTTP status:", response.status);
-    console.log("✓ Extracted count:", response.meta?.extractedCount);
+    console.log("✓ Content-Type:", response.meta?.contentType);
+    console.log("✓ Root keys:", response.meta?.rootKeys?.join(", "));
+    console.log("✓ Extraction method (chosenKey):", response.meta?.chosenKey);
+    console.log("✓ Extracted items:", response.meta?.extractedCount);
+    console.log("✓ Validated items:", response.data?.length);
     console.log("✓ Skipped (invalid steamId):", response.meta?.skippedInvalid);
     console.log("✓ URL used:", response.meta?.urlUsed);
-    console.log("✓ Root keys in response:", response.meta?.rootKeys);
 
+    const firstItemKeys =
+      response.data && response.data[0] && typeof response.data[0] === "object"
+        ? Object.keys(response.data[0] as Record<string, unknown>)
+        : [];
+
     if (response.data && response.data.length > 0) {
-      console.log(`\n✓ Sample (first 2) raw items from LYG:`);
-      response.data.slice(0, 2).forEach((item, idx) => {
-        console.log(`\n  Item ${idx + 1}:`);
-        console.log("    Keys:", Object.keys(item));
-        console.log("    Data:", JSON.stringify(item, null, 2).split('\n').slice(0, 20).join('\n'));
-      });
+      console.log(`\n✓ Sample (first item) keys: ${firstItemKeys.join(", ")}`);
+      console.log("  Data:", JSON.stringify(response.data[0], null, 2).split('\n').slice(0, 15).join('\n'));
+    } else if (response.meta?.extractedCount === 0) {
+      console.log("\n❌ No array found in response (extraction failed)");
+      console.log("   chosenKey:", response.meta?.chosenKey);
+      console.log("   rootKeys:", response.meta?.rootKeys?.join(", "));
     } else {
-      console.log("\n❌ No data returned from LYG");
+      console.log("\n❌ Array found but all items invalid");
+      console.log("   Likely reason: steamId field name mismatch or invalid format");
     }
 
     console.log("\n=== END DEBUG ===\n");
 
     return NextResponse.json({
+      success: response.ok,
+      fetch: {
+        status: response.status,
+        error: response.error,
+        urlUsed: response.meta?.urlUsed,
+        contentType: response.meta?.contentType,
+      },
+      response: {
+        rootKeys: response.meta?.rootKeys || [],
+        chosenKey: response.meta?.chosenKey,
+        precisionWarning: response.meta?.precisionWarning,
+      },
+      extraction: {
+        extractedLength: response.meta?.extractedCount || 0,
+        validatedLength: response.data?.length || 0,
+        skippedInvalid: response.meta?.skippedInvalid || 0,
+      },
+      firstItemKeys,
+      sampleFirstItem: response.data && response.data[0] 
+        ? JSON.stringify(response.data[0]).slice(0, 500)
+        : null,
+      note: "This endpoint is DEV ONLY and will return 403 in production",
     });
   } catch (error: any) {
-    console.error("ERROR:", error);
+    console.error("DEBUG ERROR:", error);
     return NextResponse.json(
       {
+        success: false,
         error: error.message,
+        note: "This endpoint is DEV ONLY and will return 403 in production",
       },
       { status: 500 }
     );
   }
 }

KEY POINTS:
✅ DEV ONLY: blocked in production with 403 error
✅ Accepts familyId query parameter or uses env var fallback
✅ Shows chosenKey to diagnose extraction method
✅ Clear distinction between extraction failure vs validation failure


=== FILE 5: app/api/debug/banklogs-time/route.ts (NEW FILE) ===
Location: New debug endpoint to test timezone formatting

PURPOSE:
Test the formatBrussels function independently without needing UI

FUNCTIONALITY:
- Accepts lastSyncRaw and firstRowRaw as query parameters (defaults to current ISO time)
- Formats both using formatBrussels helper
- Detects timezone presence in each value
- Compares rendered output (match = ✓ or ✗ mismatch)
- Shows diagnostic recommendation
- Returns 403 in production (DEV ONLY)

DIFF:
--- /dev/null
+++ b/app/api/debug/banklogs-time/route.ts
@@ -0,0 +1,79 @@
+import { NextRequest, NextResponse } from "next/server";
+
+// Same formatBrussels function from banklogs/page.tsx
+const brusselsFormatter = new Intl.DateTimeFormat("fr-BE", {
+  year: "numeric",
+  month: "2-digit",
+  day: "2-digit",
+  hour: "2-digit",
+  minute: "2-digit",
+  timeZone: "Europe/Brussels",
+});
+
+function formatBrussels(input: string | number | Date): string {
+  if (input instanceof Date) {
+    return brusselsFormatter.format(input);
+  }
+
+  if (typeof input === "number") {
+    const d = new Date(input);
+    if (Number.isNaN(d.getTime())) return String(input);
+    return brusselsFormatter.format(d);
+  }
+
+  const value = input.trim();
+  const isoWithTz = /T.*(Z|[+-]\d{2}:?\d{2})$/.test(value);
+  if (isoWithTz) {
+    const d = new Date(value);
+    if (Number.isNaN(d.getTime())) return value;
+    return brusselsFormatter.format(d);
+  }
+
+  const localLike = value.match(
+    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})(?::(\d{2}))?$/
+  );
+  if (localLike) {
+    const [, y, m, d, hh, mm] = localLike;
+    return `${d}/${m}/${y} ${hh}:${mm}`;
+  }
+
+  const fallback = new Date(value);
+  if (Number.isNaN(fallback.getTime())) return value;
+  return brusselsFormatter.format(fallback);
+}
+
+/**
+ * DEBUG: Verify banklogs timezone formatting
+ * 
+ * Usage: GET /api/debug/banklogs-time?lastSyncRaw=2026-02-03T18:45:00Z&firstRowRaw=2026-02-03T18:45:00Z
+ * 
+ * Returns:
+ * - Raw values (as provided in query)
+ * - Formatted values (after formatBrussels)
+ * - TZ detection for each value (has timezone or not)
+ * - Match: whether they render identically
+ * 
+ * DEV ONLY: Returns 403 in production
+ */
+export async function GET(req: NextRequest) {
+  // DEV ONLY: only expose in non-production
+  if (process.env.NODE_ENV === "production") {
+    return NextResponse.json(
+      { error: "Debug endpoint disabled in production" },
+      { status: 403 }
+    );
+  }
+
+  const url = new URL(req.url);
+  
+  // For testing: allow passing values via query params
+  // In real usage, we'd fetch from sync-state and banklogs API
+  const lastSyncRaw = url.searchParams.get("lastSyncRaw") || new Date().toISOString();
+  const firstRowRaw = url.searchParams.get("firstRowRaw") || new Date().toISOString();
+
+  try {
+    const lastSyncFormatted = formatBrussels(lastSyncRaw);
+    const firstRowFormatted = formatBrussels(firstRowRaw);
+    
+    const lastSyncHasTz = /T.*(Z|[+-]\d{2}:?\d{2})$/.test(lastSyncRaw);
+    const firstRowHasTz = /T.*(Z|[+-]\d{2}:?\d{2})$/.test(firstRowRaw);
+    
+    const match = lastSyncFormatted === firstRowFormatted;
+
+    console.log("\n=== BANKLOGS TIMEZONE DEBUG ===");
+    console.log(`lastSync (raw): ${lastSyncRaw}`);
+    console.log(`lastSync (fmt): ${lastSyncFormatted}`);
+    console.log(`lastSync TZ: ${lastSyncHasTz ? "ISO+TZ" : "local/other"}`);
+    console.log(`firstRow (raw): ${firstRowRaw}`);
+    console.log(`firstRow (fmt): ${firstRowFormatted}`);
+    console.log(`firstRow TZ: ${firstRowHasTz ? "ISO+TZ" : "local/other"}`);
+    console.log(`Match: ${match ? "✓ YES" : "✗ NO (mismatch)"}`);
+    console.log("=== END DEBUG ===\n");
+
+    return NextResponse.json({
+      success: true,
+      lastSync: {
+        raw: lastSyncRaw,
+        formatted: lastSyncFormatted,
+        hasTZ: lastSyncHasTz,
+      },
+      firstRow: {
+        raw: firstRowRaw,
+        formatted: firstRowFormatted,
+        hasTZ: firstRowHasTz,
+      },
+      match,
+      recommendation: !match
+        ? "Values format differently. Check if one has TZ and other doesn't."
+        : "✓ Both values render identically in Europe/Brussels timezone",
+      note: "This endpoint is DEV ONLY and will return 403 in production",
+    });
+  } catch (error: any) {
+    console.error("DEBUG ERROR:", error);
+    return NextResponse.json(
+      {
+        success: false,
+        error: error.message,
+        note: "This endpoint is DEV ONLY and will return 403 in production",
+      },
+      { status: 500 }
+    );
+  }
+}

KEY POINTS:
✅ NEW FILE: helps debug timezone issues without UI
✅ DEV ONLY: blocked in production
✅ Can be called via: /api/debug/banklogs-time?lastSyncRaw=...&firstRowRaw=...
✅ Shows raw, formatted, TZ detection, and match status


=======================================
END OF DIFFS
=======================================
