# Error Codes Reference — /staff/link API

## Authorization Errors (4xx)

### 401 Unauthorized / Missing Authentication Data
```json
{
  "ok": false,
  "error": "Unauthorized"
}
```
**Cause:** User not authenticated (no NextAuth session)  
**Fix:** Redirect to `/api/auth/signin`  
**Page Response:** 401 with redirect

---

### 401 Missing Authentication Data
```json
{
  "ok": false,
  "error": "Missing authentication data"
}
```
**Cause:** Session exists but missing discordId or userId  
**Fix:** Rare edge case; force re-login  
**Page Response:** 401 with redirect to sign-in

---

### 403 Forbidden (No Role)
```json
{
  "ok": false,
  "error": "FORBIDDEN_NO_ROLE"
}
```
**Cause:** User authenticated but lacks Chef Famille OR État-Major role  
**Fix:** Ask admin to assign appropriate Discord role  
**Page Response:** 403 with redirect to `/staff/forbidden`  
**Audit Log:** `ACCESS_DENIED` with reason=`missing_role`

---

### 403 Already Linked
```json
{
  "ok": false,
  "error": "ALREADY_LINKED"
}
```
**Cause:** User is already linked to a Steam account  
**Fix:** User should use `/me` to view/edit their profile  
**Page Response:** 403 with redirect to `/staff`  
**Audit Log:** Not created (pre-checked before access page)

---

### 403 No Discord Account
```json
{
  "ok": false,
  "error": "NO_DISCORD_ACCOUNT"
}
```
**Cause:** User authenticated but no Discord account linked to NextAuth  
**Fix:** User must sign in via Discord, not other providers  
**API Response:** 403  
**Audit Log:** Not created

---

### 403 Self-Linking Forbidden
```json
{
  "ok": false,
  "error": "SELF_LINKING_FORBIDDEN"
}
```
**Cause:** User tried to link their own Discord ID (`targetDiscordId === sessionDiscordId`)  
**Fix:** Cannot link yourself; must link other members only  
**API Response:** 403  
**Audit Log:** Not created, but **WARNING log**: `Self-linking attempt blocked`  
**Severity:** ⚠️ HIGH — Potential abuse attempt

---

### 403 Target Already Linked
```json
{
  "ok": false,
  "error": "TARGET_ALREADY_LINKED"
}
```
**Cause:** The target Discord ID is already linked to a Steam account  
**Fix:** Ask member to use existing account or delete old link first  
**API Response:** 403  
**Audit Log:** Not created

---

## Validation Errors (400)

### 400 Missing Steam ID
```json
{
  "ok": false,
  "error": "MISSING_STEAM_ID"
}
```
**Cause:** `steamId` field is empty or not provided  
**Fix:** Provide a valid SteamID64 (19 digits starting with 7656119)  
**API Response:** 400

---

### 400 Invalid Age
```json
{
  "ok": false,
  "error": "INVALID_AGE"
}
```
**Cause:** `age` field is provided but not an integer  
**Fix:** Provide valid age (e.g., `25`) or omit field  
**API Response:** 400

---

## Other Errors (5xx)

### 500 Database Error
```json
{
  "ok": false,
  "error": "Database error..."
}
```
**Cause:** PostgreSQL error during Member upsert  
**Fix:** Check server logs; may be temporary  
**API Response:** 500  
**Action:** Retry after 1 minute or contact admin

---

### 500 Discord API Error
```
[requireLinkAccess] Failed to fetch member roles from Discord: <error>
```
**Cause:** Discord API unreachable or bot token invalid  
**Fix:** Check DISCORD_BOT_TOKEN and Discord API status  
**Result:** User gets 403 (fails closed)  
**Severity:** ⚠️ HIGH — Cannot verify roles

---

## Success Response

### 200 Success
```json
{
  "ok": true,
  "member": {
    "id": "member-uuid",
    "discordId": "123456789",
    "steamId": "76561198034567890"
  }
}
```
**Page Response:** 
- If Accept: text/html → Redirect to `/staff/dashboard`
- If JSON request → Return JSON with member data

---

## Debug Logging

Enable detailed logs:
```bash
export DEBUG_AUTH=1
npm run dev
```

Then look for `[link]` and `[guard]` entries:

```
[guard] requireLinkAccess: Starting...
[guard] Session discordId: 123456789
[guard] Checking Discord API for Chef role...
[guard] Has Chef role: true
[link:POST] Checking targetDiscordId...
[link:POST] Self-linking check: false (safe)
[link:POST] Successfully linked memberId: abc123
```

---

## Common Issues

### "I get 403 Forbidden but I'm Chef"
1. Check Discord shows you have the Chef Famille role
2. Check role ID in env matches Discord: `CHEF_FAMILLE_ROLE_ID`
3. Check bot can see your roles (member must be in guild)
4. Try logging out and back in (clear session cache)

### "I linked someone but they can't access /staff"
1. They're linked now, but need additional permissions (grades, etc.)
2. Linked users still need to pass `requirePrivileged()` guard
3. Check `/staff/debug/auth` to see their current permissions

### "Self-linking attempt blocked" in logs
1. User tried to link their own Discord ID
2. This is **intentional** and **correct** behavior
3. No action needed unless suspicious pattern

### "Target already linked" but I know they're not
1. Check database: `SELECT * FROM members WHERE discordId = '<target-id>'`
2. If `steamId` is NULL, they're not "linked" for our purposes
3. Must have `steamId` to be considered linked

---

## Rate Limiting

The guard uses **audit logging TTL cache** to prevent spam:
- Same user, same action, same path = only logged once per 60 seconds
- Prevents audit log bloat
- Does NOT rate-limit the actual requests (can still POST multiple times)

To add request rate limiting:
1. Use middleware
2. Check `x-forwarded-for` IP
3. Return 429 Too Many Requests after threshold

---

## Security Notes

- All errors are logged to audit trail
- Self-linking attempts create **WARNING logs** even if rejected
- API always re-verifies authorization (never trust client state)
- Role verification happens via Discord API, not local cache
- Responses include error code but not detailed reason (privacy)

---

**Last Updated:** January 31, 2026
