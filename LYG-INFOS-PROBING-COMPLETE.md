# LYG Infos Endpoint Probing — Implementation Complete

## Overview

Implemented safe endpoint probing for LYG infos API to discover the correct endpoint without depending on incomplete documentation.

## Files Changed

### 1. `src/lib/lyg-probe-infos.ts` (NEW)

**Purpose**: Probe multiple possible infos endpoints and return the first working one.

**Endpoints probed (in order)**:
1. `/familles/{family}/infos`
2. `/familles/{family}/info`
3. `/familles/{family}/familyinfos`
4. `/familles/infos?family={family}`
5. `/infos?family={family}`

**Features**:
- All family names properly encoded with `encodeURIComponent()`
- Stops at first successful endpoint (200 + non-empty JSON)
- Returns detailed probe results for diagnostics
- Logs safe diagnostics (path + status, no tokens)
- Each endpoint attempt includes timeout handling

**Response format**:
```typescript
{
  data?: any;                    // Actual infos data if found
  ok: boolean;                   // Success flag
  status: number;                // HTTP status
  error?: string;                // Error message if failed
  probedPath?: string;           // Which endpoint worked
  probeResults: ProbeResult[];   // Details of all probes attempted
}
```

### 2. `app/api/lyg/infos/route.ts` (UPDATED)

**Changes**:
- Replaced single-endpoint fetch with `lygProbeInfos()` call
- Returns `probeResults` array showing what was tried
- Returns `probedPath` showing which endpoint succeeded
- Safe error handling with no token leakage

**Response on success**:
```json
{
  "data": {...infos...},
  "ok": true,
  "probedPath": "/familles/Los%20Esperados/infos",
  "probeResults": [
    {"path": "/familles/Los%20Esperados/infos", "status": 200, "ok": true, ...},
    ...
  ]
}
```

**Response on failure**:
```json
{
  "ok": false,
  "error": "No working infos endpoint found",
  "probeResults": [
    {"path": "/familles/Los%20Esperados/infos", "status": 404, "ok": false, ...},
    ...
  ]
}
```

### 3. `app/api/staff/sync/all/route.ts` (UPDATED)

**Changes**:
- Imported `lygProbeInfos` helper
- Updated infos sync to use probe instead of single endpoint
- Enhanced warning message to include probe count
- Logs all probe attempts for debugging
- Marked infos as OPTIONAL (non-critical)

**Warning message when infos unavailable**:
```
⚠️ Infos unavailable from LYG (404). Probed 5 endpoints. Members synced successfully.
```

**Log includes**:
```typescript
{
  endpointsProbed: [
    { path: "/familles/Los%20Esperados/infos", status: 404 },
    { path: "/familles/Los%20Esperados/info", status: 404 },
    ...
  ]
}
```

## How It Works

### Step 1: Probe Phase
When sync/all is triggered, instead of making a single request:
- Tries endpoint 1: `/familles/Los%20Esperados/infos` → 404
- Tries endpoint 2: `/familles/Los%20Esperados/info` → 404
- Tries endpoint 3: `/familles/Los%20Esperados/familyinfos` → 200 ✓ (STOP)
- Returns data from endpoint 3

### Step 2: Success Case
If any endpoint returns 200 + non-empty JSON:
- Sets `result.infos.ok = true`
- Continues to banklogs sync
- Logs which path worked

### Step 3: Failure Case
If all endpoints fail:
- Adds warning to `result.warnings`
- Does NOT fail entire sync
- Continues to banklogs sync
- Includes probe results in logs

## Testing

**Success scenario**:
1. Click "Sync maintenant" on `/staff/banklogs`
2. If LYG has an infos endpoint, one probe attempt succeeds
3. Sync completes: `result.ok = true`, no warnings
4. Logs show: `probedPath: "/familles/Los%20Esperados/info"`

**Failure scenario**:
1. If LYG doesn't expose infos anywhere
2. All 5 probes fail
3. Sync still succeeds (members + banklogs OK)
4. Warning banner shows: "Infos unavailable. Probed 5 endpoints."
5. Logs show all 5 probe attempts with their statuses
6. You can see exactly which path to try next

## Diagnostic Access

### Via Server Logs
```
[sync/all] Probing for infos endpoint...
[sync/all] Continuing sync despite infos failure...
  endpointsProbed: [
    { path: "/familles/Los%20Esperados/infos", status: 404 },
    { path: "/familles/Los%20Esperados/info", status: 404 },
    { path: "/familles/Los%20Esperados/familyinfos", status: 404 },
    { path: "/familles/infos?family=Los%20Esperados", status: 404 },
    { path: "/infos?family=Los%20Esperados", status: 404 }
  ]
```

### Via API Response
Call `/api/lyg/infos` directly to see probe results:
```bash
curl -H "Authorization: Bearer TOKEN" https://yourpanel.com/api/lyg/infos
```

Returns probe results showing which endpoint succeeded or which ones failed.

## No Regressions

✅ Members sync continues working (unchanged)
✅ Banklogs sync continues working (unchanged)
✅ URL encoding working correctly (`Los%20Esperados`)
✅ Build passes
✅ No changes to database schema
✅ Graceful degradation: sync succeeds even if infos unavailable

## Architecture Benefit

This approach allows:
1. **API Discovery**: Find the real endpoint without waiting for documentation
2. **Resilience**: Handle multiple endpoint variations
3. **Visibility**: Log exactly what was tried for troubleshooting
4. **Safety**: No silent failures - clear warnings when endpoints unavailable
5. **Extensibility**: Easy to add more endpoints to probe list

## Next Steps If Still 404

If all 5 endpoints return 404:
1. Check server logs for probe results
2. Manually test LYG endpoints with cURL
3. Add newly discovered endpoint to probe list
4. Redeploy

Example:
```bash
# Test with cURL
curl -H "Authorization: Bearer LYG_TOKEN" \
  https://api.lyg.fr/api/familles/Los%20Esperados/familyinfo

# If this succeeds, add to probeEndpoints list and redeploy
```
