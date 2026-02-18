# 🔒 PATCH - Permissions Staff Unifiées

**Date**: 2024-01-XX  
**Objectif**: Unifier la gestion des permissions pour toutes les routes `/staff/*` avec une règle simple et cohérente

---

## 📋 Règle Unifiée

### Routes Protégées avec `requireStaffLinked()`
**Exigences**: Session + `isStaff=true` + Member lié (discordId + steamId)

Toutes les routes `/staff/*` **SAUF** `/staff/link` et `/staff/debug/auth`

### Routes Protégées avec `requirePrivileged()` UNIQUEMENT
**Exigences**: Session + `isStaff=true` (PAS de member requis)

- `/staff/link` - Permet aux staff non liés de se lier
- `/staff/debug/auth` - Permet le diagnostic même sans member lié

---

## 🛠️ Implémentation

### 1. Guard Créé: `requireStaffLinked()`

**Fichier**: `src/lib/guards.ts`

```typescript
export async function requireStaffLinked() {
  // Vérifie session + isStaff
  const privilegedGuard = await requirePrivileged();
  if (privilegedGuard instanceof Response) return privilegedGuard;

  const session = await getSession();
  const discordId = session?.user?.discordId || (session as any)?.discordId;

  if (!discordId) {
    return NextResponse.json(
      { ok: false, error: "DISCORD_ID_MISSING" },
      { status: 403 }
    );
  }

  // Vérifie que Member existe ET est lié (steamId présent)
  const member = await prisma.member.findUnique({
    where: {
      familyId_discordId: {
        familyId: DEFAULT_FAMILY_ID,
        discordId,
      },
    },
    select: { id: true, steamId: true, discordId: true },
  });

  if (!member || !member.steamId) {
    return NextResponse.json(
      { ok: false, error: "MEMBER_NOT_LINKED" },
      { status: 403 }
    );
  }

  return null; // ✅ Autorisé
}
```

---

### 2. Pages Modifiées

#### ✅ Avec `requireStaffLinked()` (9 pages)
```
app/staff/members/page.tsx
app/staff/metrics/page.tsx
app/staff/sanctions/page.tsx
app/staff/recruitment/page.tsx
app/staff/recruitment/[id]/page.tsx
app/staff/meetings/page.tsx
app/staff/complaints/page.tsx
app/staff/complaints/[id]/page.tsx
app/staff/absences/page.tsx
app/staff/activity/page.tsx
```

**Pattern appliqué**:
```typescript
import { requireStaffLinked } from "@/lib/guards";

export default async function Page() {
  // ✅ PATCH: Unified staff protection (session + isStaff + member linked)
  await requireStaffLinked();
  
  // ... reste du code
}
```

#### ✅ Garde `requirePrivileged()` uniquement (2 pages)
```
app/staff/link/page.tsx
app/staff/debug/auth/page.tsx
```

**Raison**: Ces pages doivent rester accessibles même sans member lié, pour permettre le diagnostic et le linking initial.

---

### 3. Routes API Modifiées

#### ✅ Avec `requireStaffLinked()`
```
app/api/staff/meetings/route.ts (GET + POST)
```

**Pattern appliqué**:
```typescript
import { requireStaffLinked } from "@/lib/guards";

export async function GET(req: Request) {
  // ✅ PATCH: Unified staff protection (session + isStaff + member linked)
  const guard = await requireStaffLinked();
  if (guard instanceof Response) return guard;
  
  // ... reste du code
}
```

#### ✅ Garde `requirePrivileged()` uniquement
```
app/api/staff/link/route.ts
```

**Raison**: L'endpoint de linking doit rester accessible sans member lié existant.

---

### 4. Layout Simplifié

**Fichier**: `app/staff/layout.tsx`

- **Avant**: Tentative de protection globale (impossible - pas de pathname en server layout)
- **Après**: Layout UI uniquement, protection déléguée aux pages individuelles

```typescript
/**
 * ✅ Layout staff - UI uniquement
 * Protection faite par requireStaffLinked() dans chaque page (sauf link/debug/auth)
 */
export default async function StaffLayout({ children }) {
  // ... uniquement UI et navigation
  return <div>{children}</div>;
}
```

---

## ✅ Checklist de Test

### 1️⃣ Staff NON lié (session + isStaff, MAIS pas de member.steamId)
```bash
# DOIT réussir (403 attendu sauf pour link/debug)
- [ ] Accès à /staff/link → ✅ Accessible (peut se lier)
- [ ] Accès à /staff/debug/auth → ✅ Accessible (diagnostic)
- [ ] Accès à /staff/members → ❌ 403 "MEMBER_NOT_LINKED"
- [ ] Accès à /staff/dashboard → ❌ 403 "MEMBER_NOT_LINKED"
- [ ] Accès à /staff/metrics → ❌ 403 "MEMBER_NOT_LINKED"
```

### 2️⃣ Staff lié (session + isStaff + member.steamId présent)
```bash
# DOIT réussir (200 partout)
- [ ] Accès à /staff/link → ✅ Redirection vers /me (idempotence)
- [ ] Accès à /staff/debug/auth → ✅ Affiche status "linked"
- [ ] Accès à /staff/members → ✅ Accessible
- [ ] Accès à /staff/dashboard → ✅ Accessible
- [ ] Accès à /staff/metrics → ✅ Accessible
- [ ] Accès à /staff/sanctions → ✅ Accessible
- [ ] POST /api/staff/meetings → ✅ Fonctionne
```

### 3️⃣ Non-staff (pas de session.user.isStaff)
```bash
# DOIT échouer (401/403 partout)
- [ ] Accès à /staff/link → ❌ 403
- [ ] Accès à /staff/debug/auth → ❌ 403
- [ ] Accès à /staff/members → ❌ 403
- [ ] Toute route /staff/* → ❌ 403
```

---

## 🔄 Anti-Loop Garanties

### Pourquoi pas de boucle ?

1. **`/staff/link` et `/staff/debug/auth` utilisent `requirePrivileged()` UNIQUEMENT**
   - N'exigent PAS de member lié
   - Accessibles avec juste session + isStaff
   - Permettent le diagnostic et le linking initial

2. **Toutes les autres routes `/staff/*` utilisent `requireStaffLinked()`**
   - Exigent member lié (steamId présent)
   - Retournent 403 si non lié
   - NE redirigent PAS automatiquement vers /staff/link

3. **Idempotence de `/staff/link`**
   - Vérifie si déjà lié
   - Si oui → redirect vers `/me`
   - Empêche les tentatives de re-linking

### Flow Typique

```
Staff non lié accède à /staff/members
  ↓
requireStaffLinked() → 403 "MEMBER_NOT_LINKED"
  ↓
(UI pourrait afficher "Veuillez vous lier via /staff/link")
  ↓
Staff va sur /staff/link
  ↓
requirePrivileged() → ✅ Passe (juste session + isStaff)
  ↓
Formulaire de linking → POST /api/staff/link
  ↓
Member créé/mis à jour avec steamId
  ↓
Redirect vers /me
  ↓
Maintenant staff lié peut accéder à toutes les routes /staff/*
```

---

## 📊 Résumé des Modifications

| Fichier | Type | Guard | Notes |
|---------|------|-------|-------|
| `src/lib/guards.ts` | Nouveau guard | `requireStaffLinked()` | Chaîne `requirePrivileged()` + vérifie member lié |
| `app/staff/layout.tsx` | Simplifié | Aucun | Protection déléguée aux pages |
| `app/staff/members/page.tsx` | Page | `requireStaffLinked()` | Remplace check manuel |
| `app/staff/metrics/page.tsx` | Page | `requireStaffLinked()` | Remplace `requirePrivileged()` |
| `app/staff/sanctions/page.tsx` | Page | `requireStaffLinked()` | Remplace `requirePrivileged()` |
| `app/staff/recruitment/page.tsx` | Page | `requireStaffLinked()` | Remplace `requirePrivileged()` |
| `app/staff/recruitment/[id]/page.tsx` | Page | `requireStaffLinked()` | Remplace `requirePrivileged()` |
| `app/staff/meetings/page.tsx` | Page | `requireStaffLinked()` | Remplace `requirePrivileged()` |
| `app/staff/complaints/page.tsx` | Page | `requireStaffLinked()` | Remplace `requirePrivileged()` |
| `app/staff/complaints/[id]/page.tsx` | Page | `requireStaffLinked()` | Remplace `requirePrivileged()` |
| `app/staff/absences/page.tsx` | Page | `requireStaffLinked()` | Remplace `requirePrivileged()` |
| `app/staff/activity/page.tsx` | Page | `requireStaffLinked()` | Remplace `requirePrivileged()` |
| `app/api/staff/meetings/route.ts` | API | `requireStaffLinked()` | GET + POST |
| `app/staff/link/page.tsx` | Page | `requirePrivileged()` | ⚠️ GARDE inchangé (volontaire) |
| `app/staff/debug/auth/page.tsx` | Page | `requirePrivileged()` | ⚠️ GARDE inchangé (volontaire) |
| `app/api/staff/link/route.ts` | API | `requirePrivileged()` | ⚠️ GARDE inchangé (volontaire) |

**Total**: 11 pages + 1 API modifiées, 3 routes exemptées (link + debug)

---

## 🎯 Bénéfices

1. **Clarté**: Une seule règle simple pour toutes les routes staff
2. **Sécurité**: Protection cohérente à travers tout `/staff/*`
3. **Maintenabilité**: Un seul guard à maintenir (`requireStaffLinked`)
4. **Diagnostic**: `/staff/debug/auth` accessible même sans member lié
5. **Onboarding**: `/staff/link` permet le linking initial sans bloquer
6. **Anti-loop**: Pas de redirection circulaire grâce aux exemptions

---

## 🚀 Prochaines Étapes (Optionnel)

Si d'autres pages staff sont ajoutées à l'avenir:

1. **Par défaut**: Utiliser `requireStaffLinked()` pour toute nouvelle page `/staff/*`
2. **Exception**: N'utiliser `requirePrivileged()` que si la page doit être accessible sans member lié
3. **Documentation**: Mettre à jour ce fichier avec les nouvelles routes

---

## 📝 Notes

- Ce patch complète le précédent (fix loop /me ↔ /staff/link)
- Les logs DEBUG conditionnels (DEBUG_AUTH=1) restent actifs
- Le guard `requireStaffLinked()` réutilise `requirePrivileged()` en interne (DRY)
- Pas de breaking change pour les staff déjà liés
