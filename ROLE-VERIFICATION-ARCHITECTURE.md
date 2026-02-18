# Architecture de Vérification des Rôles

**Version**: 1.0  
**Last Updated**: Janvier 2026

---

## 📋 Vue d'Ensemble

Le système de séparation par rôle utilise une architecture **ServerComponent-first** avec vérifications immédiates (redirect) AVANT rendu JSX.

```
┌─────────────────────────────────────────────┐
│ User visite /staff/dashboard                │
└──────────────────┬──────────────────────────┘
                   │
                   ▼
┌─────────────────────────────────────────────┐
│ /staff/layout.tsx (Server)                  │
│ ✅ await assertStaffOrRedirect()            │
└──────────────────┬──────────────────────────┘
                   │
      ✗────────────┼────────────✓
      │            │            │
      ▼            ▼            ▼
   Redirect    (never      StaffLayout
   /me         reaches)    ✅ Render
```

---

## 🔐 Fonctions de Vérification

### `assertStaffOrRedirect()` ⭐ PRINCIPALE

```typescript
export async function assertStaffOrRedirect() {
  const result = await checkStaffAuthorized();
  if (!result) {
    redirect("/me"); // Redirect IMMÉDIAT
  }
  return result;
}
```

**Usage**:
```typescript
// Dans app/staff/layout.tsx
export default async function Layout({ children }) {
  await assertStaffOrRedirect(); // Redirect avant JSX
  return <StaffLayout>{children}</StaffLayout>;
}
```

**Conditions requises**:
- ✅ Session authentifiée
- ✅ `session.isStaff === true` OU `session.isChef === true`
- ✅ Member lié (peut récupérer discordId)

**Résultat si ✅**:
```typescript
{
  session: NormalizedSession,
  member: MemberData,
  isChef: boolean
}
```

---

### `assertMemberLinkedOrRedirect()`

```typescript
export async function assertMemberLinkedOrRedirect() {
  const result = await checkMemberLinked();
  if (!result) {
    redirect("/api/auth/signin");
  }
  return result;
}
```

**Usage**: Routes `/member/*` (vérifier linkedmember)

**Conditions requises**:
- ✅ Session authentifiée
- ✅ Member trouvé en DB (familyId + discordId)
- ✅ Member.steamId défini

**Résultat si ✅**: Même que `getCurrentMemberOrThrowish()`

---

### `checkStaffAuthorized()` (Internal)

**Ne pas utiliser directement** (utiliser `assertStaffOrRedirect` à la place)

Retourne `false` si:
- Pas de session
- `isStaff === false` ET `isChef === false`
- Member non-lié

---

### `getCurrentMemberOrThrowish()` (Existing)

**Utilisé par**: auth-checks.ts (interne)

Retourne:
```typescript
{
  ok: true,
  familyId: "esperados",
  discordId: "...",
  member: { id, familyId, steamId, discordId, rpName, age },
  session: NormalizedSession
}
```

OU:

```typescript
{
  ok: false,
  status: 401 | 403,
  error: "Unauthorized" | "Compte non lié. Va dans Liaison."
}
```

---

## 🔄 Session et Rôles

### Session Object Structure

```typescript
// Après NextAuth callback (auth.ts)
{
  userId: "...",
  discordId: "...",
  isStaff: boolean,  // ✅ Exposé ici
  isChef: boolean,   // ✅ Exposé ici
  user: {
    id: "...",
    name: "...",
    email: "...",
    image: "...",
    isStaff: boolean,  // ✅ Dupliqué ici (compatibilité)
    isChef: boolean    // ✅ Dupliqué ici
  }
}
```

### Provenance des Rôles

1. **Base de données** (table `User`): `isStaff`, `isChef`
2. **Allowlist Discord** (env vars):
   - `STAFF_DISCORD_IDS` → `session.isStaff = true`
   - `CHEF_DISCORD_IDS` → `session.isChef = true`
3. **Logique**: `isStaff = (User.isStaff) OR (discordId in STAFF_DISCORD_IDS)`

---

## 🗺️ Routing Map

### Utilisateur Non-Lié
```
/                          → /me
/me                        → /me/layout (non-lié message)
/me/*                      → Affichage simple (pas de sidebar staff)
/staff/*                   → assertStaffOrRedirect() → /me
/member/*                  → assertMemberLinkedOrRedirect() → /signin
```

### Utilisateur Membre Simple (Lié, Non-Staff)
```
/                          → /me
/me                        → /me/layout (redirect → /member/dashboard)
/me/*                      → /me/layout (redirect → /member/dashboard)
/member                    → /member/page.tsx (redirect → /member/dashboard)
/member/dashboard          → ✅ MemberLayout + Dashboard
/staff/*                   → assertStaffOrRedirect() → /me
```

### Utilisateur Chef/État-Major (Lié, Staff)
```
/                          → /me
/me                        → /me/layout (staff voit lien vers /staff)
/me/*                      → Affichage /me pages
/staff                     → /staff/page.tsx (redirect → /staff/dashboard)
/staff/*                   → ✅ StaffLayout + pages
/member/dashboard          → Peut y accéder (mais UI optimisée pour membres)
```

---

## 📊 Decision Tree

```typescript
// Dans /me/layout.tsx
const session = await getSession();

if (!session?.user) {
  // Non-authentifié
  redirect("/api/auth/signin");
}

const memberOrError = await getCurrentMemberOrThrowish();

if (memberOrError.ok) {
  const isStaff = session.isStaff || session.isChef;
  
  if (!isStaff) {
    // ✅ Lié + Non-staff = Memberspace
    redirect("/member/dashboard");
  }
}

// ✅ Non-lié OU (Lié + Staff) = /me layout
return <MeLayout>{children}</MeLayout>;
```

---

## 🔍 Checklist Implémentation

### Layout Sécurisé
- [x] `app/staff/layout.tsx` - `await assertStaffOrRedirect()` avant JSX
- [x] `app/member/layout.tsx` - `await assertMemberLinkedOrRedirect()` avant JSX
- [x] `app/me/layout.tsx` - Détecte rôle, redirect si membre simple

### Vérifications d'Accès
- [x] `/staff/*` nécessite isStaff || isChef
- [x] `/member/*` nécessite lié + non-staff
- [x] `/me` accessible par tous (authentifiés)

### Composants
- [x] `StaffLayout` - Sidebar staff, topbar
- [x] `MemberLayout` - Navbar simple, pas de sidebar
- [x] Pages staff - Pas de modification (layout fait la vérification)
- [x] Pages member - Nouvelles pages isolées

### APIs
- [x] `GET /api/member/dashboard` - Récupère stats
- [x] Vérification `checkMemberLinked()` avant accès

---

## ⚠️ Pièges à Éviter

### ❌ NE PAS FAIRE

```typescript
// Mauvais: Vérifier APRÈS JSX
export default async function Layout({ children }) {
  return (
    <StaffLayout>
      {/* ❌ User non-staff peut voir StaffLayout rendu */}
      {children}
    </StaffLayout>
  );
}
```

```typescript
// Mauvais: Vérifier en Client Component
"use client";
export default function Page() {
  const [session, setSession] = useState(null);
  useEffect(() => {
    // ❌ Page rendue d'abord, puis redirect
    if (!isStaff) redirect("/me");
  }, []);
}
```

```typescript
// Mauvais: CSS masquage
export default async function Layout({ children }) {
  const result = await assertStaffOrRedirect();
  return (
    <div style={{ display: result ? "block" : "none" }}>
      {/* ❌ HTML quand même rendu */}
    </div>
  );
}
```

### ✅ À FAIRE

```typescript
// Bon: Vérifier AVANT JSX
export default async function Layout({ children }) {
  await assertStaffOrRedirect(); // Redirect avant tout rendu
  return <StaffLayout>{children}</StaffLayout>;
}
```

---

## 🧪 Testing

### Test 1: Non-lié visite /staff
```
Expected: Redirect /me
Actual: ✅ assertStaffOrRedirect() → redirect("/me")
```

### Test 2: Membre visite /staff
```
Expected: Redirect /me
Actual: ✅ assertStaffOrRedirect() → redirect("/me")
```

### Test 3: Membre visite /me
```
Expected: Auto-redirect /member/dashboard
Actual: ✅ /me/layout détecte lié+non-staff → redirect("/member/dashboard")
```

### Test 4: Chef visite /staff
```
Expected: Affiche StaffLayout
Actual: ✅ assertStaffOrRedirect() → return result → StaffLayout rendu
```

---

## 📚 Références

- **Session Management**: [auth.ts](auth.ts)
- **Member Loading**: [src/lib/me.ts](src/lib/me.ts)
- **Auth Checks**: [src/lib/auth-checks.ts](src/lib/auth-checks.ts)
- **Staff Layout**: [app/staff/layout.tsx](app/staff/layout.tsx)
- **Member Layout**: [app/member/layout.tsx](app/member/layout.tsx)
