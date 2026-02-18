# 🚀 DEPLOYMENT COMMANDS - RBAC 2-Levels Mega Patch

## Pre-Deployment Checklist

### 1. Verify All Changes Are Committed

```bash
# Check git status
git status
# Should be clean or only showing desired changes

# Review changes
git diff HEAD -- .env.prod src/lib/discord-roles.ts src/lib/guards.ts
```

### 2. Verify Build

```bash
# Clean build
rm -r .next out
npm run build

# Expected output:
# ✓ Compiled successfully
# ✓ Finished TypeScript (0 errors)
# ✓ 158/158 routes
```

### 3. Check Environment Variables

```bash
# Verify .env.prod contains new vars
grep -E "DISCORD_RECRUITER_ROLE_IDS|DISCORD_STAFF_FULL_ROLE_IDS" .env.prod

# Should output (exactly):
# DISCORD_RECRUITER_ROLE_IDS=1312845999215214618
# DISCORD_STAFF_FULL_ROLE_IDS=1429607761720770623,1312845999366209683,1312845999739375711,1312845999739375712
```

---

## Deployment Steps

### Step 1: Backup Current State

```bash
# Create backup of current .env.prod
cp .env.prod .env.prod.backup.$(date +%s)

# Tag current commit
git tag -a rbac-2level-deployment-$(date +%Y%m%d) -m "RBAC 2-level deployment"
```

### Step 2: Deploy Application

```bash
# Option A: Using npm scripts
npm run start:prod

# Option B: Using Docker (if applicable)
docker-compose up -d

# Option C: Using Node directly
node .next/standalone/server.js
```

### Step 3: Verify at Runtime

```bash
# Check RBAC logs (in server output)
# Should see:
# [discord-rbac] RECRUITER roles configured: ...8618 (from DISCORD_RECRUITER_ROLE_IDS)
# [discord-rbac] STAFF_FULL roles configured: ...0623, ...9683, ...5711, ...5712 (from DISCORD_STAFF_FULL_ROLE_IDS)

# Test endpoints
curl https://losesperados.xyz/api/me/roles
# Should return JSON with permissions object

curl https://losesperados.xyz/api/debug/rbac
# Should show role configuration
```

### Step 4: Test User Scenarios

```bash
# With authenticated session cookie/token:

# Test 1: RECRUITER account (has role 1312845999215214618)
curl -b "session-cookie" https://losesperados.xyz/api/me/roles
# Expected: isRecruiter=true, isStaffFull=false, canAccessRecruitment=true, canAccessStaffPanel=false

# Test 2: STAFF_FULL account (any of the 4 staff roles)
curl -b "session-cookie" https://losesperados.xyz/api/me/roles
# Expected: isRecruiter=false, isStaffFull=true, canAccessRecruitment=true, canAccessStaffPanel=true

# Test 3: REGULAR account (no staff roles)
curl -b "session-cookie" https://losesperados.xyz/api/me/roles
# Expected: isRecruiter=false, isStaffFull=false, canAccessRecruitment=false, canAccessStaffPanel=false
```

---

## Quick Manual Testing

### Open Browser & Test

1. **Login with RECRUITER account** (Discord role: 1312845999215214618)
   ```
   Navigate: https://losesperados.xyz/staff/recruitment
   Expected: ✅ Page loads successfully
   
   Navigate: https://losesperados.xyz/staff/dashboard
   Expected: ❌ Redirected to /staff/forbidden
   ```

2. **Login with STAFF_FULL account** (Any of the 4 staff roles)
   ```
   Navigate: https://losesperados.xyz/staff/dashboard
   Expected: ✅ Page loads successfully
   
   Navigate: https://losesperados.xyz/staff/recruitment
   Expected: ✅ Page loads successfully
   ```

3. **Check Browser Console** (F12)
   ```
   Enable DEBUG_RBAC in .env.prod for detailed logs
   Should see [guards] messages for each route check
   ```

---

## Rollback Plan (If Needed)

### Immediate Rollback

```bash
# If deployment caused issues, rollback to previous state
git checkout HEAD -- .env.prod src/lib/discord-roles.ts src/lib/guards.ts app/api/me/roles/route.ts app/staff/layout.tsx app/staff/StaffNav.tsx

# Rebuild
npm run build

# Restart
npm run start:prod
```

### Full Rollback (If Committed)

```bash
# Revert commit
git revert HEAD

# Rebuild and restart
npm run build
npm run start:prod
```

### Check Rollback Success

```bash
# Verify old guards are back
grep -E "requireChefOrEtatMajor|requireRecruiterOrAbove" src/lib/guards.ts

# Should see the old versions of these functions
```

---

## Monitoring After Deployment

### Real-Time Logs

```bash
# Watch server output for errors
tail -f logs/application.log | grep -E "error|Error|discord-rbac|guards"

# Or with pm2
pm2 logs app
```

### Key Metrics to Monitor

1. **RBAC Role Parsing**
   ```
   Look for: [discord-rbac] RECRUITER roles configured
   Look for: [discord-rbac] STAFF_FULL roles configured
   Warn if: "No roles configured" appears
   ```

2. **Guard Denials**
   ```
   Monitor: [guards] requireStaffFull: denied
   Monitor: [guards] requireRecruiterOrAbove: denied
   These should only happen for non-staff users
   ```

3. **API Responses**
   ```
   Track: /api/me/roles response times
   Alert if: Consistently > 1000ms
   Expected: < 200ms (cached)
   ```

---

## Rollback Indicators

⚠️ **Deploy if you see:**
- Build: ✓ 0 errors
- Logs: [discord-rbac] messages present
- Tests: All permissions working as expected

❌ **Rollback if you see:**
- Build: TypeScript errors
- Logs: "CONFIG_MISSING" or "UNAVAILABLE" repeatedly
- Tests: Wrong users getting/denied access
- Errors: Route protection not working (users seeing pages they shouldn't)

---

## Post-Deployment Documentation

After successful deployment, create documentation for:

1. **Team Communication**
   ```
   Notify: @ops, @backend
   Message: "RBAC 2-level system deployed successfully"
   Include: Link to MEGA-PATCH-FINAL-SUMMARY.md
   ```

2. **User Communication**
   ```
   For RECRUITER role users:
   "You now have access to the recruitment panel at /staff/recruitment"
   
   For STAFF_FULL role users:
   "No UI changes - full staff access maintained"
   
   For other users:
   "No changes - access remains the same"
   ```

3. **Runbook Update**
   ```
   Document:
   - How to add new recruiter role ID (update DISCORD_RECRUITER_ROLE_IDS)
   - How to add new staff role ID (update DISCORD_STAFF_FULL_ROLE_IDS)
   - How to verify RBAC status (check /api/debug/rbac)
   - How to enable debug logs (set DEBUG_RBAC=true)
   ```

---

## Success Criteria

✅ **Deployment successful if:**

| Criterion | Check |
|-----------|-------|
| Build passes | 0 TypeScript errors |
| RBAC initialized | Logs show role configuration |
| Recruiter access works | Can visit /staff/recruitment |
| Recruiter access blocked | Cannot visit /staff/dashboard |
| Staff access works | Can visit any /staff/* page |
| Regular access blocked | Cannot visit any /staff/* page |
| API responds | /api/me/roles returns permissions |
| UI updates | Sidebar shows correct items per role |
| No errors in logs | No TypeError or permission errors |
| Performance normal | Response times < 500ms |

---

## Emergency Contact

If deployment issues occur:

1. **Check logs first:** Look for [discord-rbac] or [guards] errors
2. **Verify env vars:** Ensure .env.prod has correct role IDs
3. **Test endpoints:** Use curl to check /api/me/roles and /api/debug/rbac
4. **Rollback if needed:** Use rollback commands above
5. **Report issue:** Include logs, error messages, reproduction steps

---

**Deployment prepared on:** February 4, 2026
**Version:** 2.0 - RBAC 2-Levels
**Status:** ✅ READY TO DEPLOY
