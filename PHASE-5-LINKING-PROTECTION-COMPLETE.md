# Phase 5: Member Linking Protection Complete ✅

## Summary

**Security Fix**: Non-linked members (authenticated but not linked to Member in DB) are now completely blocked from accessing member-only content.

**Build Status**: ✅ exit 0 (5.0s compile, 149 routes prerendered)

## Problem Solved

Previously, a user could:
1. Sign in with Discord (authentication) ✅
2. But NOT have a linked Member in DB (linking status) ❌
3. And still access pages like `/banque`, `/justificatifs/absence`, etc. ❌ **SECURITY ISSUE**

Now:
- Non-linked users see a special minimal sidebar with only Dashboard + Logout
- Dashboard shows "Compte non lié" message
- Direct URL access to `/banque`, `/justificatifs/*` redirects to `/dashboard`
- All member APIs return 403 MEMBER_NOT_LINKED

## Architecture

### 1. New Helper: `src/server/auth/member.ts`

```typescript
// Get linked member, returns null if not linked
export async function getLinkedMemberForSession(session) → Member | null

// Require linked member, throws if not linked
export async function requireLinkedMember(session) → Member | throws
```

**Usage Pattern:**
```typescript
const linkedMember = await getLinkedMemberForSession(session);
if (!linkedMember) {
  // Member not linked - redirect, deny access, show message, etc.
}
```

### 2. Layout Protection: `app/(member)/layout.tsx`

Now checks linking status and renders conditional UI:

```typescript
const linkedMember = await getLinkedMemberForSession(session);

if (linkedMember) {
  // Full sidebar with Banque + Justificatifs
  <MemberSidebar />
} else {
  // Minimal sidebar with only Dashboard + Logout
  <MemberSidebarMinimal />
  // + Yellow banner: "Compte non lié. Lance /link sur Discord..."
}
```

### 3. Minimal Sidebar: `app/(member)/components/member-sidebar-minimal.tsx`

For non-linked members:
- Dashboard link only
- Logout button
- Info box: "Lancez /link sur Discord pour lier votre compte"

### 4. Page-Level Protection

All pages now server-side check for linking:

**`/banque`** → redirects to `/dashboard` if not linked
**`/justificatifs/absence`** → redirects to `/dashboard` if not linked
**`/justificatifs/sanction`** → redirects to `/dashboard` if not linked

Implementation:
```typescript
export default async function BankPage() {
  const session = await auth();
  const linkedMember = await getLinkedMemberForSession(session);
  if (!linkedMember) redirect("/dashboard");
  return <BankPageClient />;
}
```

### 5. API Protection

All member APIs now check linking:

**Updated endpoints:**
- `/api/member/dashboard` ✓ (already checked)
- `/api/member/absence/justify` ✓ (now uses getLinkedMemberForSession)
- `/api/member/sanction/justify` ✓ (now uses getLinkedMemberForSession)
- `/api/member/me` ✓ (already checked)

**Response if not linked:**
```json
{
  "error": "MEMBER_NOT_LINKED",
  "status": 403
}
```

## Security Properties

✅ **Authentication vs Linking separation:**
- User can be authenticated (has Discord OAuth session) but NOT linked (no Member in DB)
- Layout/pages/APIs all check linking status independently

✅ **Three-layer defense:**
1. **Layout layer**: Non-linked users see minimal sidebar, no access to Banque/Justificatifs menu
2. **Page layer**: Direct URL access redirects to `/dashboard`
3. **API layer**: API calls return 403 if not linked

✅ **Graceful UX:**
- Non-linked users aren't locked out entirely - they see Dashboard with "Compte non lié" message
- Clear instructions: "Lance /link sur Discord pour demander la liaison"
- Staff RBAC unaffected - staff/chef routes still work as before

✅ **No RBAC regression:**
- Staff/Chef roles still access `/staff/*` normally
- Only member routes are affected
- RBAC checks still work: `role !== "member"` still redirects staff/chef from member routes

## Files Modified

**New Files:**
- `src/server/auth/member.ts` - Linked member helper
- `app/(member)/components/member-sidebar-minimal.tsx` - Minimal sidebar
- `app/(member)/banque/client.tsx` - Client component split
- `app/(member)/justificatifs/absence/client.tsx` - Client component split
- `app/(member)/justificatifs/sanction/client.tsx` - Client component split

**Modified Files:**
- `app/(member)/layout.tsx` - Now checks linking, renders conditional sidebar
- `app/(member)/banque/page.tsx` - Now server-side checks linking
- `app/(member)/justificatifs/absence/page.tsx` - Now server-side checks linking
- `app/(member)/justificatifs/sanction/page.tsx` - Now server-side checks linking
- `app/api/member/absence/justify/route.ts` - Uses new helper
- `app/api/member/sanction/justify/route.ts` - Uses new helper

## Testing Checklist

### Test 1: Non-linked member flow
1. Sign in as Discord user (not linked)
2. Should land on `/dashboard`
3. See: "Compte non lié. Lance /link sur Discord..."
4. Sidebar shows: only Dashboard + Logout
5. Try visiting `/banque` → redirects to `/dashboard`
6. Try visiting `/justificatifs/absence` → redirects to `/dashboard`

### Test 2: Linked member flow
1. Sign in as Discord user (already linked)
2. Should see Dashboard normally
3. Sidebar shows: Dashboard + Banque + Justificatifs
4. Can access `/banque` normally
5. Can access `/justificatifs/absence` normally
6. Can access `/justificatifs/sanction` normally

### Test 3: API protection
```bash
# As non-linked member:
curl POST /api/member/absence/justify -H "Authorization: Bearer ..."
# Response: 403 { error: "MEMBER_NOT_LINKED" }

# As linked member:
curl POST /api/member/absence/justify -H "Authorization: Bearer ..."
# Response: 200 { ok: true }
```

### Test 4: Staff unaffected
1. Sign in as chef/staff
2. Should still access `/staff/dashboard` normally
3. RBAC checks still work
4. No regression

## Database Reference

**Member Model** (Prisma):
```prisma
model Member {
  familyId String
  discordId String?
  // ... other fields
  
  @@unique([familyId, discordId])  ← Compound key for queries
}
```

**Query used:**
```typescript
prisma.member.findUnique({
  where: { familyId_discordId: { familyId: "esperados", discordId } }
})
```

## Future Improvements

- [ ] Add `/link` page for non-linked members (currently just shows message)
- [ ] Add visual indicator on dashboard for linking status
- [ ] Add admin endpoint to manually link members
- [ ] Add linking request tracking in DB
- [ ] Add email notification on successful linking

## Build Info

```
✓ Compiled successfully in 5.0s
✓ Finished TypeScript in 8.5s
✓ Collected page data using 15 workers in 1740.2ms
✓ Generated static pages (149/149) in 351.3ms
```

All routes operational. Phase 5 ready for deployment.

## Quick Reference

### Component Used:
- **Linked member**: `MemberSidebar` (full menu)
- **Non-linked member**: `MemberSidebarMinimal` (dashboard only)

### Key Function:
```typescript
import { getLinkedMemberForSession } from "@/server/auth/member";

const linkedMember = await getLinkedMemberForSession(session);
if (!linkedMember) {
  // User not linked
}
```

### Error Codes:
- **403 MEMBER_NOT_LINKED**: User authenticated but not linked
- Affects: `/api/member/*/justify`, `/api/member/dashboard`

### UI Text:
- **For non-linked**: "Compte non lié. Lance /link sur Discord pour demander la liaison, puis attends la validation des staff."
- Clear call-to-action on every non-linked view
