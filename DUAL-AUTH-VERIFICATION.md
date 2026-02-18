# Dual Authentication Verification Guide

## Overview
This document verifies the complete implementation of dual authentication (NextAuth session + x-ingest-secret header) for the `/link` system.

## Architecture

### Authentication Methods
1. **Staff Web Users**: NextAuth session (checks Chef/État-Major role)
2. **Discord Worker**: Machine-to-machine via `x-ingest-secret` header

### Key Environment Variables
- **Panel**: `INGEST_SECRET` (shared secret with worker)
- **Worker**: `INGEST_SECRET` (for sending requests) + `INGEST_BASE_URL` (for routing to panel)
- Both sides must use identical `INGEST_SECRET` value

## Request Flow Verification

### 1. Worker Requests (Inbound to Panel)

#### Request Path
```
Discord Worker
  ↓
panelFetch() sends: POST /api/staff/link/{discordId}
  Headers: x-ingest-secret: {WORKER_SECRET}
  Body: {discordId, steamId, rpName}
  ↓
proxy.ts (Middleware)
  - Checks: x-ingest-secret header matches INGEST_SECRET env var
  - If valid AND path is /api/staff/link → bypass NextAuth ✅
  - If invalid OR missing → redirect to /login (HTML) ❌
  ↓
/api/staff/link/{discordId}/route.ts (POST)
  - Checks: x-ingest-secret header AGAIN
  - If valid → allow access, process request
  - If invalid → 401 Unauthorized (JSON)
  ↓
Prisma save operation
  ↓
Response: {ok: true, discordId, steamId, rpName, memberId} (JSON)
```

#### Critical Points
✅ **x-ingest-secret header is ALWAYS sent** (link.ts line 118)
```typescript
headers: {
  ...options.headers,
  "x-ingest-secret": WORKER_SECRET,
  "Content-Type": "application/json",
}
```

✅ **Middleware bypasses NextAuth** (proxy.ts lines 51-57)
```typescript
const ingestSecret = req.headers.get("x-ingest-secret");
const expectedSecret = process.env.INGEST_SECRET;

if (ingestSecret && expectedSecret && ingestSecret === expectedSecret && isWorkerAccessiblePath(pathname)) {
  return NextResponse.next();
}
```

✅ **Routes validate secret** (e.g., [discordId]/route.ts lines 115-132)
```typescript
const ingestSecret = req.headers.get("x-ingest-secret");
if (ingestSecret) {
  if (!INGEST_SECRET) return 503 error
  if (ingestSecret !== INGEST_SECRET) return 401 error
}
```

### 2. Discord Worker Request Lifecycle

#### Button Click → Modal Show
```typescript
// index.ts line 694: Check if modal action
const isModalAction = interaction.customId.startsWith(LINK_CUSTOM_IDS.LINK_BUTTON);
if (!isModalAction) {
  await interaction.deferUpdate(); // Skip for modal actions!
}

// link.ts line 680: Show modal directly (no prior deferReply)
await interaction.showModal(modal);
```

#### Modal Submit → API Call
```typescript
// link.ts line 954: Defer with ephemeral flag
await interaction.deferReply({ flags: MessageFlags.Ephemeral });

// link.ts line 978: Call updateMemberLink
const result = await updateMemberLink(targetId, steamId, rpName);

// updateMemberLink (line 231): Send x-ingest-secret header
const data = await panelFetch(`/api/staff/link/${discordId}`, {
  method: "POST",
  body: JSON.stringify({ discordId, steamId, rpName })
});
```

## Verification Checklist

### Pre-Deployment Verification

#### 1. Environment Variables
- [ ] Panel has `INGEST_SECRET` set to same value as worker
- [ ] Worker has `INGEST_SECRET` set (for requests)
- [ ] Worker has `INGEST_BASE_URL` set to https://losesperados.xyz (NOT localhost)
- [ ] Verify in logs: Worker won't start if INGEST_SECRET is missing (throws error)

#### 2. Code Inspection
- [ ] panelFetch() includes x-ingest-secret header on every request ✅ (link.ts:118)
- [ ] Middleware bypasses NextAuth for valid x-ingest-secret ✅ (proxy.ts:51-57)
- [ ] All three endpoints check x-ingest-secret first ✅
  - [ ] POST /api/staff/link ✅ (route.ts:27-50)
  - [ ] GET /api/staff/link/[discordId] ✅ ([discordId]/route.ts:36-53)
  - [ ] DELETE /api/staff/link/[discordId] ✅ ([discordId]/route.ts:249-266)
- [ ] POST /api/staff/link/[discordId] ✅ ([discordId]/route.ts:115-132)

#### 3. Response Format Verification
- [ ] All worker endpoints return JSON (never HTML)
- [ ] panelFetch checks content-type before JSON.parse() ✅ (link.ts:133-146)
- [ ] If HTML received, panelFetch logs error and returns null ✅ (link.ts:143)

#### 4. Interaction Lifecycle Verification
- [ ] Button "link:req:modify" doesn't call deferUpdate before showModal ✅ (index.ts:694)
- [ ] Modal opens directly without "InteractionAlreadyReplied" error ✅
- [ ] Modal submit calls deferReply with ephemeral flag ✅ (link.ts:954)

### Post-Deployment Verification

#### 1. Logs to Check
In Discord worker logs, you should see:
```json
{
  "event": "link_request",
  "method": "POST",
  "url": "https://losesperados.xyz/api/staff/link/{discordId}",
  "hasIngestSecret": true,
  "secretLength": 32
}
{
  "event": "link_response",
  "status": 200,
  "contentType": "application/json",
  "isJSON": true
}
```

#### 2. Test Scenarios

**Scenario A: Valid x-ingest-secret**
1. User runs `/link @member` (staff command)
2. System shows link panel with buttons
3. Click "Lier/Modifier"
4. Modal opens (no "InteractionAlreadyReplied" error)
5. Fill SteamID + RP Name + Submit
6. Response: "✅ Liaison Enregistrée... {steamId}... {rpName}."
7. Worker logs show: `"event": "link_submit_ok"` with memberId

**Scenario B: Missing INGEST_SECRET in panel**
1. Worker sends request with valid x-ingest-secret header
2. Middleware allows through (because it matches env)
3. Route receives request
4. API responds: `{ok: true, ...}`
5. ✅ Request succeeds (env matching)

**Scenario C: Wrong INGEST_SECRET value**
1. Worker sends x-ingest-secret: "wrong_value"
2. Middleware blocks (doesn't match INGEST_SECRET env)
3. Request redirected to /login (HTML 302)
4. panelFetch receives HTML
5. panelFetch checks content-type
6. Logs: `"event": "panel_fetch_non_json_success"` with error message
7. Returns null
8. Worker shows: "❌ Erreur: Impossible de créer/modifier la liaison..."

**Scenario D: INGEST_SECRET missing in worker**
1. Worker startup fails with: "INGEST_SECRET or DISCORD_WORKER_SECRET is required."
2. No requests sent
3. ✅ Fail-safe (prevents misconfiguration)

**Scenario E: Wrong INGEST_BASE_URL in worker**
1. Worker startup fails with: "INGEST_BASE_URL is required..."
2. No requests sent
3. ✅ Fail-safe (prevents localhost fallback)

## Response Format Specification

### Success Response (200 OK)
```json
{
  "ok": true,
  "discordId": "user_id",
  "steamId": "76561198012345678",
  "rpName": "Jean Dupont",
  "memberId": "unique_member_id"
}
```

### Error Response (4xx/5xx)
```json
{
  "ok": false,
  "error": "ERROR_CODE",
  "details": "Human readable message"
}
```

### Content-Type
- **All responses**: `application/json; charset=utf-8`
- **Worker requests**: Always JSON (never redirects)
- **Staff requests**: JSON (unless they request HTML via Accept header)

## Security Considerations

### Defense in Depth
1. ✅ Middleware checks before route handler
2. ✅ Route handler checks AGAIN before processing
3. ✅ INGEST_SECRET must match exactly (not just presence)
4. ✅ Worker fails at startup if secret missing (prevents misconfiguration)
5. ✅ panelFetch verifies content-type before JSON parsing (prevents HTML crash)

### Attack Surface
- ✅ Worker must know correct INGEST_SECRET to authenticate
- ✅ Brute force: Each wrong attempt returns 401 immediately
- ✅ Man-in-the-middle: HTTPS enforced (https://losesperados.xyz)
- ✅ HTML injection: panelFetch checks content-type, doesn't parse HTML as JSON

## Troubleshooting

### Issue: "Unexpected token '<'" Error
**Cause**: Worker received HTML instead of JSON (HTML login page)
**Root Cause**: One of:
1. x-ingest-secret header not sent
2. x-ingest-secret value doesn't match env var
3. INGEST_SECRET not set in panel env
4. Worker calling http://localhost:3000 instead of https://losesperados.xyz

**Fix**:
- Verify INGEST_SECRET is set in both panel and worker
- Verify INGEST_BASE_URL is set in worker (should be https://losesperados.xyz)
- Check worker logs for `"event": "link_request"` to confirm header is sent
- Check worker logs for `"event": "link_response"` to see actual content-type received

### Issue: "InteractionAlreadyReplied" Error
**Cause**: Code called showModal() after already calling deferReply/deferUpdate
**Fix**: Check index.ts line 694-712 to ensure isModalAction skips deferUpdate

### Issue: Modal Doesn't Open
**Cause**: showModal() threw exception OR prior interaction was already consumed
**Fix**:
- Check Discord worker console for errors
- Verify no deferUpdate/deferReply before showModal call
- Verify permission to open modals

### Issue: API Returns 401 INVALID_INGEST_SECRET
**Causes**:
1. Worker sent wrong secret value
2. INGEST_SECRET env var changed but worker not restarted
3. Worker is using old cached value

**Fix**:
- Confirm INGEST_SECRET value in both environments matches exactly
- Restart worker if env var changed
- Check logs: `"event": "link_request"` shows `"secretLength"`

## Building & Deploying

### Build Commands
```bash
# Worker
cd discord-worker
npm run build    # Compiles TypeScript

# Panel
cd ..
npm run build    # Next.js build
```

### Expected Build Output
```
> tsc -p tsconfig.json          # Worker - no errors
> next build                    # Panel - routes compiled, no errors
✓ Route (app) compiled
✓ Middleware compiled
```

### Environment Setup (Production)
```bash
# .env.production or deployment config
INGEST_SECRET=<generated_random_secret_32_chars>
INGEST_BASE_URL=https://losesperados.xyz

# Worker env
INGEST_SECRET=<same_as_panel>
INGEST_BASE_URL=https://losesperados.xyz
DISCORD_WORKER_SECRET=<same_as_INGEST_SECRET>  # Fallback
```

## Success Criteria

✅ **All Tasks Complete When**:
1. Worker sends `/link @member` command
2. Panel displays link management interface
3. Click "Lier/Modifier" button
4. Modal opens directly (no intermediate confirmation)
5. Fill SteamID (17 digits) + RP Name (1-50 chars)
6. Click Submit
7. Response: "✅ Liaison Enregistrée... {steamId}... {rpName}."
8. No "Unexpected token '<'" errors
9. No "InteractionAlreadyReplied" errors
10. Logs show successful API call with x-ingest-secret header

---

**Last Updated**: Current session
**Status**: Implementation complete, awaiting deployment verification
