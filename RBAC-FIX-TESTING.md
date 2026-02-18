# RBAC Fix - Testing Guide

## Quick Start

### 1. Verify Role Configuration
Visit `/api/debug/rbac` to see current role configuration:

```json
{
  "configStatus": "success",
  "staffRoles": {
    "configured": true,
    "count": 2,
    "roleIds": [
      "1429607761720770623",  // Chef Famille
      "1312845999366209683"   // Haut Gradé (E-M) - THE IMPORTANT ONE
    ],
    "source": "DISCORD_STAFF_ROLE_IDS"
  },
  "hardcodedRoles": {
    "chefFamilleRoleId": "1429607761720770623",
    "etatMajorRoleId": "1312845999366209683",
    "recruteurRoleId": "1312845999215214618"
  },
  "environmentVariables": {
    "discordGuildId": "✓ configured",
    "discordBotToken": "✓ configured",
    "discordStaffRoleIds": "✓ configured (2 IDs)",
    "discordStaffRoleId": "✗ not set (using DISCORD_STAFF_ROLE_IDS instead)"
  }
}
```

**What to check:**
- ✅ `roleIds` includes `1312845999366209683`
- ✅ `discordGuildId`: should say "✓ configured"
- ✅ `discordBotToken`: should say "✓ configured"
- If any show ✗, these need to be configured in `.env.prod`

### 2. Check User's Discord Roles

Visit `/api/debug/session` with the user's account:

```json
{
  "session": {
    "user": {
      "discordId": "123456789",
      "roles": [
        "1312845999366209683",  // ← Should be here!
        "other_role_ids..."
      ]
    }
  }
}
```

**What to check:**
- The user's `discordId` is shown
- Array `roles` includes their Discord role IDs
- Specifically check for `1312845999366209683`

### 3. Test Staff Access

#### For the user with role 1312845999366209683:
1. Go to `/staff/recruitment`
2. Should see content (recruitment list)
3. Should NOT see "Accès refusé"

#### Check browser console (F12 > Console):
With `DEBUG_RBAC=true` in env, logs should show:
```
[guards] requireChefOrEtatMajor RBAC check {
  discordId: "123456789",
  userRoles: ["1312845999366209683", ...],
  totalRequiredRoles: 2,
  ...
}

[guards] requireChefOrEtatMajor ACCESS GRANTED {
  discordId: "123456789",
  grantedVia: "1312845999366209683"
}
```

### 4. Enable Debug Logging

Add to `.env.prod`:
```bash
DEBUG_RBAC=true
DEBUG=*  # or more specific: DEBUG=guards,discord-roles
```

Restart server:
```bash
npm run start:prod
```

### 5. Check Server Logs

Look for lines like:
```
[discord-rbac] RBAC 2 staff role(s) configured: ...0623, 9683 (from DISCORD_STAFF_ROLE_IDS)
[discord-roles] config {
  context: "requireChefOrEtatMajor",
  chefFamilleConfigured: true,
  etatMajorConfigured: true,
  guildConfigured: true,
  botTokenConfigured: true
}
[guards] requireChefOrEtatMajor RBAC check {
  discordId: "123456789",
  userRoleCount: 1,
  userRoles: ["1312845999366209683"],
  hardcodedRolesCount: 2,
  envRolesCount: 2,
  totalRequiredRoles: 2
}
```

## Troubleshooting

### Issue: User still gets "Accès refusé"

**Step 1: Check role in Discord**
- Confirm user has "Haut Gradé (E-M)" role in Discord server
- Get the exact role ID from Discord (right-click role > copy ID)
- Should be `1312845999366209683` or close to it

**Step 2: Check configuration**
- Visit `/api/debug/rbac`
- Confirm the role ID is in the list
- If not, update `.env.prod` with correct ID

**Step 3: Check Discord API connection**
- Visit `/api/debug/rbac`
- Look for `discordBotToken` status
- If ✗, token is not configured
- If ✓ but still failing, token might be invalid

**Step 4: Check user's roles are being fetched**
- Have user visit `/api/debug/session`
- Should see `roles` array with multiple IDs
- If array is empty, Discord API fetch is failing

**Step 5: Clear cache**
Discord role cache TTL is ~2 minutes. To force refresh:
1. User can log out and back in
2. Or restart the server

### Issue: "Missing DISCORD_GUILD_ID - role check will FAIL"

**Fix:**
Set in `.env.prod`:
```bash
DISCORD_GUILD_ID=1312845998753710151
```

### Issue: Missing or invalid DISCORD_BOT_TOKEN

**Fix:**
1. Get bot token from Discord Developer Portal
2. Set in `.env.prod`:
```bash
DISCORD_BOT_TOKEN=your_token_here
```
3. Verify bot has "Read Members" permission in server

### Issue: Role ID format is invalid

Role IDs must be 17-20 digit numbers like `1312845999366209683`

If you see logs like:
```
[discord-rbac] DISCORD_STAFF_ROLE_IDS set but no valid IDs found: "some-invalid-value"
```

Fix by setting correct IDs:
```bash
# Correct format (comma-separated)
DISCORD_STAFF_ROLE_IDS=1429607761720770623,1312845999366209683

# Or single ID (legacy)
DISCORD_STAFF_ROLE_ID=1312845999366209683
```

## Expected Behavior After Fix

### ✅ Should Work
1. User with role `1312845999366209683` can access `/staff/*` routes
2. User gets access to `/staff/recruitment`, `/staff/sanctions`, etc.
3. No "Accès refusé" page
4. Logs show "ACCESS GRANTED"

### ✅ Should Still Work (Backward Compatibility)
1. Users without staff roles still get "Accès refusé"
2. All existing staff guards continue to work
3. Role-based access control is preserved

### ✅ Shouldn't Break
1. Non-staff pages (public access)
2. Member dashboard
3. Other auth flows (not affected by RBAC fix)

## Performance Impact

- **Added:** Minimal debug logging (only when debug enabled)
- **Fixed:** Role lookup no longer skipped during runtime
- **Cache:** Discord role cache still works (2-5 minute TTL)
- **Result:** Better observability, same performance

## Rollback Instructions

If issues arise:

1. Revert the two modified files:
   - `src/lib/discord-roles.ts`
   - `src/lib/guards.ts`

2. Or apply this minimal fix instead:
   - In `src/lib/discord-roles.ts`, line 45: change back to original `isBuildTime` check
   - Remove debug logging additions

3. Rebuild and redeploy:
   ```bash
   npm run build
   npm run start:prod
   ```

## Contact / Support

For further debugging:
- Enable `DEBUG=*` to see all logs
- Check `/api/debug/rbac` endpoint for configuration
- Check server logs for "[discord-rbac]" and "[guards]" messages
- Verify Discord bot permissions and role assignments
