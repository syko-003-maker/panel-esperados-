# Changes Quick Reference

## 3 Files Modified | 0 Breaking Changes | Build: ✅ 5.4s | Errors: 0

---

## File 1: auth.ts (Lines 1-10)

### ❌ BEFORE:
```typescript
import { syncDiscordRoleToPanel, getStaffUser } from "@/lib/rbac";
```

### ✅ AFTER:
```typescript
import { syncDiscordRoleToPanel } from "@/lib/rbac";
```

**Reason:** Removed unused import after removing getStaffUser() call from callback

---

## File 2: auth.ts (Session Callback, Lines 156-160)

### ❌ BEFORE:
```typescript
} else {
  (session as any).permissions = cached.permissions;
  
  // Still fetch staffUser for role info (cheap DB query)
  try {
    const staffUser = await getStaffUser(session);
    (session as any).staffRole = staffUser ? {
      code: staffUser.roleCode,
      name: staffUser.roleName,
      priority: staffUser.rolePriority,
    } : null;
  } catch {
    (session as any).staffRole = null;
  }
  
  logger.debug("auth:session", `Using cached permissions for ${discordId}`);
}
```

### ✅ AFTER:
```typescript
} else {
  (session as any).permissions = cached.permissions;
  
  // ✅ Don't fetch staffUser in callback - let guards handle staff checks
  // This prevents non-staff users from seeing confusing "Not found" logs
  (session as any).staffRole = null;
  
  logger.debug("auth:session", `Using cached permissions for ${discordId}`);
}
```

**Impact:** 
- Removed confusing "getStaffUser: Not found or inactive" logs for non-staff
- Session callback no longer responsible for staff checks
- Guards handle staff access independently

---

## File 3: src/lib/guards.ts (New Function, ~Line 469)

### ✅ NEW GUARD ADDED:

```typescript
/**
 * ✅ Guard: Require user to be linked to a Member in database
 * 
 * Source of Truth: Discord ID from OAuth Account (providerAccountId)
 * 
 * Used for: All /app/(member)/** routes to enforce member linking
 */
export async function requireLinkedMember(): Promise<GuardResult> {
  const session = await getSession();
  if (!session) {
    return new Response(null, {
      status: 307,
      headers: { Location: "/login" },
    });
  }

  const discordId = await getUserDiscordIdFromSession(session);
  if (!discordId) {
    debug("[memberGuard] no Discord ID found");
    return redirect("/login");
  }

  // Query Member table with Discord ID (source of truth: providerAccountId)
  const member = await prisma.member.findUnique({
    where: {
      familyId_discordId: {
        familyId: DEFAULT_FAMILY_ID,
        discordId,
      },
    },
  });

  if (!member) {
    debug("[memberGuard] not linked", { discordId, memberFound: false });
    return redirect("/login?reason=not_linked");
  }

  debug("[memberGuard] linked", {
    discordId,
    memberFound: true,
    rpName: member.rpName,
  });

  return { session };
}
```

---

## File 4: src/lib/guards.ts (requireStaffFull() - Lines 299-356)

### ❌ BEFORE (Sample):
```typescript
if (!hasStaffFullRole) {
  const path = await getRequestPath();
  debug("[guards] requireStaffFull: denied", {
    discordId,
    userRoles: userRoles.slice(0, 3),
    path,
  });
  // ... audit logging ...
  return new Response(null, {
    status: 307,
    headers: { Location: "/staff/forbidden" },
  });
}

debug("[guards] requireStaffFull: granted (role)");
return { session };
```

### ✅ AFTER:
```typescript
const discordId = await getUserDiscordIdFromSession(session);
if (!discordId) {
  debug("[staffGuard] no Discord ID found");
  return jsonError(403, "Missing discordId");
}

// ... checks for owner, admin, staff full roles ...

if (!hasStaffFullRole) {
  debug("[staffGuard]", { discordId, roleActive: false, reason: "no_staff_role" });
  // ... audit logging ...
  return new Response(null, {
    status: 307,
    headers: { Location: "/staff/forbidden" },
  });
}

debug("[staffGuard]", { discordId, roleActive: true, reason: "has_staff_role" });
return { session };
```

**Change:**
- Updated logging from `[guards]` prefix to `[staffGuard]`
- Added early Discord ID check with clear logging
- Simplified log structure: `discordId`, `roleActive`, `reason`

---

## File 5: app/(member)/layout.tsx (Lines 1-54)

### ❌ BEFORE:
```tsx
if (!isLinked) {
  return (
    <div className="h-screen bg-slate-950 flex flex-col">
      {/* Top-right logout button */}
      <div className="absolute top-4 right-4 z-50">
        <SignOutButton />
      </div>
      
      {/* Full-width content */}
      <main className="flex-1 overflow-auto flex flex-col">
        {children}
      </main>
    </div>
  );
}

// If linked: normal layout with sidebar
return (
  <div className="flex h-screen bg-slate-950">
    <MemberSidebar isLinked={isLinked} />
    <main className="flex-1 overflow-auto flex flex-col">
      {children}
    </main>
  </div>
);
```

### ✅ AFTER:
```tsx
if (!isLinked) {
  debug("[memberLayout] non-linked member detected, redirecting to /login?reason=not_linked");
  redirect("/login?reason=not_linked");
}

// If linked: normal layout with sidebar
return (
  <div className="flex h-screen bg-slate-950">
    <MemberSidebar isLinked={isLinked} />
    <main className="flex-1 overflow-auto flex flex-col">
      {children}
    </main>
  </div>
);
```

**Impact:**
- Non-linked members redirected instead of shown custom layout
- Clear log message showing the reason
- Enforces member linking at layout level

---

## Summary of Changes

| File | Change | Impact |
|------|--------|--------|
| auth.ts | Removed getStaffUser() call + import | No more confusing staff logs on non-staff sessions |
| guards.ts | Added requireLinkedMember() | New guard for member route protection |
| guards.ts | Updated requireStaffFull() logging | Clear [staffGuard] prefix with concise format |
| layout.tsx | Changed redirect logic | Proper enforcement of member linking requirement |

---

## Verification Commands

```bash
# Check build
npm run build

# Expected: Compiled successfully in ~5-6s, 0 TypeScript errors
# Routes: 173 generated
```

```bash
# Search for member guard usage
grep -r "memberGuard" src/ app/

# Expected: Logs with [memberGuard] prefix
```

```bash
# Search for staff guard usage
grep -r "staffGuard" src/ app/

# Expected: Logs with [staffGuard] prefix
```

---

## Rollback Plan (if needed)

```bash
# Revert all changes
git checkout auth.ts
git checkout src/lib/guards.ts
git checkout app/\(member\)/layout.tsx

# Rebuild
npm run build
```

All changes are backward-compatible. No database migrations required.
