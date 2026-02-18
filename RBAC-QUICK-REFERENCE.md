# Discord RBAC Staff Roles - Quick Reference

## Configuration

### Environment Variables
```dotenv
# Primary (NEW) - comma-separated role IDs
DISCORD_STAFF_ROLE_IDS=1429607761720770623,1312845999366209683

# Legacy (fallback)
DISCORD_STAFF_ROLE_ID=1429607761720770623
```

## What Changed

### Staff Role Check
**Before**: Only checked `CHEF_FAMILLE_ROLE_ID` hardcoded
```typescript
const hasStaffRole = hasAnyRole(rolesResult.roles, [CHEF_FAMILLE_ROLE_ID, ETAT_MAJOR_ROLE_ID]);
```

**After**: Uses configurable staff roles from environment
```typescript
const staffRoleIds = getStaffRoleIds();
const hasStaffRole = hasAnyRole(rolesResult.roles, staffRoleIds);
```

## How It Works

1. **User has Chef Famille role** → Recognized as staff ✅
2. **User has Etat-Major role** → Recognized as staff ✅
3. **User has EITHER role** → Recognized as staff ✅
4. **User has neither role** → NOT recognized as staff ❌

## Configuration Source Priority

1. `DISCORD_STAFF_ROLE_IDS` env var (comma-separated) → **Use this in production**
2. `DISCORD_STAFF_ROLE_ID` env var (single role) → Legacy fallback
3. Hardcoded defaults → If neither env var set (Chef Famille + Etat-Major)

## Testing

### Check Configuration
```bash
curl http://localhost:3000/api/debug/rbac
```

Expected response:
```json
{
  "ok": true,
  "config": {
    "roleIds": ["1429607761720770623", "1312845999366209683"],
    "source": "DISCORD_STAFF_ROLE_IDS",
    "isConfigured": true
  },
  "userRoles": {
    "all": ["your", "roles"],
    "hasStaffRole": true,
    "matchingStaffRoles": ["1429607761720770623"]
  }
}
```

## Startup Logging

When the application starts, you'll see:
```
[discord-rbac] RBAC 2 staff role(s) configured: ...0623, 9683 (from DISCORD_STAFF_ROLE_IDS)
```

This confirms the staff roles are loaded.

## Important Files

| File | Purpose |
|------|---------|
| `src/lib/discord-rbac.ts` | RBAC config utilities |
| `src/lib/guards.ts` | Staff role check (line 160) |
| `discord-worker/src/ids.ts` | Worker RBAC config |
| `discord-worker/src/commands.ts` | Worker staff checks |
| `auth.ts` | Startup logging |
| `app/api/debug/rbac/route.ts` | Debug endpoint |

## Migration Guide

### For Development
No changes needed - defaults work fine.

### For Production
1. Add to production environment:
   ```bash
   DISCORD_STAFF_ROLE_IDS=1429607761720770623,1312845999366209683
   ```
2. Restart application
3. Verify via `/api/debug/rbac` endpoint

## Status
✅ **Implemented and tested**
✅ **Build passes (0 errors)**
✅ **Backward compatible**
✅ **Production ready**
