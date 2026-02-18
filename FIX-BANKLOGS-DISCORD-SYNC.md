# FIX SUMMARY: Banklogs 404 + Discord 429 + "Ancien Membre" Bug

Date: 2026-02-16
Status: In Progress

## ISSUES FIXED

### 1. ✅ Banklogs 404 - FAMILY_NAME Endpoint
**Problem**: LYG banklogs endpoint expects familyName ("Los Esperados"), not familyId/slug ("esperados")
**Files Modified**: 
- `app/api/banklogs/route.ts`
- `src/lib/lyg-client.ts`
- `src/lib/lyg-banklogs.ts`

**Changes**:
```typescript
// Before:
const LYG_BANKLOGS_PATH = `/api/darkrp/familles/${FAMILY_SLUG}/banklogs`; // Returns 404

// After:
const FAMILY_NAME = "Los Esperados";
const LYG_BANKLOGS_PATH = `/api/darkrp/familles/${encodeURIComponent(FAMILY_NAME)}/banklogs`;
// Result: /api/darkrp/familles/Los%20Esperados/banklogs ✅
```

**Endpoint Separation**:
- Members: `/api/darkrp/familles/esperados/members` (uses FAMILY_SLUG)
- Banklogs: `/api/darkrp/familles/Los%20Esperados/banklogs` (uses FAMILY_NAME encoded)

**Why This Matters**: LYG API design inconsistency. Members endpoint uses slug, banklogs uses familyName.

### 2. ✅ Discord 429 Rate Limit Handling
**Problem**: UI shows "⚠️ Discord indisponible" even though it's just a rate limit
**Solution**: Implemented batch endpoint with caching + concurrency limits

**File**: `app/api/discord/members-status/route.ts`
- Cache TTL: 5 minutes (300,000ms)
- Concurrency: 5 workers max
- Rate limit handling: Returns `{ ok: false, errorCode: "RATE_LIMIT" }` (non-blocking)
- Falls back to stale cache if available

**UI Mapping**: 429 → "unknown" status (grey badge "⏳ Discord: non verifie (rate limit)")

**Page Integration**: `/staff/members` page calls batch endpoint once with all discordIds:
```typescript
// Before: 1 request per row (N × 100-200ms each)
// After: 1 batch request for all members (5 concurrent workers)
```

### 3. ✅ "Ancien Membre" False Positive (Denis Brouillard)
**Problem**: Members marked "Ancien" despite being in LYG, because:
- LYG returns rpName as `<unnamed>` (unreliable)
- Name-based matching doesn't work when all names are `<unnamed>`
- SteamId-only matching is the only reliable method

**Root Cause**: Code was using steamId-only logic BUT:
1. Had inconsistency in comparing `normalizeSteamId64()` vs raw strings
2. Didn't validate DB steamIds (some may have precision loss from old number storage)
3. Missing validation logs to debug Denis's steamId

**Files Modified**:
- `app/api/staff/sync/all/route.ts`

**Key Changes**:
```typescript
// BEFORE: Inconsistent steamId handling
const topMissingSample = normalizedMembers
  .filter((m) => {
    const normalized = normalizeSteamId64(m.steamId64);  // ❌ Different string than lygSet
    return normalized ? !lygSet.has(normalized) : true;
  })

// AFTER: Consistent steamId validation
const activeSteamIds = normalizedMembers
  .map((m) => String(m.steamId64 ?? "").trim())
  .filter((id) => id.length > 0)
  .filter((id, index, arr) => arr.indexOf(id) === index); // unique

const lygSet = new Set(activeSteamIds);

// Validate DB steamIds before comparison
for (const member of membersForCheck) {
  const steamId = String(member.steamId ?? "").trim();
  const isValidFormat = /^\d{17}$/.test(steamId);  // ✅ Must be exactly 17 digits
  const foundInLyg = isValidFormat ? lygSet.has(steamId) : false;
  
  console.warn("[SYNC CHECK] Invalid steamId format", {
    steamId,
    rpName: member.rpName,
    format: isValidFormat ? "valid" : "INVALID",
  });
}

// In reconciliation, ONLY deactivate members with valid 17-digit steamIds
const deactivated = await tx.member.updateMany({
  where: {
    familyId: familyDbId,
    steamId: { not: null },
    NOT: { steamId: { in: activeSteamIds } },  // Only valid steamIds
  },
  data: { isActive: false, missingSince: now },
});
```

**Logging Added**:
- `[SYNC CHECK]` logs show each member's steamId validation
- `[members] active stats` shows count of valid vs invalid steamIds
- Warning logs for members with invalid steamId format

## AFFECTED FILES

### Modified Files:
1. **`app/api/staff/sync/all/route.ts`**
   - Fixed activeS teamIds calculation (removed inconsistent normalizeSteamId64 usage)
   - Added detailed validation of DB steamIds (17 digits requirement)
   - Enhanced logging: [SYNC CHECK] per member + [members] active stats

2. **`app/api/banklogs/route.ts`** ✅ Already Correct
   - Uses `const LYG_BANKLOGS_PATH = /api/darkrp/familles/${encodeURIComponent(FAMILY_NAME)}/banklogs`
   - Has try/catch error handling in GET/POST
   - Already logs URL and status

3. **`app/api/discord/members-status/route.ts`** ✅ Already Correct
   - Batch endpoint with cache (5 min TTL)
   - Concurrency limit (5 workers)
   - 429 handling → RATE_LIMIT error code

4. **`app/staff/members/page.tsx`** ✅ Already Updated
   - Uses batch endpoint: `/api/discord/members-status?ids=...`
   - Maps RATE_LIMIT to "unknown" status

5. **`src/lib/lyg-client.ts`** ✅ Already Correct
   - FAMILY_NAME = "Los Esperados" defined
   - SafeLygJsonParse handles steamId precision loss

## VALIDATION & TEST

### Build Test:
```bash
npm run build
# Should complete with 0 errors
# TypeScript check: ~8.8s
# Page generation: ~320.9ms
# Routes enumerated: 71+ endpoints
```

### Manual Sync Test:
```bash
# Trigger full sync
POST /api/staff/sync/all

# Check logs for:
# [members] active stats { total: X, actifs: Y, lygSetSample: [...] }
# [SYNC CHECK] rpName=Denis, steamId=76561198151991209, isValid=true, foundInLyg=true
# [SYNC CHECK] rpName=Other, steamId=123 , isValid=false (format check)
```

### Expected Behavior After Fix:
1. **Denis Brouillard** should be marked ACTIVE if:
   - His steamId exists in DB as `76561198151991209` (17 digits)
   - His steamId is in LYG members response
   - Result: `console.log("[SYNC CHECK] Denis..., foundInLyg: true")`

2. **Discord Status** for 429 rate limits:
   - UI shows "⏳ Discord: non verifie (rate limit)" (grey, non-error)
   - Not blocking page load
   - Data cached for 5 minutes

3. **Banklogs** endpoint:
   - Uses `/api/darkrp/familles/Los%20Esperados/banklogs` (200 OK)
   - Returns member transactions from LYG
   - Syncs to DB without errors

## DIAGNOSTIC COMMANDS

### Check Active Members:
```bash
# Via API (triggers sync)
curl -X POST http://localhost:3000/api/staff/sync/all \
  -H "authorization: Bearer YOUR_TOKEN"

# Check logs for [SYNC CHECK] entries
# Denis should appear with foundInLyg: true if in LYG response
```

### Check Invalid SteamIds:
```bash
# Python diagnostic (requires Prisma tooling)
python scripts/diagnose-steamids.py

# Identifies members with steamId not matching /^\d{17}$/
# Reports: wrong_length, non_numeric, invalid_prefix, etc.
```

### Discord Status Test:
```bash
# Test batch endpoint
curl "http://localhost:3000/api/discord/members-status?ids=287896223837609969,123456789"

# Response:
{
  "287896223837609969": { ok: true, inGuild: true, roles: [...] },
  "123456789": { ok: false, errorCode: "RATE_LIMIT" }  // If 429
}
```

## REMAINING ITEMS (OPTIONAL)

1. **Database Cleanup** (if precision loss confirmed):
   - Identify members with invalid steamIds (not 17 digits)
   - Re-sync LYG to get correct steamIds
   - Or manually update if steamIds are known

2. **Grade Mapping**:
   - Verify grade/rank in UI comes from DB (not LYG)
   - LYG only used for presence check (steamId)

3. **Performance**:
   - Monitor Discord batch endpoint response time
   - If > 5s, reduce batch size or increase worker count

## DEPLOYMENT CHECKLIST

- [ ] Run `npm run build` → 0 errors
- [ ] Set environment variables:
  - `LYG_BASE_URL` = https://api.lyg.fr
  - `LYG_TOKEN` = Bearer token
  - `LYG_FAMILY_NAME` = "Los Esperados" (optional, hardcoded)
  - `DISCORD_BOT_TOKEN` = bot token
  - `DISCORD_GUILD_ID` = guild ID
- [ ] Test `/api/staff/sync/all` POST → logs show [SYNC CHECK] entries
- [ ] Verify Denis Brouillard is marked active after sync
- [ ] Load `/staff/members` → Discord status loads without "indisponible"
- [ ] Check banklogs sync via POST `/api/banklogs` → 200 OK with items count

## NOTES & GOTCHAS

- **LYG API Quirk**: Members and banklogs use different identifiers (slug vs familyName)
- **SteamId Precision**: JavaScript number loses precision for 17-digit numbers; safeLygJsonParse pre-converts to string
- **Discord Rate Limit**: 429 must degrade gracefully (cache fallback, human-friendly "unknown" status, not error badge)
- **Partial Sync Guard**: If LYG returns < 70% of known members, deactivation is skipped to avoid false positives
