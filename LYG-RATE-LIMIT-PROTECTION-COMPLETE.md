# LYG Rate Limit Protection - Implementation Complete ✅

## 📋 Overview

Implemented global server-side cache + distributed locks to prevent hitting LYG API rate limit (150 req/15min).

**Problem Solved**: 
- Before: Each page load → N LYG API calls (one per member) → 100+ requests
- Multiple tabs/users → Concurrent duplicate requests → Rate limit exhaustion
- After: Global cache with configurable TTL → Max 2-60 API calls/hour

---

## 🏗️ Architecture

### Database Layer (Prisma)

**Models Added**:
```prisma
model CacheKV {
  key       String   @id    // "lyg:esperados:members"
  value     Json               // Cached response data
  updatedAt DateTime @updatedAt
  expiresAt DateTime          // Explicit TTL expiration
  @@index([expiresAt])
}

model Lock {
  key       String   @id    // "lock:lyg:esperados:members"
  holder    String            // UUID of lock holder
  expiresAt DateTime          // Auto-expiry
  createdAt DateTime @default(now())
  @@index([expiresAt])
}
```

**Migration**: `20260216015405_add_cache_kv_and_lock`
- ✅ Applied successfully
- ✅ Prisma Client regenerated

---

## 📦 Components Created

### 1. Cache Manager Library
**File**: `src/lib/cache.ts`

**Functions**:
- `getCache<T>(key)` - Retrieve cached value if not expired
- `setCache<T>(key, data, ttlMs)` - Store with TTL
- `deleteCache(key)` - Invalidate cache entry
- `acquireLock(key, ttlMs)` - Distributed lock acquisition
- `releaseLock(key, holder)` - Release lock
- `fetchWithCache<T>(cacheKey, fetcher, options)` - **Main pattern**
  - Check cache → return if valid
  - Check inflight (same instance) → join if exists
  - Acquire lock → wait if locked by another process
  - Fetch data → update cache → release lock
- `cleanupExpired()` - Remove stale cache/lock entries

**Features**:
- ✅ DB-backed (multi-instance safe)
- ✅ Distributed locking (prevents concurrent fetches)
- ✅ In-memory inflight tracking (optimization)
- ✅ Auto-cleanup of expired entries

---

### 2. LYG Members Endpoint (Cached)
**File**: `app/api/lyg/members/route.ts`

**Configuration**:
- Cache TTL: **30 minutes** → Max 2 LYG calls/hour
- Lock TTL: 30 seconds
- Wait for lock: 5 seconds

**Usage**:
```typescript
GET /api/lyg/members?familyId=esperados
GET /api/lyg/members?familyId=esperados&force=true  // Force refresh
```

**Response**:
```json
{
  "ok": true,
  "data": [...],
  "cached": true,
  "fetchedAt": "2026-02-16T02:30:00.000Z",
  "ttlMs": 1800000
}
```

---

### 3. LYG Banklogs Endpoint (Cached)
**File**: `app/api/lyg/banklogs/route.ts` *(Updated)*

**Configuration**:
- Cache TTL: **60 seconds** → Max 60 LYG calls/hour
- Lock TTL: 30 seconds
- Wait for lock: 5 seconds

**Usage**:
```typescript
GET /api/lyg/banklogs?familyId=esperados
GET /api/lyg/banklogs?familyId=esperados&force=true  // Force refresh
```

**Response**: Same format as members

---

### 4. React Hooks (Client-Side)
**File**: `src/lib/hooks/useLyg.ts`

#### `useMembers(options)`
```tsx
import { useMembers } from "@/lib/hooks/useLyg";

function MembersPage() {
  const { members, loading, error, cached, fetchedAt, refresh } = useMembers({
    familyId: "esperados",
    refreshInterval: 30 * 60 * 1000, // 30 min (default)
    enabled: true,
  });

  return (
    <div>
      <button onClick={refresh}>Force Refresh</button>
      {loading ? "Loading..." : `${members.length} members`}
      {cached && `(Cached, updated ${fetchedAt?.toLocaleString()})`}
    </div>
  );
}
```

#### `useBanklogs(options)`
```tsx
import { useBanklogs } from "@/lib/hooks/useLyg";

function BanklogsPage() {
  const { banklogs, loading, error, cached, fetchedAt, refresh } = useBanklogs({
    familyId: "esperados",
    refreshInterval: 60 * 1000, // 60s (default)
    enabled: true,
  });

  return (
    <div>
      <button onClick={refresh}>Force Refresh</button>
      {loading ? "Loading..." : "Loaded"}
      {cached && `(Cached, updated ${fetchedAt?.toLocaleString()})`}
    </div>
  );
}
```

**Features**:
- ✅ Auto-refresh with configurable interval
- ✅ Manual refresh trigger
- ✅ Loading/error states
- ✅ Cache awareness
- ✅ Tab deduplication (via server-side cache)

---

### 5. Cleanup Cron Job
**File**: `app/api/cron/cleanup-cache/route.ts`

**Purpose**: Remove expired cache and lock entries periodically

**Configuration**:
- Recommended schedule: Every 5-10 minutes
- Optional auth: `CRON_SECRET` env var

**Usage**:
```bash
# Manual trigger
curl https://your-panel.com/api/cron/cleanup-cache

# With auth
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-panel.com/api/cron/cleanup-cache

# Vercel cron (add to vercel.json)
{
  "crons": [{
    "path": "/api/cron/cleanup-cache",
    "schedule": "*/10 * * * *"
  }]
}
```

**Response**:
```json
{
  "ok": true,
  "cacheDeleted": 3,
  "locksDeleted": 1,
  "durationMs": 45
}
```

---

## 🚀 Rate Limit Protection Strategy

### Before (Problems)
| Scenario | Behavior | LYG Calls |
|----------|----------|-----------|
| 1 page load | 1 call per member | 100+ |
| 10 tabs open | Each tab → separate calls | 1000+ |
| 5 users | All fetch simultaneously | 500+ |
| **Total** | **Spam LYG API** | **Exceeds 150/15min** ⚠️ |

### After (Solution)
| Resource | Cache TTL | Max Calls/Hour | Protection |
|----------|-----------|----------------|------------|
| Members | 30 minutes | 2 calls/hour | ✅ |
| Banklogs | 60 seconds | 60 calls/hour | ✅ |
| **Total** | **Cached** | **~62 calls/hour** | ✅ Well under limit |

**Multi-Tab/User Scenarios**:
- 10 tabs → 1 LYG call (shared cache)
- 5 users → 1 LYG call (distributed lock prevents duplicates)
- Concurrent requests → Lock ensures only 1 fetch at a time

---

## ✅ Testing Checklist

### 1. Single User, Single Tab
```bash
# First request (cache miss)
curl http://localhost:3000/api/lyg/members
# → Should call LYG, cache result
# → "cached": false

# Second request (within 30min)
curl http://localhost:3000/api/lyg/members
# → Should return cached data
# → "cached": true
```

### 2. Multiple Tabs
1. Open 5 tabs with `/staff/members`
2. Check network tab → Should see only 1 LYG fetch
3. All tabs share cached response

### 3. Concurrent Requests (Distributed Lock)
```bash
# Terminal 1
curl http://localhost:3000/api/lyg/members &

# Terminal 2 (immediately)
curl http://localhost:3000/api/lyg/members &

# Result: Only 1 LYG call (lock prevents duplicate)
```

### 4. Force Refresh
```bash
curl http://localhost:3000/api/lyg/members?force=true
# → Invalidates cache, fetches fresh data
```

### 5. Auto-Refresh (React Hook)
1. Open component using `useMembers()`
2. Wait 30 minutes
3. Hook should auto-refresh in background
4. UI updates with fresh data

### 6. Cleanup Cron
```bash
curl http://localhost:3000/api/cron/cleanup-cache
# → Should delete expired entries
```

---

## 🔧 Configuration

### Environment Variables
```env
# Optional: Protect cleanup cron
CRON_SECRET=your-secret-here
```

### Adjust TTL (if needed)
**Members TTL** (`app/api/lyg/members/route.ts`):
```typescript
const CACHE_TTL_MS = 30 * 60 * 1000; // Change to 15min, 60min, etc.
```

**Banklogs TTL** (`app/api/lyg/banklogs/route.ts`):
```typescript
const CACHE_TTL_MS = 60 * 1000; // Change to 30s, 120s, etc.
```

---

## 📊 Monitoring

### Check Cache Status
```sql
-- Active cache entries
SELECT key, updatedAt, expiresAt 
FROM "CacheKV" 
WHERE expiresAt > NOW();

-- Active locks
SELECT key, holder, expiresAt, createdAt
FROM "Lock"
WHERE expiresAt > NOW();
```

### Logs to Watch
```typescript
// Cache hit
[cache] Hit { key: "lyg:esperados:members", age: 120000 }

// Cache miss → fetch
[cache] Miss { key: "lyg:esperados:members" }
[lyg/members] Cache miss, fetching from LYG

// Lock acquired
[lock] Acquired { key: "lock:lyg:esperados:members", holder: "abc12345", ttlMs: 30000 }

// Lock already held (another process fetching)
[lock] Already locked { key: "lock:lyg:esperados:members" }
```

---

## 🛠️ Troubleshooting

### Problem: TypeScript errors on `prisma.cacheKV`
**Solution**: Regenerate Prisma Client
```bash
npx prisma generate
```

### Problem: Cache not clearing after manual sync
**Solution**: Force refresh
```typescript
// Client-side
const { refresh } = useMembers();
refresh(); // Adds ?force=true to API call
```

### Problem: Lock stuck (process crashed mid-fetch)
**Solution**: Locks auto-expire after TTL (30s)
- Wait 30 seconds, lock will be released automatically
- Or run cleanup: `curl /api/cron/cleanup-cache`

### Problem: Rate limit still exceeded
**Diagnosis**:
1. Check cache TTL is set correctly
2. Verify cleanup cron is running
3. Check for old endpoints directly calling LYG (bypass cache)

---

## 📈 Next Steps (Optional Enhancements)

### 1. Cache Warming
Create a background job to pre-populate cache before expiry:
```typescript
// Every 25 minutes (before 30min expiry)
cron.schedule("*/25 * * * *", async () => {
  await fetch("/api/lyg/members?force=true");
});
```

### 2. Cache Metrics
Add instrumentation to track:
- Cache hit rate
- Lock contention frequency
- Average LYG response time

### 3. Stale-While-Revalidate
Return stale cache immediately + fetch fresh in background:
```typescript
if (ageMs > CACHE_TTL_MS - 60000) {
  // Expiring soon, trigger background refresh
  fetchInBackground(cacheKey);
}
return cachedData; // Return stale immediately
```

### 4. Redis Migration (Production Scale)
For high-traffic deployments, consider migrating from DB to Redis:
- Faster cache reads (<1ms vs ~5ms)
- Built-in TTL management
- Atomic lock operations

---

## 📝 Summary

✅ **Database**: CacheKV + Lock models created
✅ **Backend**: Cache manager + distributed locks implemented
✅ **Endpoints**: `/api/lyg/members` + `/api/lyg/banklogs` cached
✅ **Client**: React hooks with auto-refresh
✅ **Maintenance**: Cleanup cron job

**Rate Limit Protection**:
- Members: 30min cache → 2 calls/hour
- Banklogs: 60s cache → 60 calls/hour
- Multi-tab/user: Shared cache + distributed locks
- **Result**: Never exceed LYG 150 req/15min limit ✅

**Current Status**: Ready for testing and deployment 🚀
