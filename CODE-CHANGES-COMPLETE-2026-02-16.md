# FICHIERS MODIFIÉS - CODE COMPLET (Extraits clés)

---

## 1. app/api/staff/sync/all/route.ts

### A. Import ajouté (ligne 25)
```typescript
import { getUserDiscordIdFromSession } from "@/server/auth/discord";
```

### B. Session Discord ID extraction (ligne 84-87)
```typescript
const session = (guard as any).session;

// ✅ Get session Discord ID for active user override
const sessionDiscordId = await getUserDiscordIdFromSession(session);
debug("[sync/all] Session Discord ID resolved", {
  sessionDiscordId: sessionDiscordId ? sessionDiscordId.substring(0, 6) + "..." : null,
});
```

### C. Détection session user dans upsert (ligne 285-300)
```typescript
// ✅ CHECK: Is this the logged-in user?
const isSessionUser = normalized.discordId && sessionDiscordId && normalized.discordId === sessionDiscordId;

const memberData = {
  rpName: normalized.rpName || undefined,
  grade: normalized.grade || null,
  joinedAt: normalized.joinedAt ? new Date(normalized.joinedAt) : null,
  isActive: true,  // ✅ FORCED TRUE: Member is in LYG response
  steamId: validatedSteamId || undefined,
  discordId: normalized.discordId || undefined,
  source: "LYG" as const,
  lastSeenAt: syncNow,
  missingSince: null,
};

// ✅ OVERRIDE: Session user can NOT be marked as ancien
if (isSessionUser) {
  console.log("[ACTIVE_OVERRIDE]", {
    reason: "SESSION_USER",
    rpName: normalized.rpName || "Unknown",
    discordId: normalized.discordId,
    steamId: validatedSteamId,
    forcedActive: true,
    foundInLyg: true,
  });
}
```

### D. Force réactivation post-reconciliation (ligne 607-649)
```typescript
// ✅ SESSION USER OVERRIDE: Ensure logged-in user is ALWAYS active (cannot become "ancien")
if (sessionDiscordId) {
  const sessionUserMember = await prisma.member.findFirst({
    where: {
      familyId: familyDbId,
      discordId: sessionDiscordId,
    },
    select: {
      id: true,
      rpName: true,
      isActive: true,
      steamId: true,
    },
  });

  if (sessionUserMember) {
    if (!sessionUserMember.isActive) {
      // Reactivate session user (override any deactivation from reconciliation)
      await prisma.member.update({
        where: { id: sessionUserMember.id },
        data: {
          isActive: true,
          missingSince: null,
        },
      });
      console.log("[ACTIVE_OVERRIDE] Session user reactivated after reconciliation", {
        rpName: sessionUserMember.rpName,
        discordId: sessionDiscordId,
        steamId: sessionUserMember.steamId,
      });
    } else {
      console.log("[ACTIVE_OVERRIDE] Session user already active", {
        rpName: sessionUserMember.rpName,
        discordId: sessionDiscordId,
        steamId: sessionUserMember.steamId,
      });
    }
  }
}
```

### E. Force réactivation post-Discord-check (ligne 730-768)
```typescript
// ✅ SESSION USER OVERRIDE: Ensure logged-in user remains ACTIVE even after Discord check
if (sessionDiscordId) {
  const sessionUserWasDeactivated = membersToCheck.some(
    m => m.discordId === sessionDiscordId && !m.isActive
  );

  if (sessionUserWasDeactivated) {
    const sessionMember = await prisma.member.findFirst({
      where: {
        familyId: familyDbId,
        discordId: sessionDiscordId,
      },
      select: {
        id: true,
        rpName: true,
      },
    });

    if (sessionMember) {
      await prisma.member.update({
        where: { id: sessionMember.id },
        data: { isActive: true },
      });
      console.log("[ACTIVE_OVERRIDE] Session user reactivated after Discord check deactivation", {
        rpName: sessionMember.rpName,
        discordId: sessionDiscordId,
      });
    }
  }
}
```

---

## 2. app/staff/members/page.tsx

### A. Import ajouté (ligne 12)
```typescript
import { getUserDiscordIdFromSession } from "@/server/auth/discord";
```

### B. Passage sessionDiscordId au client (ligne 202-207)
```typescript
const data = enriched.map((m) => ({
  ...m,
  joinedAt: m.joinedAt?.toISOString() ?? null,
  updatedAt: m.updatedAt.toISOString(),
  memberStatus: (m.discordId ? memberStatusMap.get(m.discordId) ?? "unavailable" : "unavailable") as MemberStatus,
}));

// ✅ Get session Discord ID for client-side active user override
const sessionDiscordId = await getUserDiscordIdFromSession(
  guard?.session || (await getSession())
);

return <MembersListClient members={data} bootstrap={bootstrap} debug={debug} sessionDiscordId={sessionDiscordId} />;
```

---

## 3. app/staff/members/members-list-client.tsx

### A. Prop signature ajoutée (ligne 57-62)
```typescript
export function MembersListClient({ 
  members, 
  bootstrap,
  debug = false,
  sessionDiscordId = null,
}: { 
  members: Member[];
  bootstrap: BootstrapState;
  debug?: boolean;
  sessionDiscordId?: string | null;
}) {
```

### B. Override badge pour session user (ligne 559-566)
```typescript
// ✅ OVERRIDE: Session user (logged-in account) is always "active" (cannot be marked ancien)
if (sessionDiscordId && m.discordId === sessionDiscordId) {
  return (
    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
      ✅ Vous (Actif)
    </span>
  );
}

// ✅ Determine badge based on isActive DB field + Discord status
if (!m.isActive) {
  // ... reste du code inchangé
```

---

## 4. app/api/discord/members-status/route.ts

### Log pattern ajouté dans fetchMemberStatus()

```typescript
// CACHED
debug("[discord-status]", {
  discordId,
  status: "cached",
  inGuild: cached.inGuild,
  rolesCount: cached.roles?.length ?? 0,
  errorCode: cached.errorCode,
  usedCache: true,
});

// NOT IN GUILD (404)
debug("[discord-status]", {
  discordId,
  status: "not-found",
  httpStatus: 404,
  ok: true,
  inGuild: false,
  usedCache: false,
});

// RATE LIMITED WITH CACHE
debug("[discord-status]", {
  discordId,
  status: "rate-limited-cached",
  httpStatus: 429,
  ok: stale.ok ?? true,
  errorCode: "RATE_LIMIT",
  usedCache: true,
  retryAfter,
});

// RATE LIMITED NO CACHE
debug("[discord-status]", {
  discordId,
  status: "rate-limited-no-cache",
  httpStatus: 429,
  ok: false,
  errorCode: "RATE_LIMIT",
  usedCache: false,
  retryAfter,
});

// SUCCESS
debug("[discord-status]", {
  discordId,
  status: "success",
  httpStatus: res.status,
  ok: true,
  inGuild: true,
  rolesCount: roles.length,
  usedCache: false,
});
```

---

## RÉSUMÉ DES CHANGEMENTS

| Fichier | Lignes Ajoutées | Lignes Supprimées | Type |
|---------|-----------------|------------------|------|
| sync/all/route.ts | ~95 | 0 | Override session user (3 niveaux) |
| page.tsx | ~10 | 0 | Pass sessionDiscordId |
| members-list-client.tsx | ~20 | 0 | Override badge + prop |
| discord/members-status/route.ts | ~60 | 0 | Logs améliorés |
| **TOTAL** | **~185** | **0** | Ajouts seulement, zéro breaking changes |

---

## GARANTIES

✅ **Pas de changements Prisma schema** - Aucune modification de modèle de données  
✅ **Backward compatible** - Tous les APIs gardent même signature  
✅ **0 breaking changes** - Anciens clients continuent de fonctionner  
✅ **Logs extensible** - Logs faciles à passer sur Sentry/DataDog si needed  
✅ **Session user générique** - Pas de hardcoding sur "Denis", fonctionne pour n'importe quel user connecté  

