# Phase 10 — Lock Non-Linked Members (UI + Pages + API)

## Summary
Non-linked users can authenticate and access the dashboard, but are blocked from member-only pages and APIs. The sidebar now renders a minimal menu when the account is not linked, and all justification APIs return a 403 with `code: "MEMBER_NOT_LINKED"`.

## Changes

### ✅ Member scope source of truth
- **File**: src/server/member/scope.ts
- **Behavior**: `getMemberScopeOrNull()` now returns `{ discordId, memberId, rpName, steamId }` or null.
- **Linked check** uses Account.providerAccountId (via existing session lookup).

### ✅ Member pages locked when not linked
- **Files**:
  - app/(member)/banque/page.tsx
  - app/(member)/justificatifs/absence/page.tsx
  - app/(member)/justificatifs/sanction/page.tsx
- **Behavior**: if not linked → redirect `/dashboard`.

### ✅ Sidebar minimal for non-linked
- **File**: app/(member)/layout.tsx + app/(member)/components/member-sidebar.tsx
- **Behavior**: `isLinked` drives menu:
  - Linked → full menu (Dashboard, Banque, Justificatifs)
  - Non-linked → Dashboard + Logout only + /link info box

### ✅ Dashboard UX
- **File**: app/(member)/dashboard/page.tsx
- **Behavior**: If API returns `code: MEMBER_NOT_LINKED`, a warning banner is shown.

### ✅ API protection
- **Files**:
  - app/api/member/dashboard/route.ts
  - app/api/member/absence/justify/route.ts
  - app/api/member/sanction/justify/route.ts
- **Behavior**: if not linked → 403 `{ code: "MEMBER_NOT_LINKED" }`

## Expected Behavior
- Non-linked members can login and see dashboard with warning.
- Direct access to `/banque` or `/justificatifs/*` redirects to `/dashboard`.
- Justification APIs return 403 with `code: MEMBER_NOT_LINKED`.
- Linked members keep full access.

## Build
Run:
```
npm run build
```
