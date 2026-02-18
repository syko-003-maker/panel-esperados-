# Discord Worker /link Fix - Quick Reference

## Problem
```
Error: Unexpected token '<' ... is not valid JSON
at JSON.parse when calling /api/staff/link
```

## Root Cause
- Worker authenticates via `Authorization: Bearer` header
- `/api/staff/link` only accepts NextAuth session (no header support)
- Route returns 401 + HTML login redirect
- Worker tries `res.json()` on HTML → JSON parse error

## Solution: Dual Authentication

### Modified Routes
1. **POST /api/staff/link** → Check `x-ingest-secret` header first
2. **GET /api/staff/link/{discordId}** → Check `x-ingest-secret` header first
3. **DELETE /api/staff/link/{discordId}** → Check `x-ingest-secret` header first

### Changed Headers
```typescript
// BEFORE (broken)
Authorization: `Bearer ${WORKER_SECRET}`

// AFTER (fixed)
"x-ingest-secret": WORKER_SECRET
```

### Files Changed
- ✅ `app/api/staff/link/route.ts` - POST handler
- ✅ `app/api/staff/link/[discordId]/route.ts` - GET + DELETE handlers
- ✅ `discord-worker/src/link.ts` - panelFetch() helper
- ✅ `discord-worker/src/commands.ts` - panelFetch() helper

## Build Status
✅ **Passed** - 0 errors, 161/161 pages

## Testing
```bash
# Verify secret is set
echo $INGEST_SECRET

# Test the endpoint
curl -X POST http://localhost:3000/api/staff/link \
  -H "x-ingest-secret: $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"discordId": "USER_ID", "steamId": "STEAM_ID", "rpName": "Name"}'

# Should return JSON: {"ok": true, "discordId": "...", ...}
# NOT HTML redirect to login
```

## What's NOT Changed
- ✅ Staff web UI authentication (still uses NextAuth)
- ✅ RBAC permissions (still enforced)
- ✅ Database schema (no changes)
- ✅ Other API endpoints (unchanged)

## Deployment
1. Ensure `INGEST_SECRET` is set in `.env.prod`
2. Deploy updated code (4 files)
3. Restart Discord worker
4. Test `/link` command in Discord

## Success Indicators
✅ No "Unexpected token '<'" errors  
✅ Worker logs show successful JSON responses  
✅ Member links are created successfully  
✅ No changes needed to staff UI
