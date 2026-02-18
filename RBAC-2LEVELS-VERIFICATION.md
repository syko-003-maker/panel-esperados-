# RBAC 2-Level Quick Verification Guide

## 1️⃣ Check Environment Variables

Verify `.env.prod` contains:

```bash
DISCORD_RECRUITER_ROLE_IDS=1312845999215214618
DISCORD_STAFF_FULL_ROLE_IDS=1429607761720770623,1312845999366209683,1312845999739375711,1312845999739375712
```

**Do NOT have:**
- `HAUT_GRADÉ_ROLE_ID` (emoji + space)
- `Jefe De Jefes_ROLE_ID` (spaces)
- `El Padrino_ROLE_ID` (spaces)

## 2️⃣ Check Build Success

```bash
npm run build
```

Look for:
- ✅ `✓ Compiled successfully`
- ✅ `✓ Finished TypeScript`
- ✅ `158/158` routes
- ✅ No errors

## 3️⃣ Check RBAC Initialization

Look at build logs for:
```
[discord-rbac] RECRUITER roles configured: ...8618 (from DISCORD_RECRUITER_ROLE_IDS)
[discord-rbac] STAFF_FULL roles configured: ...0623, ...9683, ...5711, ...5712 (from DISCORD_STAFF_FULL_ROLE_IDS)
```

If you see `from DEFAULTS`, configuration is using hardcoded defaults (check env vars).

## 4️⃣ Test RECRUITER Access

**With user having role `1312845999215214618`:**

1. Navigate to `https://losesperados.xyz/staff/recruitment`
   - ✅ Should see recruitment list
   - ❌ Should NOT see "Accès refusé"

2. Navigate to `https://losesperados.xyz/staff/dashboard`
   - ❌ Should be redirected to `/staff/forbidden`
   - ❌ Should NOT see dashboard content

3. Check sidebar navigation
   - ✅ Should see only "Recrutement" link
   - ❌ Should NOT see Dashboard, Members, etc.

4. Check `/api/me/roles`
   - ✅ `isRecruiter: true`
   - ✅ `isStaffFull: false`
   - ✅ `canAccessRecruitment: true`
   - ❌ `canAccessStaffPanel: false`

## 5️⃣ Test STAFF_FULL Access

**With user having role `1429607761720770623` (Etat Major):**

1. Navigate to `https://losesperados.xyz/staff/dashboard`
   - ✅ Should see dashboard
   - ❌ Should NOT see "Accès refusé"

2. Navigate to `https://losesperados.xyz/staff/members`
   - ✅ Should see members list

3. Navigate to `https://losesperados.xyz/staff/recruitment`
   - ✅ Should see recruitment (STAFF_FULL has recruiter access too)

4. Check sidebar navigation
   - ✅ Should see full menu (Dashboard, Members, Recruitment, etc.)

5. Check `/api/me/roles`
   - ❌ `isRecruiter: false`
   - ✅ `isStaffFull: true`
   - ✅ `canAccessRecruitment: true`
   - ✅ `canAccessStaffPanel: true`

## 6️⃣ Test REGULAR MEMBER

**With user having NO staff roles:**

1. Navigate to `https://losesperados.xyz/staff/dashboard`
   - ❌ Should be redirected to `/staff/forbidden`

2. Navigate to `https://losesperados.xyz/me`
   - ✅ Should see personal dashboard (absences, sanctions, banque)

3. Check sidebar navigation
   - ❌ Should NOT see "Staff Panel" section at all

4. Check `/api/me/roles`
   - ❌ `isRecruiter: false`
   - ❌ `isStaffFull: false`
   - ❌ `canAccessRecruitment: false`
   - ❌ `canAccessStaffPanel: false`

## 7️⃣ Test OWNER/ADMIN

**With user in OWNER_DISCORD_ID or ADMIN_DISCORD_IDS:**

1. Navigate to any `/staff/*` page
   - ✅ Should have access regardless of Discord roles
   - Owner/Admin override system working

## 8️⃣ Debug Endpoint

If something fails, check:

```bash
# See current role configuration
curl https://losesperados.xyz/api/debug/rbac

# See user's session and roles
curl https://losesperados.xyz/api/debug/session
```

## 🎯 Summary

| Check | Expected | Status |
|-------|----------|--------|
| Build compiles | 0 errors | ✅ |
| Env vars present | RECRUITER + STAFF_FULL IDs | ⏳ |
| RECRUITER can access recruitment | 200 OK | ⏳ |
| RECRUITER cannot access dashboard | 307 redirect | ⏳ |
| RECRUITER sees limited sidebar | Only recruitment | ⏳ |
| STAFF_FULL can access everything | 200 OK | ⏳ |
| STAFF_FULL sees full sidebar | All menu items | ⏳ |
| Regular member gets access denied | 307 redirect | ⏳ |
| /api/me/roles works | Returns permissions | ⏳ |

## ❌ Troubleshooting

### Build fails
- Check TypeScript errors: `npm run build 2>&1`
- Verify all imports are correct

### Recruitment role not recognized
- Check env var: `echo $env:DISCORD_RECRUITER_ROLE_IDS`
- Verify role ID is exactly `1312845999215214618` (no spaces)
- Clear cache: Log out and back in

### Dashboard accessible to recruiter
- Check Discord role assignment (user might have multiple roles)
- Verify `requireStaffFull()` is used on dashboard page
- Check `/api/debug/session` to see user's actual roles

### Sidebar not showing correct items
- Check `accessLevel` is passed to StaffLayout
- Verify `app/staff/layout.tsx` calculates it correctly
- Check browser localStorage isn't caching old data

### API returns wrong permissions
- Check `/api/me/roles` imports are correct
- Verify `isRecruiter()` and `isStaffFull()` functions work
- Test with `/api/debug/rbac` first

---

**All checks passed?** → Deploy with confidence ✅
