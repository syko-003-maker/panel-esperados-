# LYG Rate Limit Protection - Deployment Checklist

## ✅ Pre-Deployment

### 1. Database Migration
```bash
# Run migration to create CacheKV and Lock tables
npx prisma migrate deploy

# Verify migration
npx prisma studio
# → Check that CacheKV and Lock tables exist
```

### 2. Generate Prisma Client
```bash
# Regenerate Prisma Client with new models
npx prisma generate

# Verify types
# → Open src/lib/cache.ts
# → TypeScript should recognize prisma.cacheKV and prisma.lock
```

### 3. Environment Variables
```env
# Optional: Add cron secret for cleanup endpoint protection
CRON_SECRET=your-secure-random-string-here
```

### 4. Build Test
```bash
# Test build to ensure no TypeScript errors
npm run build

# Expected output:
# ✓ Compiled successfully
# ✓ No type errors
```

---

## 🚀 Deployment Steps

### Step 1: Deploy Database Changes
```bash
# Production database
npx prisma migrate deploy --schema=./prisma/schema.prisma
```

### Step 2: Deploy Application
```bash
# Build production bundle
npm run build

# Or deploy via your platform
git add .
git commit -m "feat: LYG rate limit protection with cache + distributed locks"
git push origin main
```

### Step 3: Verify Endpoints
```bash
# Test members endpoint
curl https://your-panel.com/api/lyg/members?familyId=esperados

# Expected response:
{
  "ok": true,
  "data": [...],
  "cached": false,  # First call
  "fetchedAt": "2026-02-16T...",
  "ttlMs": 1800000
}

# Test again (should be cached)
curl https://your-panel.com/api/lyg/members?familyId=esperados

# Expected response:
{
  "ok": true,
  "data": [...],
  "cached": true,  # Cached!
  "fetchedAt": "2026-02-16T...",
  "ttlMs": 1800000
}

# Test banklogs
curl https://your-panel.com/api/lyg/banklogs?familyId=esperados
```

### Step 4: Setup Cleanup Cron

#### Option A: Vercel Cron
Create `vercel.json`:
```json
{
  "crons": [
    {
      "path": "/api/cron/cleanup-cache",
      "schedule": "*/10 * * * *"
    }
  ]
}
```

#### Option B: External Cron (cron-job.org, EasyCron, etc.)
```bash
# Add cron job to call cleanup endpoint every 10 minutes
*/10 * * * * curl -H "Authorization: Bearer YOUR_CRON_SECRET" https://your-panel.com/api/cron/cleanup-cache
```

#### Option C: Cloudflare Workers Cron
```javascript
// wrangler.toml
[triggers]
crons = ["*/10 * * * *"]

// worker.js
addEventListener("scheduled", (event) => {
  event.waitUntil(
    fetch("https://your-panel.com/api/cron/cleanup-cache", {
      headers: { Authorization: `Bearer ${CRON_SECRET}` }
    })
  );
});
```

### Step 5: Monitor First Hour
Check logs for:
- ✅ Cache hits/misses
- ✅ Lock acquisition
- ✅ LYG API call frequency
- ⚠️ Any errors

```bash
# Watch logs
npm run start:prod
# or
vercel logs --follow
```

---

## 🧪 Post-Deployment Testing

### Test 1: Cache Behavior
```bash
# First call (should hit LYG)
time curl https://your-panel.com/api/lyg/members
# → Response time: ~2-5s (LYG fetch)
# → "cached": false

# Second call (should use cache)
time curl https://your-panel.com/api/lyg/members
# → Response time: <100ms (DB cache)
# → "cached": true
```

### Test 2: Multi-Tab Deduplication
1. Open 5 browser tabs
2. Navigate all to `/staff/members` (or page using `useMembers()`)
3. Check network tab → Should see only **1 LYG API call**
4. All tabs share the cached response

### Test 3: Distributed Lock (Concurrent Requests)
```bash
# Terminal 1
curl https://your-panel.com/api/lyg/members &

# Terminal 2 (immediately)
curl https://your-panel.com/api/lyg/members &

# Terminal 3 (immediately)
curl https://your-panel.com/api/lyg/members &

# Wait for all to complete
wait

# Check logs → Should see:
# [lock] Acquired { key: "lock:lyg:esperados:members", ... }
# [lock] Already locked { key: "lock:lyg:esperados:members", ... }
# [lock] Already locked { key: "lock:lyg:esperados:members", ... }
# → Only 1 LYG call made!
```

### Test 4: Force Refresh
```bash
curl "https://your-panel.com/api/lyg/members?force=true"
# → Should invalidate cache and fetch fresh data
# → "cached": false
```

### Test 5: Auto-Refresh (React Hook)
1. Open page with `useMembers({ refreshInterval: 30000 })` (30s for testing)
2. Wait 30 seconds
3. Network tab should show new fetch after 30s
4. UI updates with fresh data

### Test 6: Cleanup Cron
```bash
# Manually trigger cleanup
curl -H "Authorization: Bearer YOUR_CRON_SECRET" \
  https://your-panel.com/api/cron/cleanup-cache

# Expected response:
{
  "ok": true,
  "cacheDeleted": 0,  # No expired entries yet
  "locksDeleted": 0,
  "durationMs": 23
}
```

---

## 📊 Monitoring Checklist

### Week 1: Monitor Rate Limit Compliance

#### Check LYG API calls per hour
```sql
-- Count cache updates (= LYG API calls)
SELECT 
  DATE_TRUNC('hour', "updatedAt") as hour,
  COUNT(*) as cache_updates
FROM "CacheKV"
WHERE key LIKE 'lyg:%'
  AND "updatedAt" > NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour DESC;

-- Expected results:
-- Members: ~2 updates/hour (30min TTL)
-- Banklogs: ~60 updates/hour (60s TTL)
-- TOTAL: ~62 updates/hour << 150 req/15min (600/hour) ✅
```

#### Check cache hit rate
```sql
-- Cache entries by key
SELECT 
  key,
  COUNT(*) as times_cached,
  MAX("updatedAt") as last_updated,
  MAX("expiresAt") as expires_at
FROM "CacheKV"
WHERE "expiresAt" > NOW()
GROUP BY key;
```

#### Check lock contention
```sql
-- Locks created (indicates concurrent requests)
SELECT 
  DATE_TRUNC('hour', "createdAt") as hour,
  COUNT(*) as lock_attempts
FROM "Lock"
WHERE "createdAt" > NOW() - INTERVAL '7 days'
GROUP BY hour
ORDER BY hour DESC;

-- If lock_attempts >> 2/hour for members:
-- → Multiple concurrent requests (GOOD, lock is working!)
```

### Application Logs to Monitor
```bash
# Cache hits (should be majority)
grep "\[cache\] Hit" logs.txt | wc -l

# Cache misses (should be ~2/30min for members)
grep "\[cache\] Miss" logs.txt | wc -l

# Lock contention (multiple processes trying to fetch)
grep "\[lock\] Already locked" logs.txt | wc -l

# LYG API errors (should be minimal)
grep "\[lyg/members\] Error" logs.txt
grep "\[lyg/banklogs\] Error" logs.txt
```

---

## 🐛 Troubleshooting

### Problem: "Property 'cacheKV' does not exist"
**Cause**: Prisma Client not regenerated
**Solution**:
```bash
npx prisma generate
# Restart TypeScript server in IDE
```

### Problem: Cache always returns `cached: false`
**Diagnosis**:
```sql
-- Check if cache entries exist
SELECT * FROM "CacheKV";
```
**Possible causes**:
1. TTL too short → Check `CACHE_TTL_MS` in route files
2. Cache being invalidated on every request → Check for unintended `deleteCache()` calls
3. Clock skew → Check server time vs. `expiresAt`

### Problem: Lock stuck, requests timing out
**Diagnosis**:
```sql
-- Check stuck locks
SELECT * FROM "Lock" WHERE "expiresAt" < NOW();
```
**Solution**:
```sql
-- Manually clear stuck locks
DELETE FROM "Lock" WHERE "expiresAt" < NOW();

-- Or run cleanup
curl /api/cron/cleanup-cache
```

### Problem: Still hitting rate limit
**Diagnosis**:
1. Check old endpoints directly calling LYG (bypassing cache):
```bash
grep -r "lygFetchMembers" app/
grep -r "fetchLygBanklogs" app/
# → Should only be in /api/lyg/members and /api/lyg/banklogs
```

2. Check cleanup cron is running:
```sql
-- Expired entries should be cleaned up regularly
SELECT COUNT(*) FROM "CacheKV" WHERE "expiresAt" < NOW();
SELECT COUNT(*) FROM "Lock" WHERE "expiresAt" < NOW();
-- → Should be 0 if cron is working
```

3. Monitor actual LYG calls:
```bash
# Add logging to track LYG calls
grep "\[LYG\] ->" logs.txt | wc -l
# → Should be ~62/hour max
```

---

## ✅ Deployment Complete Checklist

- [ ] Database migration applied (`npx prisma migrate deploy`)
- [ ] Prisma Client regenerated (`npx prisma generate`)
- [ ] Build successful (`npm run build`)
- [ ] Endpoints responding (`/api/lyg/members`, `/api/lyg/banklogs`)
- [ ] Cache working (second request returns `cached: true`)
- [ ] Cleanup cron configured (Vercel/external)
- [ ] Multi-tab test passed (only 1 LYG call)
- [ ] Rate limit monitoring setup (logs + DB queries)
- [ ] Force refresh working (`?force=true`)
- [ ] Auto-refresh working (React hooks)

**Status**: 🚀 Ready for production!

---

## 📞 Support

If issues persist:
1. Check application logs for errors
2. Verify database state (`SELECT * FROM "CacheKV"`)
3. Test endpoints manually with curl
4. Monitor LYG API call frequency

**Expected behavior**:
- Cache hit rate: >95% after first hour
- LYG calls: ~62/hour (well under 150/15min limit)
- Response time: <100ms (cached), 2-5s (LYG fetch)
- Multi-tab: Shared cache (no duplicate calls)
