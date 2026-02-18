<!-- ✅ MEGA PATCH #3: Linking Flow Test Checklist -->

# MEGA PATCH #3: Comprehensive Test Checklist

## Session 21 Fixes Applied

This patch fixes 4 critical bugs preventing user account linking:

1. ✅ **Debug Endpoint**: Created `/api/debug/link-status` to diagnose Discord ID resolution
2. ✅ **NextAuth OAuth**: Added `trustHost: true` and cookie config for Cloudflare proxy
3. ✅ **Safe Role Mentions**: Created `mentionRole()` helper to prevent "@rôle inconnu" errors
4. ✅ **Worker Auth Errors**: Fixed misleading "INGEST_SECRET not configured" error message
5. ✅ **Caching**: Ensured `/api/me` and `/dashboard` have `force-dynamic` for fresh data

---

## Pre-Deployment Tests

### A) Session → Account → Member Resolution Chain

**Test 1.1: Discord ID Lookup**
```bash
# 1. Login to panel as test user
# 2. Open browser DevTools → Application → Cookies
# 3. Verify `next-auth.session-token` exists
# 4. In DevTools Console:
fetch('/api/debug/link-status').then(r => r.json()).then(console.log)
```
**Expected**:
- `sessionFound: true`
- `userId: <valid-string>`
- `discordId: <valid-snowflake>`

**Test 1.2: Account Lookup**
```bash
# If Test 1.1 passed, check resolution.step2_account
```
**Expected**:
- `step2_account: "✅ Account found: discordId=..."`
- `debug.accountRaw.providerAccountId: <valid-snowflake>`

**Test 1.3: Member Lookup**
```bash
# Check final resolution status
```
**Expected**:
- If NOT linked yet: `step3_member: "❌ No Member record found"`
- If linked: `step3_member: "✅ Member found: ..."`

---

### B) Linking Flow (Complete Workflow)

**Test 2.1: Create Link Request**
- [ ] Go to `/`
- [ ] Click "Lier mon compte"
- [ ] Complete form: Discord username, optional Steam ID
- [ ] Should see "Demande envoyée"
- [ ] Check worker logs: LinkRequest created with `status: PENDING`

**Test 2.2: Accept Link in Discord**
- [ ] Go to Discord channel (check env `DISCORD_CHANNEL_ID`)
- [ ] Find link request embed
- [ ] Click "Accepter" button
- [ ] Should see "Demande acceptée"
- [ ] Worker logs: LinkRequest marked as `ACCEPTED`
- [ ] Panel logs: Member created/updated with `linkVerified: true`

**Test 2.3: UI Reflects Linking Immediately**
- [ ] Open `/dashboard` in new tab (or hard refresh with Ctrl+Shift+R)
- [ ] Should NOT see "Compte non lié" banner anymore
- [ ] Should see member details (RP Name, grade, etc.)
- [ ] If still shows "Compte non lié": Check console for `/api/me` response

**Test 2.4: API Returns Fresh State**
```bash
# After linking, in Console:
fetch('/api/me').then(r => r.json()).then(d => console.log({
  ok: d.ok,
  linked: d.linked,
  discordId: d.discordId,
  memberId: d.member?.id,
  rpName: d.member?.rpName
}))
```
**Expected**:
- `linked: true`
- `member: { id, rpName, discordId, ... }`
- No cache (response headers should have `Cache-Control: no-store, must-revalidate`)

**Test 2.5: Page Reload Shows Linked State**
- [ ] After linking, hard refresh `/dashboard` with Ctrl+Shift+R
- [ ] Should still show member details
- [ ] Should NOT revert to "Compte non lié"

---

### C) NextAuth OAuth (Cloudflare Proxy)

**Test 3.1: Login Flow Behind Proxy**
- [ ] Start panel locally: `npm run dev`
- [ ] Start Cloudflare tunnel: `cloudflared tunnel run`
- [ ] Access via tunnel URL: `https://<name>.trycloudflare.com/login`
- [ ] Click "Login with Discord"
- [ ] Should redirect to Discord OAuth consent
- [ ] Should return to panel without state cookie errors

**Test 3.2: State Cookie Validation**
- [ ] In DevTools → Console, check for errors
- [ ] Should NOT see: "State cookie was missing"
- [ ] Should NOT see: "invalid_grant"

**Test 3.3: Session Persists After OAuth**
```bash
# After successful login:
fetch('/api/auth/session').then(r => r.json()).then(console.log)
```
**Expected**:
- `user: { id, email, image, name }`
- `expires: <future-date>`

---

### D) Safe Role Mentions

**Test 4.1: Contact Form Works**
- [ ] Go to `/contact`
- [ ] Fill form and submit
- [ ] Worker should post embed to Discord
- [ ] Check embed: role mentions should display correctly
- [ ] Should NOT see `@rôle inconnu` or empty mentions

**Test 4.2: Link Request Embed**
- [ ] Create a link request via `/link`
- [ ] Check Discord channel for embed
- [ ] All role mentions should be valid: `@Recruteur`, `@État-major`, `@Chef Famille`

**Test 4.3: Rename Member**
- [ ] If linked, go to `/staff/members` (as staff)
- [ ] Click rename on a member
- [ ] Should succeed without role mention errors in logs

---

### E) Worker Auth Errors

**Test 5.1: INGEST_SECRET vs DISCORD_WORKER_SECRET**
- [ ] Check worker startup logs:
```bash
grep "LOADED\|configured" worker-logs.txt
```
**Expected**:
- One of these should show as loaded: `INGEST_SECRET` or `DISCORD_WORKER_SECRET`
- NOT both missing

**Test 5.2: Rename Auth Error Message**
- [ ] If auth fails, check logs
- [ ] Error should show: `Worker secret not configured (INGEST_SECRET: true/false, DISCORD_WORKER_SECRET: true/false)`
- [ ] NOT generic "INGEST_SECRET not configured"

**Test 5.3: Post Message Auth**
- [ ] Try to post a message from panel to Discord
- [ ] Should NOT see auth errors if INGEST_SECRET OR DISCORD_WORKER_SECRET is set
- [ ] Message should appear in Discord

---

### F) Caching Behavior

**Test 6.1: Cache Headers on /api/me**
```bash
# In DevTools → Network tab, click /api/me request
# Headers → Response Headers should show:
# Cache-Control: no-store, must-revalidate
```

**Test 6.2: Cache Headers on Dashboard**
```bash
# DevTools → Network tab, click document request for /dashboard
# Should have appropriate cache control
```

**Test 6.3: Stale Data Not Served**
- [ ] Link account
- [ ] Immediately visit `/dashboard` without manual refresh
- [ ] Should show linked state (not cached old "not linked" state)

---

### G) Debug Endpoint Usage

**Test 7.1: Verify Resolution Trace**
```bash
# When troubleshooting linking issues, use this endpoint
curl -s -H "Authorization: Bearer <session>" \
  https://panel.local/api/debug/link-status | jq .

# Expected full trace:
{
  "sessionFound": true,
  "userId": "user_xyz",
  "discordId": "123456789012345678",
  "memberFound": true,
  "memberDetails": {
    "familyId": "esperados",
    "discordId": "123456789012345678",
    "linkVerified": true,
    "createdAt": "2024-01-15T10:30:00Z"
  },
  "linkedStatus": true,
  "resolution": {
    "step1_session": "✅ Session found: userId=user_xyz",
    "step2_account": "✅ Account found: discordId=123456789012345678",
    "step3_member": "✅ Member found: familyId=esperados, linkVerified=true"
  }
}
```

---

## Regression Tests (Ensure Nothing Broke)

### R1: Existing Linked Members
- [ ] Login as already-linked member
- [ ] Dashboard loads correctly with member data
- [ ] Staff view shows correct roles

### R2: Member List Sync
- [ ] Run `/api/staff/sync/all`
- [ ] Should NOT show regressions in member count
- [ ] Banklogs sync still works

### R3: Link Request History
- [ ] Check past link requests still marked correctly
- [ ] No data corruption in LinkRequest table

### R4: Error Logging
- [ ] No new error patterns in logs
- [ ] Worker errors show detailed context

---

## Deployment Checklist

- [ ] All 4 fixes compiled successfully (no TS errors)
- [ ] No new console warnings in dev mode
- [ ] Environment variables verified:
  - [ ] `NEXTAUTH_URL` set to deployment URL
  - [ ] `NEXTAUTH_SECRET` configured
  - [ ] `INGEST_SECRET` OR `DISCORD_WORKER_SECRET` loaded in worker
- [ ] Cloudflare tunnel running with correct URL in `NEXTAUTH_URL`
- [ ] Database migrated (if any schema changes)
- [ ] Worker container restarted

---

## Rollback Plan

If issues occur post-deployment:

1. **Revert auth.ts**: Remove `trustHost` config (keep `dynamic="force-dynamic"`)
2. **Revert dashboard**: Keep `dynamic="force-dynamic"` but verify `/api/me` is called
3. **Check logs**: Use debug endpoint `/api/debug/link-status` to trace resolution
4. **Verify DB**: Confirm `linkVerified` and `Member.discordId` are set

---

## Success Criteria

After patches applied and tests pass:

✅ User links account in panel
✅ Discord bot accepts link
✅ User sees linked state in `/dashboard` immediately
✅ No "Compte non lié" banner after acceptance
✅ Role mentions display correctly in embeds
✅ Worker auth errors show correct diagnostics
✅ Behind Cloudflare proxy, OAuth works without state cookie errors

**Session 21 Complete** 🎉
