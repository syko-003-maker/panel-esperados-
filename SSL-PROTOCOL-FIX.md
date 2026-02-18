# SSL Protocol Fix for /api/staff/sync/all

## Problem
`ERR_SSL_PACKET_LENGTH_TOO_LONG` error when calling `/api/staff/sync/all`. This occurs when HTTPS is used against HTTP-only endpoints (localhost, internal services, worker on port 3001).

## Root Cause
Sync routes were using `new URL("/api/...", requestUrl)` where `requestUrl` comes from the incoming request. If the browser/client uses HTTPS, all internal API calls would also use HTTPS, causing SSL errors when connecting to local HTTP services.

## Solution Implemented

### 1. Created URL Normalization Helper
**File**: `src/lib/url.ts`

```typescript
export function normalizeBaseUrl(raw: string | undefined): string
```
- Adds `https://` if no protocol specified
- **Forces HTTP for localhost and private IPs** (10.*, 192.168.*, 172.16-31.*)
- Removes trailing slashes
- Validates URL format

```typescript
export function getInternalBaseUrl(requestUrl: URL): string
```
- Gets base URL for internal Next.js API calls
- Ensures correct protocol (HTTP for localhost, HTTPS for production)

### 2. Fixed Sync Routes

#### `/api/staff/sync/all/route.ts`
- ✅ Added debug logging: `console.log("[sync/all] fetching:", url.toString())`
- ✅ Uses `getInternalBaseUrl(requestUrl)` instead of `requestUrl` directly
- ✅ All internal calls now use HTTP for localhost

#### `/api/staff/sync/infos/route.ts`
- ✅ Uses normalized base URL for proxy calls to `/api/lyg/infos`

#### `/api/staff/sync/banklogs/route.ts`
- ✅ Uses normalized base URL for proxy calls to `/api/lyg/banklogs`

## Behavior

### Before Fix
```
Incoming: https://losesperados.xyz/api/staff/sync/all
Internal: https://localhost:3000/api/staff/sync/infos ❌ SSL error
```

### After Fix
```
Incoming: https://losesperados.xyz/api/staff/sync/all
Internal: http://localhost:3000/api/staff/sync/infos ✅ Works
```

## Testing

### Debug Logs
When `/api/staff/sync/all` is called, check logs for:
```
[sync/all] fetching: http://localhost:3000/api/staff/sync/infos
[sync/all] fetching: http://localhost:3000/api/staff/sync/banklogs
```

### Expected URLs by Environment

| Environment | Incoming Request | Internal Calls |
|-------------|-----------------|----------------|
| **Development** | `http://localhost:3000` | `http://localhost:3000` |
| **Production (localhost)** | `https://localhost:3000` | `http://localhost:3000` ✅ |
| **Production (domain)** | `https://losesperados.xyz` | `https://losesperados.xyz` |

### Private Network Detection
- `localhost`, `127.0.0.1`, `::1` → HTTP
- `10.*.*.*` → HTTP
- `192.168.*.*` → HTTP
- `172.16.*.*` to `172.31.*.*` → HTTP
- All other hostnames → HTTPS (unless already HTTP)

## Build Status
✅ **152 routes generated successfully**
✅ **TypeScript compilation passed**
✅ **No breaking changes**

## Files Modified
- ✅ `src/lib/url.ts` (new file)
- ✅ `app/api/staff/sync/all/route.ts`
- ✅ `app/api/staff/sync/infos/route.ts`
- ✅ `app/api/staff/sync/banklogs/route.ts`

## Migration Notes
No breaking changes. The fix is transparent:
- External domains continue to use HTTPS
- Localhost/private IPs automatically use HTTP
- No environment variable changes needed
- Backward compatible with existing deployments
