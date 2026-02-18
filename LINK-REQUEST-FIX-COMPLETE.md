# Link Request Flow Fix — Comprehensive Analysis & Patch

## Problem Summary

Users accepted link requests (liaison acceptée) but remained on "Compte non lié" page instead of seeing linked dashboard.

## Root Causes Identified

### 1. **Cache Issue on /api/me**
- **Problem**: Next.js was caching the `/api/me` response, so after link acceptance, the old "not linked" state persisted
- **Impact**: User refreshes page but still sees "non-lié" even though DB was updated
- **Fix**: Added `export const dynamic = "force-dynamic"` + `Cache-Control: no-store, must-revalidate` headers

### 2. **Missing Diagnostic Logging**
- **Problem**: No clear logs showing whether Member.discordId was actually written to DB after link acceptance
- **Impact**: Hard to debug if link wrote to DB but /api/me didn't reflect it
- **Fix**: Added comprehensive diagnostic logs at each stage:
  - `/api/me`: logs userId, discordId, linked status, memberId
  - `/api/ingest/link-requests/[id]/accept`: logs before/after member state + linkVerification

### 3. **INGEST_SECRET Configuration Check**
- **Problem**: Worker might call ingest without token, but no warning if env var missing
- **Impact**: Worker thinks it succeeded (Discord card shows "succès") but request fails 401
- **Fix**: Added configuration check warning if INGEST_SECRET not set

### 4. **Discord ID Source Consistency** ✅ (Already Fixed)
The codebase already correctly uses:
- `Account.providerAccountId` (provider="discord") as source of truth
- `getDiscordIdForSession()` to retrieve it consistently
- Never mixing `session.discordId`, `session.user.id`, or other IDs

## Architecture Review

### Current Flow (Correct)
```
1. User requests link → LinkRequest created with requesterDiscordId
2. Discord card shows request → Staff accepts
3. Discord worker → POST /api/ingest/link-requests/[id]/accept (x-ingest-secret header)
4. Ingest endpoint:
   - Validates secret ✅
   - Upserts Member with discordId ✅
   - Updates LinkRequest status to ACCEPTED ✅
5. User refreshes → /api/me:
   - getDiscordIdForSession() gets Account.providerAccountId ✅
   - getCurrentMember() finds Member by familyId_discordId ✅
   - Returns { linked: true, member: {...} } ✅
6. Dashboard/page renders linked content ✅
```

### Files Modified

#### 1. **app/api/me/route.ts** ✅
```typescript
export const dynamic = "force-dynamic";  // NEW: Force no cache

// Response includes Cache-Control headers
headers: {
  "Cache-Control": "no-store, must-revalidate",
}

// Diagnostic logging
console.log("[api/me] Result", {
  userId,
  discordId,
  linked,
  memberId,
  timestamp,
});
```

**Why**: Ensures UI always gets fresh linked state, not stale cache

---

#### 2. **app/api/ingest/link-requests/[id]/accept/route.ts** ✅
```typescript
// NEW: Check INGEST_SECRET is configured
const hasIngestSecret = !!INGEST_SECRET && INGEST_SECRET.length > 0;
if (!hasIngestSecret) {
  console.warn("[link-request:accept] WARNING: INGEST_SECRET not configured");
}

// NEW: Comprehensive verification log after upsert
console.log("[link-request:accept] Link complete - diagnostics", {
  linkRequestId: id,
  requesterDiscordId,
  memberIdCreatedOrUpdated: member.id,
  memberDiscordIdInDb: member.discordId,  // ← What was actually written
  memberSteamIdInDb: member.steamId,
  linkVerified: member.discordId === linkRequest.requesterDiscordId,  // ← Verify match
  timestamp,
});
```

**Why**: 
- Detects if INGEST_SECRET missing before processing
- Confirms Member.discordId was actually written to DB
- Verifies the written ID matches the requester

---

## Testing Checklist

### Scenario 1: Fresh Link (No Pre-existing Member)
```
1. Discord user "Fernando" (id: 123456789012345) not in DB
2. He clicks "Demander la liaison" → LinkRequest created
3. Staff accepts → ingest called
4. Expected logs:
   [link-request:accept] Created new member {
     memberId: "xyz",
     discordId: "123456789012345",
     ...
   }
   [link-request:accept] Link complete - diagnostics {
     linkVerified: true,
     ...
   }
5. Fernando refreshes:
   [api/me] Result {
     discordId: "123456789012345",
     linked: true,
     memberId: "xyz",
     ...
   }
6. UI shows linked dashboard ✓
```

### Scenario 2: Existing Member Gets Linked
```
1. Member in DB with steamId but NO discordId
2. Link request made for that member
3. Staff accepts → ingest updates
4. Expected logs:
   [link-request:accept] Updated existing member {
     memberId: "existing-id",
     discordId: "123456789012345",
     updatedFields: ["discordId", "isActive"],
     ...
   }
5. /api/me finds member by discordId → linked: true ✓
```

### Scenario 3: Refresh After Accept
```
1. Right after staff clicks "Accept"
2. Frontend calls /api/me
3. Response should NOT be cached (has Cache-Control: no-store)
4. Should return fresh { linked: true } ✓
```

### Scenario 4: INGEST_SECRET Missing
```
1. ENV missing INGEST_SECRET
2. Worker calls ingest
3. Gets 401 Unauthorized (correct)
4. Server logs warning: "INGEST_SECRET not configured"
5. Worker should NOT show "succès" if 401 returned
```

## Diagnostic Commands

### Check if user is linked
```bash
curl -H "Cookie: [session]" https://yourpanel.com/api/me | jq .linked
```

### Check server logs for link diagnostics
```bash
# After accept, should see:
grep "Link complete - diagnostics" logs.txt

# Should show:
# linkVerified: true
# memberDiscordIdInDb: "123456789012345"
```

### Verify Member in DB
```bash
# In DB console:
SELECT id, discordId, steamId, rpName FROM "Member" 
WHERE discordId = '123456789012345';
```

## Performance Impact

- ✅ No performance regression (just added logs)
- ✅ No extra DB queries (already used in original flow)
- ✅ Cache-Control headers are standard HTTP (not custom)

## Migration Notes

- ✅ No schema changes required
- ✅ No data migrations needed
- ✅ Backward compatible (existing links unaffected)
- ✅ Can be deployed without coordination

## Next Steps if Still Broken

1. **Check INGEST_SECRET is in worker `.env.prod`**
   ```bash
   cat discord-worker/.env.prod | grep INGEST_SECRET
   ```

2. **Verify Member.discordId constraint**
   ```sql
   -- Should have unique constraint on (familyId, discordId)
   SELECT constraint_name, column_name FROM information_schema.key_column_usage
   WHERE table_name = 'Member' AND constraint_type = 'UNIQUE';
   ```

3. **Test ingest endpoint directly**
   ```bash
   curl -X POST https://yourpanel.com/api/ingest/link-requests/REQ-123/accept \
     -H "x-ingest-secret: $INGEST_SECRET" \
     -H "Content-Type: application/json" \
     -d '{"clickerId":"staff123","steamId":"76561198xxx"}'
   ```

4. **Monitor logs for diagnostics**
   - Watch for `linkVerified: true` after accept
   - Watch for cache logs on /api/me refresh
   - Check worker logs show correct endpoint + 200 status

## Success Criteria Met ✅

- [x] Caching disabled for /api/me
- [x] Diagnostic logs added at all critical points
- [x] INGEST_SECRET configuration checked
- [x] Build passes
- [x] No secrets in logs
- [x] Backward compatible
- [x] Clear debugging path for operators
