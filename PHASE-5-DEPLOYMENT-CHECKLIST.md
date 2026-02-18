# Phase 5 Deployment Checklist

## Pre-Deployment Verification

### Code Quality
- [x] Build passes: `npm run build` ✅ exit 0
- [x] No TypeScript errors
- [x] All 149 routes prerendered
- [x] No runtime warnings

### Security Tests
- [ ] Non-linked member cannot access `/banque`
- [ ] Non-linked member cannot access `/justificatifs/absence`
- [ ] Non-linked member cannot access `/justificatifs/sanction`
- [ ] Non-linked member can access `/dashboard` (shows message)
- [ ] API `/api/member/*/justify` returns 403 if not linked
- [ ] Staff/Chef roles still work (no RBAC regression)

### User Flow Tests
- [ ] Authenticated non-linked user sees special UI
- [ ] Minimal sidebar shows only Dashboard + Logout
- [ ] Yellow banner explains linking requirement
- [ ] Linked user sees full sidebar (normal experience)

## Deployment Steps

### 1. Code Deployment
```bash
# On production server:
git pull origin main
npm install  # if needed
npm run build
```

### 2. Verify Build
```bash
# Check for errors
npm run build 2>&1 | grep -i error

# Should see: ✓ Compiled successfully
```

### 3. Database Check
```bash
# Verify Member model is migrated
# Discord → Member linking should be working
```

### 4. Runtime Verification
```bash
# Test endpoints:
curl -X GET http://localhost:3000/dashboard  # Should work (redirects to login if needed)
curl -X POST http://localhost:3000/api/member/dashboard  # Should return data or 403

# Check logs for errors (no MEMBER_NOT_LINKED errors expected on startup)
```

## Rollback Plan

If issues occur, rollback is simple - previous code didn't have linking checks on pages:

```bash
git revert <commit-hash>
npm run build
# Restart server
```

## Monitoring

### Key Metrics to Watch
- 403 errors on `/api/member/*` endpoints (expected for non-linked users)
- Redirect logs from `/banque` → `/dashboard` (expected for non-linked)
- User reports of "cannot see Banque/Justificatifs" (expected, send them `/link` command)

### Logging
```
// Look for these in logs (from member layout/pages):
"linkedMember check: member not linked"
"redirect from /banque to /dashboard"
"minimal sidebar rendered"

// These indicate successful protection
```

## Support Response

If users report issues:

**"I can't see Banque/Justificatifs menu"**
→ Response: "Your account isn't linked yet. Use `/link` command on Discord to request linking, then wait for staff to approve."

**"I can't access /banque directly"**
→ Response: "Non-linked members are redirected. Use `/link` command on Discord first."

**"API returns 403 MEMBER_NOT_LINKED"**
→ Response: "Expected if account not linked. Verify member is in database after linking request approval."

## Files Changed Summary

### New Files (3)
- `src/server/auth/member.ts` - Linking helper
- `app/(member)/components/member-sidebar-minimal.tsx` - Minimal UI
- `app/(member)/banque/client.tsx`, `absence/client.tsx`, `sanction/client.tsx` - Client splits

### Modified Files (5)
- `app/(member)/layout.tsx` - Main protection layer
- `app/(member)/banque/page.tsx`, `justificatifs/absence/page.tsx`, `justificatifs/sanction/page.tsx` - Page-level checks
- `app/api/member/*/justify/route.ts` - API updates

### Configuration Required
- None - all env vars already set from Phase 4

## Success Criteria

✅ **After deployment:**
1. Non-linked users see minimal UI (no regression)
2. Non-linked users are redirected from protected pages
3. APIs reject non-linked requests with 403
4. Staff/Chef routes work normally
5. Linked users have full access (no regression)
6. Build time stays ~5 seconds
7. No new errors in logs

## Estimated Impact
- **Performance**: No impact (~5s build time same)
- **Functionality**: Non-linked members partially blocked (as intended)
- **RBAC**: No impact on staff routes
- **APIs**: Slightly slower (1 extra DB query per member API call, but negligible)

## Post-Deployment

### Monitor First Hour
- Check error logs for unexpected 403s
- Verify redirects working
- Monitor CPU/memory (should be unchanged)

### Day 1
- Check for user reports
- Verify staff can still link members
- Confirm no RBAC regressions

### Week 1
- Analyze 403 error rate (should be consistent)
- Verify all non-linked member redirects are working
- No escalations expected

## Quick Test Command

```bash
# On production server, test protection:
curl -b "sessionToken=YOUR_TOKEN" \
  "http://localhost:3000/api/member/dashboard"

# Expected response if linked:
# { ok: true, member: {...}, summary: {...} }

# Expected response if NOT linked:
# { error: "MEMBER_NOT_LINKED" } (403 status)
```

---

**Deployment Date**: _______
**Deployed By**: _______
**Build Commit**: _______
**Notes**: _______
