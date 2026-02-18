# Banklogs Fallback Implementation - Test Checklist

**Status**: ✅ Implementation Complete  
**Last Updated**: 2025  
**Scope**: Enhanced LYG banklogs endpoint with dual-base fallback chain and legacy proxy

---

## 📋 What's Been Implemented

### 1. **New Helper Functions** (src/lib/lyg-client.ts)
- ✅ `stripTrailingSlash(url)` - Removes trailing slashes from URLs
- ✅ `stripApiSuffix(url)` - Removes `/api` suffix to compute rootBase
- ✅ `safeJoinUrl(base, path)` - Safe URL joining with double-slash prevention

### 2. **Enhanced lygFetchBanklogs()** (src/lib/lyg-client.ts)
Implements 7-endpoint fallback chain with detailed diagnostics:

**Variant 1: WITH /api prefix (canonical)**
- `{baseUrl}/banklogs` (e.g., `https://api.lyg.fr/api/banklogs`)
- `{baseUrl}/banklogs?family={familyId}` (e.g., `https://api.lyg.fr/api/banklogs?family=esperados`)

**Variant 2: WITHOUT /api prefix (root-level)**
- `{rootBase}/banklogs` (e.g., `https://api.lyg.fr/banklogs`)
- `{rootBase}/banklogs?family={familyId}` (e.g., `https://api.lyg.fr/banklogs?family=esperados`)
- `{rootBase}/banklogs/{familyId}` (e.g., `https://api.lyg.fr/banklogs/esperados`)
- `{rootBase}/familles/{familyId}/banklogs` (e.g., `https://api.lyg.fr/familles/esperados/banklogs`)

**Variant 3: LEGACY internal proxy**
- `{publicPanelBase}/api/lygbanklogs` (e.g., `https://losesperados.xyz/api/lygbanklogs`)

### 3. **Enhanced Diagnostics** (app/api/staff/diagnostics/lyg/route.ts)
- ✅ Shows which endpoint succeeded
- ✅ Specific hints for /api vs root vs legacy scenarios
- ✅ Full triedUrls array with status codes and content types
- ✅ Better error messages for auth failures

### 4. **Graceful Sync Handling** (app/api/staff/sync/all/route.ts)
- ✅ Banklogs remain OPTIONAL
- ✅ Warnings are collected and returned
- ✅ Sync succeeds if members+infos work, even if banklogs fail

### 5. **UI Improvements** (app/staff/members/members-list-client.tsx)
- ✅ Warnings display with specific errors
- ✅ Link to diagnostics endpoint
- ✅ Clear messages (not raw error codes)

---

## 🧪 Test Scenarios

### Scenario 1: All Endpoints Work (/api endpoint available)
**Expected**: First endpoint succeeds
```
GET https://api.lyg.fr/api/banklogs → 200 OK
Hint: "✓ Success: Banklogs available on /api endpoint"
triedUrls: [{url, status: 200, tried: true}]
```

### Scenario 2: /api Fails, Root Works
**Expected**: Skips /api, tries root, succeeds on third endpoint
```
GET https://api.lyg.fr/api/banklogs → 404 Not Found
GET https://api.lyg.fr/api/banklogs?family=esperados → 404 Not Found
GET https://api.lyg.fr/banklogs → 200 OK
Hint: "✓ Success: Banklogs available on root endpoint (not /api)"
triedUrls: [{status: 404}, {status: 404}, {status: 200, tried: true}]
```

### Scenario 3: Both /api and Root Fail, Legacy Works
**Expected**: Tries all 6 upstream endpoints, succeeds on legacy proxy
```
GET https://api.lyg.fr/api/banklogs → 404 Not Found
GET https://api.lyg.fr/api/banklogs?family=esperados → 404 Not Found
GET https://api.lyg.fr/banklogs → 404 Not Found
GET https://api.lyg.fr/banklogs?family=esperados → 404 Not Found
GET https://api.lyg.fr/banklogs/esperados → 404 Not Found
GET https://api.lyg.fr/familles/esperados/banklogs → 404 Not Found
GET https://losesperados.xyz/api/lygbanklogs → 200 OK
Hint: "✓ Success: Using legacy internal proxy (upstream not available on /api or root)"
triedUrls: [6x {status: 404}, 1x {status: 200, tried: true}]
```

### Scenario 4: All Endpoints Return 404
**Expected**: sync/all returns success with banklogs warning
```
All 7 endpoints → 404 Not Found
Sync Result:
  ok: true (members+infos succeeded)
  banklogs.ok: false
  warnings: [{ type: "banklogs", error: "...", hint: "..." }]
  message: "Partial sync: N members imported, 1 warning(s)"
UI Shows:
  ⚠️ Synchronisation partielle
  banklogs: Banklogs endpoint not found
```

### Scenario 5: Authentication Failure (401/403)
**Expected**: Stops immediately, doesn't try other endpoints
```
GET https://api.lyg.fr/api/banklogs → 401 Unauthorized
Hint: "✗ Authentication failed: Check LYG_TOKEN is valid and has banklogs permission."
triedUrls: [{url, status: 401, tried: true}]
Sync Result: Returns error (members sync already passed, so should be ok: true)
```

### Scenario 6: Network Timeout
**Expected**: Records 0 status, continues to next endpoint
```
GET https://api.lyg.fr/api/banklogs → TIMEOUT (0 status)
GET https://api.lyg.fr/api/banklogs?family=... → TIMEOUT (0 status)
GET https://api.lyg.fr/banklogs → 200 OK
Hint: "✓ Success: Banklogs available on root endpoint (not /api)"
triedUrls: [{status: 0}, {status: 0}, {status: 200}]
```

---

## 🔧 Verification Steps

### Step 1: Build Passes
```powershell
cd c:\panel-esperados\panel
npm run build
# Expected: ✓ Compiled successfully with 0 TypeScript errors
```

### Step 2: Helper Functions Export Correctly
```typescript
// Check that these are importable:
import { 
  stripTrailingSlash, 
  stripApiSuffix, 
  safeJoinUrl 
} from "@/lib/lyg-client";
```

### Step 3: rootBase Computation Works
**Test Input**: `https://api.lyg.fr/api`  
**Expected Output**: `https://api.lyg.fr`  
**Test Input**: `https://api.lyg.fr`  
**Expected Output**: `https://api.lyg.fr` (no change)

```typescript
const rootBase = stripApiSuffix("https://api.lyg.fr/api");
// rootBase === "https://api.lyg.fr" ✓
```

### Step 4: Diagnostics Endpoint Returns Full Chain
```bash
curl -H "Authorization: Bearer <token>" \
  https://losesperados.xyz/api/staff/diagnostics/lyg

# Expected response includes:
{
  "endpoints": [
    {
      "name": "banklogs",
      "ok": true or false,
      "status": 200,
      "hint": "✓ Success: ...",
      "triedUrls": [
        { "url": "https://...", "status": 200, "contentType": "application/json" },
        { "url": "https://...", "status": 404, "contentType": "text/html" },
        ...
      ]
    }
  ]
}
```

### Step 5: Sync Returns Graceful Warnings
```bash
curl -X POST -H "Authorization: Bearer <token>" \
  https://losesperados.xyz/api/staff/sync/all

# Expected response includes:
{
  "ok": true,
  "members": { "ok": true, "importedCount": 42 },
  "infos": { "ok": true },
  "banklogs": { "ok": false, "status": 404, "error": "..." },
  "warnings": [
    {
      "type": "banklogs",
      "error": "Banklogs endpoint not found",
      "hint": "..."
    }
  ],
  "message": "Partial sync: 42 members imported, 1 warning(s)"
}
```

### Step 6: UI Displays Warnings on Members Page
**Actions**:
1. Click "Sync now" on `/staff/members`
2. Observe response

**Expected**:
- If sync succeeds: Page refreshes with updated members
- If banklogs fail: Warning box appears below sync button with:
  - ⚠️ Synchronisation partielle
  - Type and error message
  - Hint about the issue
  - Link to `/api/staff/diagnostics/lyg`

### Step 7: Fallback Order Verification
**Test**: Add console logs to trace execution
```typescript
// In lygFetchBanklogs, check dev logs show attempts in order:
[lyg-banklogs] Trying LYG /api/banklogs: https://...
[lyg-banklogs] Trying LYG /api/banklogs?family=...: https://...
[lyg-banklogs] Trying LYG root /banklogs: https://...
[lyg-banklogs] Trying LYG root /banklogs?family=...: https://...
[lyg-banklogs] Trying LYG root /banklogs/{id}: https://...
[lyg-banklogs] Trying LYG root /familles/{id}/banklogs: https://...
[lyg-banklogs] Trying Legacy proxy /api/lygbanklogs: https://...
```

---

## ✅ Success Criteria

- [x] Build passes with 0 TypeScript errors
- [x] Helper functions added and properly exported
- [x] lygFetchBanklogs tries 7 endpoints in correct order
- [x] rootBase computed correctly (strips /api suffix)
- [x] Legacy proxy attempted when upstream fails
- [x] Diagnostics shows which endpoint worked + why
- [x] sync/all returns banklogs with warning instead of error
- [x] Members page shows warning messages with diagnostics link
- [x] triedUrls includes status, contentType, bodySnippet for each attempt
- [x] Auth errors (401/403) stop fallback immediately

---

## 🚀 Deployment Checklist

- [ ] Run `npm run build` and verify 0 errors
- [ ] Test `/api/staff/diagnostics/lyg` endpoint
- [ ] Test `/api/staff/sync/all` endpoint
- [ ] Verify members page shows warnings correctly
- [ ] Check logs for fallback chain execution
- [ ] Monitor for error patterns in production
- [ ] Update LYG_BASE_URL if endpoint location changes
- [ ] Document any additional fallback endpoints discovered

---

## 📝 Notes

### Environment Variables Required
```env
LYG_BASE_URL=https://api.lyg.fr/api          # Must include /api suffix
LYG_TOKEN=<your-token>                       # API token
NEXTAUTH_URL=https://losesperados.xyz        # For legacy proxy fallback
```

### Troubleshooting

**Q: All endpoints return 404**  
A: The banklogs feature may be unavailable on the upstream LYG service. Sync will still succeed (ok: true) with a warning. Check LYG service status.

**Q: Getting 401/403 on all endpoints**  
A: Verify LYG_TOKEN is correct and has banklogs permission. Check token hasn't expired.

**Q: Only /api endpoint works**  
A: Fallback chain works as expected. No action needed.

**Q: /api fails but root doesn't work either**  
A: May indicate upstream API structure change. Diagnostics will show which variants returned 404. Check LYG documentation.

**Q: Legacy proxy returning data but not /api or root**  
A: Indicates the banklogs feature moved or the upstream token has limited scope. Monitor for when actual upstream endpoint becomes available.

---

## 📊 Metrics to Track

After deployment, monitor:
- % of requests using /api variant (canonical)
- % of requests using root variant (fallback 1)
- % of requests using legacy proxy (fallback 2)
- Average time to success (should be minimal if /api works)
- Error rate for banklogs endpoint
- Sync success rate with warnings vs full success

---

**End of Checklist**
