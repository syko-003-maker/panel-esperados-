# Discord Architecture Redesign - Status Report

## ✅ Completed

### 1. Database Schema (Prisma)
- **Migration created**: `20260216000932_add_discord_snapshot_and_role_jobs`
- **New Models**:
  - `DiscordSnapshot` - Persistent Discord state cache
    - Fields: discordId (unique), inGuild, roles, fetchedAt, lastOkAt, lastErrorCode, lastErrorAt, source
    - Purpose: Store "last known good" state for graceful degradation
  - `DiscordRoleJob` - Job queue for reliable role operations
    - Fields: type, discordId, guildId, payload (JSON), status, attempts, maxAttempts, runAt, executedAt
    - Purpose: Async role apply/remove with retry logic
- **Enums Extended**:
  - `DiscordJobType`: Added APPLY_ROLES, REMOVE_ROLES, SYNC_MEMBER
  - `DiscordJobStatus`: Added RUNNING, SUCCEEDED
- **Applied to DB**: ✅ Migration successful

### 2. Core Library: `lib/discord-batch-reliable.ts`
- **Purpose**: Batch Discord member verification with resilience
- **Features**:
  - In-memory cache (10min fresh, 1h stale)
  - DB persistence via `DiscordSnapshot`
  - "Last known good" fallback (< 24h)
  - 429 backoff with exponential retry (up to 3 attempts)
  - Respect Retry-After header
  - Concurrency limit (3 workers)
  - Source tracking ("live" | "cache" | "lastKnownGood")
- **Exports**:
  - `batchFetchDiscordMembers(ids: string[])` → `Record<string, DiscordMemberStatus>`
  - `verifyDiscordConfig()` → Config validation helper

### 3. Enhanced Batch Endpoint: `api/discord/members-status/route.ts`
- **Simplified**: Now delegates to `discord-batch-reliable.ts`
- **Breaking changes**: None (same API contract)
- **Response format**: `{ [discordId]: { ok, inGuild?, roles?, fetchedAt?, source?, errorCode? } }`

### 4. Job Worker: `api/discord/role-jobs/worker/route.ts`
- **Purpose**: Process role application queue
- **Trigger**: POST with `?secret=DISCORD_WORKER_SECRET`
- **Features**:
  - Batch processing (10 jobs at a time)
  - Concurrency limit (2 API calls)
  - Exponential backoff on 429 (2s → 4s → 8s → 60s max)
  - Retry logic (up to 5 attempts by default)
  - Updates `DiscordSnapshot` on successful sync
- **Job Types**:
  - APPLY_ROLES: Apply roles from payload.roles
  - REMOVE_ROLES: Remove roles from payload.roles
  - SYNC_MEMBER: Fetch + persist full member state
- **Status Flow**: PENDING → RUNNING → SUCCEEDED | FAILED

### 5. Enhanced RBAC: `lib/discord-rbac-enhanced.ts`
- **Purpose**: Staff access checks with graceful degradation
- **Functions**:
  - `checkStaffAccess(discordId, requireRoles?)` - For READ operations
    - Policy: Allow if fresh (<15min) OR lastOkAt <24h
  - `checkStaffAccessForWrite(discordId, requireRoles?)` - For WRITE operations
    - Policy: Require fresh check (<5min) OR deny
  - `batchCheckStaffAccess(discordIds[], requireRoles?)` - Batch check
- **Return Type**: `RBACCheckResult`
  - `{ allowed, roles, reason: "fresh"|"cache"|"lastKnownGood"|"denied"|"notInGuild", fetchedAt?, lastOkAt?, errorCode? }`

### 6. Utility: `lib/utils/delay.ts`
- Simple `createDelay(ms)` for rate limit backoff

## ⚠️ Known Issues (TypeScript Language Server)

VS Code Language Server shows errors on `prisma.discordSnapshot` and `prisma.discordRoleJob` despite:
- ✅ Prisma Client generated successfully
- ✅ Migration applied to DB
- ✅ `tsc --noEmit` confirms types exist (no blocking errors in actual build)

**Workaround**: Restart TS Server in VS Code (`Ctrl+Shift+P` → "TypeScript: Restart TS Server")

## 🚧 Remaining Work

### 1. Update Existing Guards (`lib/guards.ts`)
- **Current**: Uses `getDiscordRolesForUserWithStatus()` (old lib with in-memory cache only)
- **Needed**: Switch to `discord-rbac-enhanced.ts` functions
- **Functions to update**:
  - `requirePrivileged()` → Use `checkStaffAccess()`
  - `requireRecruiterOrAbove()` → Use `checkStaffAccess(requireRoles)`
  - `requireStaffFull()` → Use `checkStaffAccess(requireRoles)`
- **Breaking**: Add handling for `lastKnownGood` reason (show warning in UI)

### 2. UI Updates: Staff Member Page
**File**: `app/staff/members/page.tsx` (or client component)

**Changes Needed**:
- Fetch Discord status with `source` + `fetchedAt` + `lastOkAt` metadata
- Update badge logic:
  ```tsx
  // Before: "Discord OK" | "Discord indisponible" | "⚠️ Discord indisponible"
  // After:
  - "✅ Sur le serveur (live)" - source=live, inGuild=true
  - "✅ Sur le serveur (cache 5min)" - source=cache, age<15min
  - "⚠️ Sur le serveur (cache 2h)" - source=lastKnownGood
  - "❌ Pas sur le serveur" - inGuild=false
  - "🔄 À vérifier" - errorCode=RATE_LIMIT (neutral, not error)
  - "⚠️ Non vérifié" - errorCode=UNAVAILABLE
  ```
- Add "Resync Discord" button:
  - Calls `POST /api/discord/role-jobs/enqueue` with `{ type: "SYNC_MEMBER", discordId, guildId }`
  - Shows "Queued..." toast
  - Auto-refreshes after 10s

### 3. Job Enqueueing API (Optional but Recommended)
**File**: `app/api/discord/role-jobs/enqueue/route.ts`

**Purpose**: Allow UI/backend to queue role changes without direct Discord API calls

**Request**:
```json
POST /api/discord/role-jobs/enqueue
{
  "type": "APPLY_ROLES" | "REMOVE_ROLES" | "SYNC_MEMBER",
  "discordId": "123456789",
  "guildId": "987654321",
  "payload": {
    "roles": ["role_id_1", "role_id_2"],
    "reason": "Sanction applied via panel"
  }
}
```

**Response**:
```json
{ "ok": true, "jobId": 42, "runAt": "2026-02-16T01:15:00Z" }
```

### 4. Cron Job / Webhook Setup
**Worker endpoint**: `/api/discord/role-jobs/worker?secret=YOUR_SECRET`

**Option A - Vercel Cron** (vercel.json):
```json
{
  "crons": [
    {
      "path": "/api/discord/role-jobs/worker?secret=$DISCORD_WORKER_SECRET",
      "schedule": "*/5 * * * *"
    }
  ]
}
```

**Option B - External Cron** (cron-job.org, GitHub Actions):
```bash
curl -X POST "https://your-domain.com/api/discord/role-jobs/worker?secret=YOUR_SECRET"
```

**Frequency**: Every 5-10 minutes (or more frequent if critical)

### 5. Monitoring & Alerts (Nice to Have)
- Add logging dashboard for job failures
- Alert on high FAILED job count
- Monitor `lastOkAt` age (warn if >12h for many members)

## 🧪 Testing Plan

### Unit Tests
- [ ] `batchFetchDiscordMembers()` with various 429 scenarios
- [ ] `checkStaffAccess()` with lastKnownGood fallback
- [ ] Job processor retry logic

### Integration Tests
- [ ] End-to-end: Enqueue job → Worker processes → Discord API called → Snapshot updated
- [ ] Graceful degradation: Simulate 429 → Verify access still granted with lastKnownGood

### Manual Tests
1. **429 Resilience**:
   - Trigger rate limit (spam Discord API)
   - Verify staff can still access panel (using lastKnownGood)
   - Check UI shows "⚠️ Cache utilisé (2h)"
2. **Job Queue**:
   - Enqueue APPLY_ROLES job
   - Trigger worker
   - Verify role applied in Discord
   - Check `DiscordSnapshot` updated
3. **UI Status Badges**:
   - Fresh member: "✅ Sur le serveur (live)"
   - Rate-limited: "🔄 À vérifier"
   - Old cache: "⚠️ Sur le serveur (cache 2h)"

## 📦 Deployment Checklist

- [x] Prisma migration applied (`npx prisma migrate deploy`)
- [x] Prisma client generated (`npx prisma generate`)
- [ ] Environment variables set:
  - `DISCORD_WORKER_SECRET` - Secret for worker endpoint auth
  - `DISCORD_TOKEN` or `DISCORD_BOT_TOKEN` - Bot token
  - `GUILD_ID` or `DISCORD_GUILD_ID` - Discord server ID
- [ ] Cron job configured (Vercel or external)
- [ ] Guards updated to use `discord-rbac-enhanced.ts`
- [ ] UI updated with new badge logic
- [ ] Test in staging with 429 simulation

## 🎯 Final Architecture

```
Frontend (UI)
    │
    ├─── GET /api/discord/members-status?ids=... ───┐
    │                                               │
    │                                               ▼
    │                                    [discord-batch-reliable.ts]
    │                                               │
    │                                    ┌──────────┴──────────┐
    │                                    │                     │
    │                            [In-Memory Cache]    [DB: DiscordSnapshot]
    │                                    │                     │
    │                                    └──────┬──────────────┘
    │                                           │
    │                                    Discord API (with 429 backoff)
    │
    ├─── POST /api/discord/role-jobs/enqueue ──► [DB: DiscordRoleJob] (PENDING)
    │
    │
[Cron/Webhook every 5min]
    │
    └─── POST /api/discord/role-jobs/worker ───► Process jobs ───► Discord API
                                                       │
                                                       └─► Update DiscordSnapshot
```

**Key Principles**:
1. **Never deny access on transient 429** - Use lastKnownGood
2. **Batch all Discord API calls** - No per-member spam
3. **Queue all write operations** - Reliable + retryable
4. **Persistent cache in DB** - Survive restarts
5. **Clear UI about data freshness** - Users understand status

## 📚 Related Files

### Modified
- `prisma/schema.prisma` - New models + enums
- `app/api/discord/members-status/route.ts` - Simplified batch endpoint
- `lib/guards.ts` - **TO UPDATE** (use new RBAC lib)
- `app/staff/members/page.tsx` - **TO UPDATE** (new badge UI)

### Created
- `src/lib/discord-batch-reliable.ts` - Core cache + batch library
- `src/lib/discord-rbac-enhanced.ts` - RBAC with lastKnownGood
- `src/lib/utils/delay.ts` - Delay utility
- `app/api/discord/role-jobs/worker/route.ts` - Job processor
- `prisma/migrations/20260216000932_add_discord_snapshot_and_role_jobs/` - Migration

### To Create (Optional)
- `app/api/discord/role-jobs/enqueue/route.ts` - Job enqueueing endpoint
- `vercel.json` or cron config - Worker trigger

---

**Status**: 🟡 Core implementation complete, integration pending

**Next Steps**: Update guards + UI, then test with 429 simulation
