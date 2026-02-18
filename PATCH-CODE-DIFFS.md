# CODE CHANGES - DIFF SUMMARY

## File 1: `src/lib/discord/grades.ts` (NEW FILE)

```typescript
/**
 * Discord Grades/Ranks Utility
 * 
 * Manages the 15 managed Discord rank roles.
 * Each member has AT MOST 1 grade role.
 * "Recruteur" is NOT a grade, it's just an access role.
 */

// ==================== CONSTANTS ====================

/**
 * The 15 managed grade role IDs (ordered by rank)
 * Index 0 = highest rank (Général)
 * Index 14 = lowest rank (Réserviste)
 */
export const GRADE_ROLE_IDS = [
  "1312845999739375710", // 0: Général
  "1312845999366209686", // 1: Consejero
  "1312845999366209685", // 2: Comandante
  "1312845999366209684", // 3: Coronel
  "1408485173527445627", // 4: Mayor
  "1312845999366209681", // 5: Capitan
  "1312845999366209680", // 6: Teniente
  "1312845999366209679", // 7: Subteniente
  "1312845999366209678", // 8: Veterano
  "1312845999366209677", // 9: Caporal
  "1312845999340781649", // 10: Asesino
  "1312845999340781648", // 11: Guardia
  "1312845999340781647", // 12: Soldato
  "1408492476351778836", // 13: Novato
  "1312845999366209682", // 14: Réserviste
] as const;

// See full content in the file
```

**Key Functions Added**:
- `pickGradeFromRoleIds(roleIds)` - Returns first matching grade
- `isValidDiscordId(str)` - Validates Discord ID format
- `getGradeLabel(roleId)` - Get label for role ID
- `isGradeRole(roleId)` - Check if ID is a grade role
- `getAllGradeRoleIds()` - Get all 15 grade role IDs

---

## File 2: `app/api/discord/member/[discordId]/route.ts` (NEW FILE)

```typescript
/**
 * GET /api/discord/member/[discordId]
 * 
 * Fetch Discord member info including roles, guild membership, and resolved grade.
 * Used to refresh member status and check if they're truly in the server.
 * 
 * Returns:
 * {
 *   ok: boolean,
 *   discordId: string,
 *   inGuild: boolean,
 *   roleIds: string[],
 *   gradeLabel: string | null,
 *   gradeRoleId: string | null,
 * }
 */

import { NextRequest, NextResponse } from "next/server";
import { getDiscordRolesForUserWithStatus } from "@/lib/discord-roles";
import { pickGradeFromRoleIds } from "@/lib/discord/grades";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ discordId: string }> }
) {
  try {
    const { discordId } = await params;

    // Validate Discord ID (17-20 digits)
    if (!discordId || !/^\d{17,20}$/.test(discordId.trim())) {
      return NextResponse.json(
        { ok: false, error: "Invalid Discord ID format" },
        { status: 400 }
      );
    }

    // Fetch roles via REST API (not cache)
    const rolesResult = await getDiscordRolesForUserWithStatus(discordId.trim());
    const roles = rolesResult.roles || [];

    // Determine if user is in guild
    const inGuild = roles.length > 0 || (rolesResult.error !== "UNAVAILABLE" && rolesResult.error !== "CONFIG_MISSING");

    // Resolve grade from roles
    const gradeResult = pickGradeFromRoleIds(roles);

    return NextResponse.json({
      ok: true,
      discordId,
      inGuild,
      roleIds: roles,
      gradeLabel: gradeResult.label,
      gradeRoleId: gradeResult.id,
    });
  } catch (err) {
    console.error("[discord-member-api] Error:", err);
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
```

---

## File 3: `app/api/admin/repair-members/route.ts` (NEW FILE)

```typescript
/**
 * POST /api/admin/repair-members
 * 
 * Admin endpoint to:
 * 1. Detect duplicate members (same steamId or discordId)
 * 2. Merge duplicates (keep newer, consolidate non-null fields )
 * 3. Mark members as inactive if they're ghosted (BANKLOG_GHOST source)
 * 4. Return detailed repair report
 * 
 * Authentication: requires ADMIN_FULL permission
 */

import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

export async function POST(req: NextRequest) {
  // Check authentication
  const session = await getSession();
  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Check permission
  const guard = await requirePermission("ADMIN_FULL");
  if (guard instanceof Response) {
    return guard;
  }

  try {
    const { familyId = "esperados", dryRun = true } = await req.json();

    // Get all members
    const allMembers = await prisma.member.findMany({
      where: { familyId },
      orderBy: { updatedAt: "desc" },
    });

    // Detect duplicates by steamId and discordId
    const steamIdMap = new Map<string, string[]>();
    const discordIdMap = new Map<string, string[]>();

    for (const member of allMembers) {
      if (member.steamId) {
        const ids = steamIdMap.get(member.steamId) ?? [];
        ids.push(member.id);
        steamIdMap.set(member.steamId, ids);
      }
      if (member.discordId) {
        const ids = discordIdMap.get(member.discordId) ?? [];
        ids.push(member.id);
        discordIdMap.set(member.discordId, ids);
      }
    }

    // Plan and execute repairs...
    // (See full content in the file)
    
    return NextResponse.json({
      ok: true,
      dryRun,
      repairsExecuted: repairs.length,
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown error" },
      { status: 500 }
    );
  }
}
```

---

## File 4: `app/staff/members/members-list-client.tsx` (MODIFIED)

### Change 1: Add showInactive state

```typescript
// BEFORE:
const [search, setSearch] = useState("");
const [sortBy, setSortBy] = useState<"name" | "grade">("grade");
const [syncing, setSyncing] = useState(false);

// AFTER:
const [search, setSearch] = useState("");
const [sortBy, setSortBy] = useState<"name" | "grade">("grade");
const [showInactive, setShowInactive] = useState(false);
const [syncing, setSyncing] = useState(false);
```

### Change 2: Update filtered useMemo

```typescript
// BEFORE:
const filtered = useMemo(() => {
  const term = search.trim().toLowerCase();
  const base = term
    ? members.filter((m) =>
        [m.rpName, m.discordId, m.steamId]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(term))
      )
    : members;

  return [...base].sort((a, b) => {
    // ... sorting logic
  });
}, [members, search, sortBy]);

// AFTER:
const filtered = useMemo(() => {
  const term = search.trim().toLowerCase();
  const base = term
    ? members.filter((m) =>
        [m.rpName, m.discordId, m.steamId]
          .filter(Boolean)
          .some((field) => field!.toLowerCase().includes(term))
      )
    : members;

  // Filter by active status
  const byStatus = showInactive ? base : base.filter((m) => m.isActive);

  return [...byStatus].sort((a, b) => {
    // ... sorting logic
  });
}, [members, search, sortBy, showInactive]);
```

### Change 3: Add toggle checkbox in filter section

```typescript
// ADDED in Search & Filter Section:
<label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap cursor-pointer">
  <input
    type="checkbox"
    checked={showInactive}
    onChange={(e) => setShowInactive(e.target.checked)}
    className="w-4 h-4"
  />
  Afficher inactifs
</label>
```

---

## File 5: `app/api/debug/session/route.ts` (MODIFIED)

### Change: Ensure legacyFlags always defined

```typescript
// BEFORE:
const sessionData = session ? {
  authenticated: true,
  userId: (session as any).userId ?? session.user?.id ?? null,
  discordId: (session as any).discordId ?? (session.user as any)?.discordId ?? null,
  email: session.user?.email ?? null,
  name: session.user?.name ?? null,
  legacyFlags: {
    isStaff: (session as any).isStaff ?? false,
    isChef: (session as any).isChef ?? false,
  },
  roles: (session as any).roles ?? [],
  permissions: (session as any).permissions ?? [],
  staffRole: (session as any).staffRole ?? null,
  sessionKeys: Object.keys(session),
  userKeys: session.user ? Object.keys(session.user) : [],
} : {
  authenticated: false,
};

// AFTER:
const sessionData = session ? {
  authenticated: true,
  userId: (session as any).userId ?? session.user?.id ?? null,
  discordId: (session as any).discordId ?? (session.user as any)?.discordId ?? null,
  email: session.user?.email ?? null,
  name: session.user?.name ?? null,
  legacyFlags: {
    isStaff: (session as any).isStaff ?? false,
    isChef: (session as any).isChef ?? false,
  },
  roles: (session as any).roles ?? [],
  permissions: (session as any).permissions ?? [],
  staffRole: (session as any).staffRole ?? null,
  sessionKeys: Object.keys(session),
  userKeys: session.user ? Object.keys(session.user) : [],
} : {
  authenticated: false,
  legacyFlags: {
    isStaff: false,
    isChef: false,
  },
};
```

The else branch now always includes `legacyFlags`, fixing "possibly 'undefined'" TS error.

---

## SUMMARY OF CHANGES

| File | Type | Changes |
|------|------|---------|
| `src/lib/discord/grades.ts` | NEW | 15 grade role IDs + utility functions |
| `app/api/discord/member/[discordId]/route.ts` | NEW | REST endpoint for live member status |
| `app/api/admin/repair-members/route.ts` | NEW | Detect & merge duplicate members |
| `app/staff/members/members-list-client.tsx` | MODIFIED | Add filter toggle + state |
| `app/api/debug/session/route.ts` | MODIFIED | Fix TS legacyFlags undefined |

---

## BUILD STATUS

✅ **Successful**
- No TypeScript errors
- No ESLint warnings
- All routes registered
- Ready for deployment

---

Generated: February 7, 2026
