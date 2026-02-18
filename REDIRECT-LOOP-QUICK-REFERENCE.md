# Quick Debug Reference - Infinite Redirect Loop Fix

## The Loop (FIXED)

```
BEFORE:
/dashboard → /login?reason=not_linked → /dashboard?linked=0 → /login → ...♻️

AFTER:
/dashboard → /login?reason=not_linked → [reason check] → <LoginClient /> ✅
```

## Files Changed (3 files)

### 1. app/login/page.tsx (Main Fix)
```typescript
// ✅ KEY LINE: Check for reason parameter
if (reason === 'not_linked') {
  return <LoginClient />;  // Don't redirect!
}
```

**What it fixes:** Prevents `/login` from redirecting back to `/dashboard` when the reason parameter indicates the user needs to complete a link request.

### 2. app/(member)/layout.tsx (Logging)
```typescript
// ✅ Better logging with discordId
debug("[memberLayout] non-linked member detected", { 
  discordId: (session as any).discordId ?? null 
});
```

**What it does:** Helps track why users are being redirected from /dashboard.

### 3. proxy.ts (Public Paths)
```typescript
// ✅ Extended public path exclusions
"/assets", "/images"  // ✅ NEW
"/logo-esperados.svg", "/robots.txt", "/sitemap.xml"  // ✅ NEW
```

**What it does:** Ensures static assets are never redirected/guarded.

---

## How to Test

### Test 1: Non-Linked User (The Main Fix)
```bash
1. Create Discord user not in Member table
2. Log in
3. Go to /dashboard
4. Should redirect to /login?reason=not_linked
5. ✅ Login form displays (NO LOOP!)
6. User can initiate link request
```

### Test 2: Firefox Error Should Be Gone
```
BEFORE: ❌ "La page n'est pas redirigée correctement"
AFTER:  ✅ Smooth redirect to login form
```

### Test 3: Other Flows Unaffected
```
Linked member → /dashboard ✅
Staff member → /staff/dashboard ✅
No session → /login form ✅
```

---

## What Happens Now

| Scenario | Redirect Chain | Result |
|----------|----------------|--------|
| Non-linked user | `/dashboard` → `/login?reason=not_linked` (STOP) | ✅ Form shows |
| Linked member | `/login` → `/dashboard` | ✅ Works |
| Staff user | `/login` → `/staff/dashboard` | ✅ Works |
| No session | `/login` → form | ✅ Works |

---

## Why It Works

The `reason=not_linked` parameter is like a "flag" that tells `/login`:

> "I was redirected here because user is not linked.  
> Don't try to auto-redirect them back to /dashboard.  
> Show the login form so they can complete the link process."

```typescript
if (reason === 'not_linked') {
  // Understood! Showing login form.
  return <LoginClient />;
}
```

Without this check, `/login` would try to send them to `/dashboard`, which would immediately send them back to `/login`, creating the infinite loop.

---

## Build Status

✅ **Build Successful**
- Compiled: 10.3s
- TypeScript: 0 errors
- Routes: 173/173 generated

---

## Deployment

Ready for production. No:
- Database migrations
- Environment changes  
- Breaking changes
- New dependencies

Just... 3 files changed, 1 infinite loop fixed! 🎉
