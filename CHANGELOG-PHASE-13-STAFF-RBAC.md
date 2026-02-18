# CHANGELOG - Phase 13: Staff RBAC Fix

## Version: Staff Access Control - Fallback Mechanism

**Date**: 2024-12-19  
**Status**: ✅ COMPLETE & TESTED  
**Build**: Exit 0, 0 TypeScript errors

### What Changed

#### 1. **Root Cause Fixed**: Dual RBAC Mechanisms Now Synchronized

**Problem**: 
- Users with Discord CHEF_FAMILLE_ROLE couldn't access /staff/* routes
- System showed "Accès refusé" instead of granting access
- Two competing authentication paths (hardcoded allowlist vs Discord API) were misaligned

**Solution**:
- `getUserRole()` now checks hardcoded allowlist FIRST (fast)
- If not in allowlist, falls back to Discord API verification (robust)
- Users can now access staff routes via either method

#### 2. **src/server/auth/rbac.ts** - Added Fallback Mechanism

**NEW**: `hasChefFamilleRoleDiscord(discordId: string)`
```typescript
async function hasChefFamilleRoleDiscord(discordId: string): Promise<boolean>
```
- Verifies CHEF_FAMILLE_ROLE_ID via Discord API
- Used as fallback when user not in hardcoded allowlist
- Returns true/false based on Discord guild membership

**MODIFIED**: `getUserRole(session: any)`
- Step 1: Check CHEF_DISCORD_IDS allowlist → fast path
- Step 2: Check STAFF_DISCORD_IDS allowlist → fast path
- Step 3: Call Discord API to verify CHEF_FAMILLE_ROLE_ID → fallback
- Result: "chef", "staff", or "member"

**IMPACT**: 
- Layout decisions now account for dynamic Discord roles
- No more locked-out staff members who have Discord role but missing from allowlist

#### 3. **src/lib/guards.ts** - Enhanced Logging

**ENHANCED**: `hasChefFamilleRole(discordId: string)`

Before:
```typescript
if (!chefFamilleRoleId || !guildId || !botToken) {
  return false;  // Silent failure
}
```

After:
```typescript
if (!chefFamilleRoleId || !guildId || !botToken) {
  console.warn("[guard:hasChefFamilleRole] Missing configuration", {
    hasChefsRoleId: !!chefFamilleRoleId,
    hasGuildId: !!guildId,
    hasBotToken: !!botToken,
    discordId,
  });
  return false;  // Informative error
}
```

**New Logs Added**:
- Configuration validation errors
- Discord API call details (URL, roleId being verified)
- Member roles returned from Discord
- Final decision with reasons

**IMPACT**:
- Administrators can now debug access issues
- Server logs show exactly why user is denied/allowed

#### 4. **app/api/debug/auth-chain/route.ts** - Enhanced Diagnostic Endpoint

**NEW FIELDS**: `GET /api/debug/auth-chain` now returns

```json
{
  "staffConfiguration": {
    "chefFamilleRoleId": "408937062838829056",
    "etatMajorRoleId": "1429607761720770623",
    "ownerDiscordId": "408937062838829056",
    "discordGuildId": "1312845998753710151",
    "discordBotToken": "✅ SET",
    "staffDiscordIds": [...],
    "chefDiscordIds": [...]
  },
  "discordRoleVerification": {
    "attempted": true,
    "success": true,
    "hasMemberInGuild": true,
    "memberRoles": ["408937062838829056", "..."],
    "hasChefFamilleRole": true,
    "hasEtatMajorRole": false
  },
  "conclusion": {
    "authChainOk": true,
    "discordRoleCheckOk": true,
    "canAccessStaff": true,
    "reason": "✅ Has CHEF_FAMILLE_ROLE_ID"
  }
}
```

**IMPACT**:
- Staff members can verify their own access status
- Administrators can diagnose access issues without logs
- Shows exactly which role(s) user has in Discord

### How Staff Access Works Now

```
User accesses /staff/discord
  ↓
app/staff/layout.tsx calls: await getUserRole(session)
  ↓
Case 1: User in CHEF_DISCORD_IDS allowlist
  → Instant grant (1ms) ✅ CHEF role
  
Case 2: User in STAFF_DISCORD_IDS allowlist
  → Instant grant (1ms) ✅ STAFF role
  
Case 3: User NOT in allowlists
  → Discord API check (200-500ms)
  → If has CHEF_FAMILLE_ROLE_ID: Grant ✅ CHEF role
  → If no role: Deny ❌ MEMBER role
  
Case 4: Discord API fails/timeout
  → Graceful fallback to allowlist result
  → No access if both fail
```

### Configuration

**Required Environment Variables** (already present in `.env.prod`):

```env
# Hardcoded allowlists
CHEF_DISCORD_IDS=123456789012345678,987654321098765432,408937062838829056
STAFF_DISCORD_IDS=123456789012345678,987654321098765432

# Discord roles (for fallback verification)
CHEF_FAMILLE_ROLE_ID=408937062838829056
ETAT_MAJOR_ROLE_ID=1429607761720770623

# Discord bot (for Discord API calls)
DISCORD_BOT_TOKEN=xxxxx
DISCORD_GUILD_ID=1312845998753710151
OWNER_DISCORD_ID=408937062838829056
```

### Files Modified

| File | Changes |
|------|---------|
| `src/server/auth/rbac.ts` | Added fallback Discord API check to `getUserRole()`, new `hasChefFamilleRoleDiscord()` |
| `src/lib/guards.ts` | Enhanced logging in `hasChefFamilleRole()` with config/API/result details |
| `app/api/debug/auth-chain/route.ts` | Added Discord role verification, staff config display, detailed conclusion |

### Performance Impact

- **Allowlist path** (fast): ~1ms, checked first
- **Discord API path** (slow): ~200-500ms, only if not in allowlist
- **Result**: Most staff members get instant access, new staff members get access once Discord API call completes
- **Caching**: None currently, but could be added if needed

### Testing Results

✅ **Build Status**:
- Exit code: 0
- TypeScript errors: 0
- Routes prerendered: 150/150 in 410.8ms

✅ **Verified Flows**:
- User in allowlist → instant access ✅
- User with Discord role → API fallback access ✅
- User without either → access denied ✅
- Discord API failure → graceful degradation ✅
- `/api/debug/auth-chain` → full diagnostic info ✅

### Rollback Plan (if needed)

If this causes issues:
1. Revert `src/server/auth/rbac.ts` to remove Discord API fallback
2. Revert `src/lib/guards.ts` to remove detailed logging (optional)
3. Keep `app/api/debug/auth-chain/route.ts` changes (diagnostic only)

### Documentation

- **Full details**: See `STAFF-RBAC-FIX-SUMMARY.md`
- **Debugging guide**: See `/api/debug/auth-chain` response
- **Configuration**: See `.env.prod` CHEF_FAMILLE_ROLE_ID section

### Next Steps (Optional Enhancements)

1. **Cache Discord roles** (30min TTL) to reduce API calls
2. **Automatic allowlist sync** from Discord roles
3. **Admin dashboard** to manage staff without env var restart
4. **Rate limiting** on Discord API calls if many concurrent users

---

**Migration Notes**: 
- ✅ No breaking changes
- ✅ Existing allowlist still works
- ✅ Backward compatible with all existing access
- ✅ Adds robust fallback for dynamic Discord roles

**Production Ready**: YES ✅
