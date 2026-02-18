=======================================
VALIDATION CHECKLIST (3 QUICK TESTS)
=======================================

All tests should be performed AFTER npm run build succeeds and server starts.
Build Status: ✅ PASSED (6.0s, all 156 routes compiled)
Target Environment: Development or with NODE_ENV !== "production"


TEST 1: Verify LYG Members Extraction Method
─────────────────────────────────────────────

ACTION:
  1. Open browser: http://localhost:3000/api/debug/lyg-members-raw?familyId=esperados
  
  OR (from terminal):
  curl "http://localhost:3000/api/debug/lyg-members-raw?familyId=esperados"

EXPECTED OUTPUT:
  JSON response with:
  {
    "success": true/false,
    "fetch": {
      "status": 200 (or appropriate HTTP code),
      "contentType": "application/json" (or detected type),
      "urlUsed": "https://..."
    },
    "response": {
      "rootKeys": ["members", "data", "result", ...],
      "chosenKey": "direct" | "preferred:members" | "nested:path.to.array" | "fallback:xxx" | "none",
      "precisionWarning": true/false
    },
    "extraction": {
      "extractedLength": N (number of items found),
      "validatedLength": M (items with valid steamId),
      "skippedInvalid": K (items skipped)
    },
    "firstItemKeys": ["steamId", "family", "name", ...],
    "sampleFirstItem": "{...}" (first item JSON)
  }

VALIDATION RULES:
  ✓ If LYG HTTP 200:
    - extractedLength should be > 0 (array found in response)
    - chosenKey should NOT be "none" or "invalid"
    - chosenKey shows WHERE array was found:
      • "direct" = response is direct array
      • "preferred:members" = found at response.members
      • "preferred:data" = found at response.data
      • "nested:payload.data" = found nested deep
      • "fallback:xxx" = found as last resort
    
  ✓ If extractedLength > 0 but validatedLength == 0:
    - Indicates steamId field name mismatch or invalid format
    - Check firstItemKeys: do you see steamId? steamID? steam_id?
    - Check sampleFirstItem: show to LYG to confirm structure

  ✓ If extractedLength == 0:
    - Indicates response structure unexpected
    - Check rootKeys: is array really nested under "members"/"data"/"result"?
    - If not, extraction logic needs updating

PASS CRITERION:
  ❌ FAIL if: extractedLength == 0 AND LYG HTTP 200 (array not found)
  ❌ FAIL if: extractedLength > 0 BUT validatedLength == 0 (steamId mismatch)
  ✅ PASS if: extractedLength > 0 AND validatedLength > 0 (members loaded)


TEST 2: Verify Banklogs Timezone Fix
────────────────────────────────────

ACTION:
  1. Open browser: http://localhost:3000/api/debug/banklogs-time

  OR test with specific values:
     http://localhost:3000/api/debug/banklogs-time?lastSyncRaw=2026-02-03T18:45:00Z&firstRowRaw=2026-02-03T18:45:00Z

  OR (from terminal):
  curl "http://localhost:3000/api/debug/banklogs-time?lastSyncRaw=2026-02-03T18:45:00Z&firstRowRaw=2026-02-03T18:45:00Z"

EXPECTED OUTPUT:
  JSON response with:
  {
    "success": true,
    "lastSync": {
      "raw": "2026-02-03T18:45:00Z",
      "formatted": "03/02/2026 19:45",  (Europe/Brussels timezone)
      "hasTZ": true
    },
    "firstRow": {
      "raw": "2026-02-03T18:45:00Z",
      "formatted": "03/02/2026 19:45",
      "hasTZ": true
    },
    "match": true,
    "recommendation": "✓ Both values render identically in Europe/Brussels timezone"
  }

TEST CASES:
  
  Test Case A: ISO with timezone (standard case)
    lastSyncRaw: 2026-02-03T18:45:00Z
    firstRowRaw: 2026-02-03T18:45:00Z
    Expected: match = true ✓
  
  Test Case B: Local string WITHOUT timezone (edge case - tests fix)
    lastSyncRaw: 2026-02-03 18:45:00
    firstRowRaw: 2026-02-03 18:45:00
    Expected: match = true ✓ (formatted as-is, no UTC conversion)
  
  Test Case C: Mixed formats (potential issue)
    lastSyncRaw: 2026-02-03T18:45:00Z
    firstRowRaw: 2026-02-03 18:45:00
    Expected: match = false ✗ (one has TZ, one doesn't)
    Recommendation: "Values format differently. Check if one has TZ and other doesn't."

PASS CRITERION:
  ✅ PASS if: match == true when using same raw timestamps
  ✅ PASS if: match == false when mixing ISO+TZ with local-no-TZ (expected)
  ❌ FAIL if: match == false when both values are identical ISO+TZ


TEST 3: View Debug Block in Banklogs UI
──────────────────────────────────────

ACTION:
  1. Open browser: http://localhost:3000/staff/banklogs?debug=1
  
  2. Wait for page to load (may need to "Sync maintenant" to populate data)
  
  3. Look for YELLOW/AMBER debug box at top (with 🔍 icon)

EXPECTED APPEARANCE:
  ╔════════════════════════════════════════════════════════╗
  ║ 🔍 DEBUG: Timezone Verification                         ║
  ├────────────────────────────────────────────────────────┤
  ║ lastSync (raw):  2026-02-03T18:45:00Z                  ║
  ║ lastSync (fmt):  03/02/2026 19:45                      ║
  ║ lastSync TZ:     ISO+TZ                                ║
  ║                                                        ║
  ║ firstRow.at (raw):  2026-02-03T18:45:00Z               ║
  ║ firstRow.at (fmt):  03/02/2026 19:45                   ║
  ║ firstRow.at TZ:     ISO+TZ                             ║
  ║                                                        ║
  ║ ✓ Match: YES (✓)                                        ║
  ╚════════════════════════════════════════════════════════╝

VISIBILITY CONDITIONS:
  Debug block shows if:
    • process.env.NODE_ENV !== "production" OR
    • ?debug=1 query parameter present
  
  AND if:
    • lastSync value exists (from sync-state)
    • data.items[0] exists (at least 1 row in table)

PASS CRITERION:
  ✅ PASS if: Block is visible with all fields populated
  ✅ PASS if: Match shows "YES (✓)" when both values have same TZ
  ✅ PASS if: lastSync (fmt) matches firstRow.at (fmt) when both ISO+TZ
  ❌ FAIL if: Block not visible (indicates env check broken)
  ❌ FAIL if: Match shows "NO (✗)" when both are ISO+TZ (indicates formatting issue)


=======================================
QUICK SUMMARY
=======================================

If ALL 3 TESTS PASS:
  ✅ LYG members extracted correctly (and new chosenKey diagnostic works)
  ✅ Banklogs timezone formatting fixed (rawLastSync == rawFirstRowDate)
  ✅ Debug infrastructure ready for production troubleshooting

If ANY TEST FAILS:
  1. Check console logs for DEV warnings:
     [lyg-members] WARN: extracted=0 (structure inattendue)
     [lyg-members] WARN: extracted>0 mais validated=0 (steamId invalid)
  
  2. Inspect debug endpoint response (chosenKey field)
  
  3. Adjust LYG_BASE_URL or steamId field names if needed

TESTING IN PRODUCTION:
  All /api/debug/* endpoints return 403 Forbidden in production.
  To enable testing in prod: temporary set NODE_ENV check to false or
  set debug query param at app level (requires code change).


=======================================
END CHECKLIST
=======================================
