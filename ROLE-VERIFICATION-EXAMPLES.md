# Exemples d'Utilisation des Vérifications de Rôle

---

## 📝 Exemples de Code

### 1. Layout Sécurisé pour Staff

**Fichier**: `app/staff/layout.tsx`

```typescript
import { assertStaffOrRedirect } from "@/lib/auth-checks";
import { StaffLayout } from "@/components/staff-layout";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ✅ Vérification + Redirect AVANT JSX
  // Non-staff est redirigé vers /me IMMÉDIATEMENT
  await assertStaffOrRedirect();

  // Si on arrive ici, user est definitely staff/chef
  return (
    <StaffLayout>
      {children}
    </StaffLayout>
  );
}
```

**Flux**:
- Non-lié visite `/staff/dashboard`
- `assertStaffOrRedirect()` détecte `isStaff === false`
- `redirect("/me")` exécuté
- Aucun JSX de StaffLayout n'est rendu ✅

---

### 2. Layout pour Membres

**Fichier**: `app/member/layout.tsx`

```typescript
import { assertMemberLinkedOrRedirect } from "@/lib/auth-checks";
import { MemberLayout } from "@/components/member-layout";

export default async function Layout({
  children,
}: {
  children: React.ReactNode;
}) {
  // ✅ Vérifier member lié
  await assertMemberLinkedOrRedirect();

  return (
    <MemberLayout>
      {children}
    </MemberLayout>
  );
}
```

**Flux**:
- Non-lié visite `/member/dashboard`
- `assertMemberLinkedOrRedirect()` détecte non-lié
- `redirect("/api/auth/signin")` exécuté
- User doit se connecter d'abord ✅

---

### 3. Navigation Intelligente dans /me

**Fichier**: `app/me/layout.tsx`

```typescript
import { getSession } from "@/auth";
import { getCurrentMemberOrThrowish } from "@/lib/me";
import { redirect } from "next/navigation";

export default async function MeLayout({ children }) {
  // 1️⃣ Vérifier authentification
  const session = await getSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  // 2️⃣ Vérifier si lié
  const current = await getCurrentMemberOrThrowish();
  
  if (current.ok) {
    const isStaff = (session as any).isStaff || (session?.user as any).isStaff;
    const isChef = (session as any).isChef || (session?.user as any).isChef;
    
    // 3️⃣ Si lié ET non-staff = rediriger vers space membre
    if (!isStaff && !isChef) {
      redirect("/member/dashboard");
    }
  }

  // ✅ Non-lié OU (Lié + Staff) = afficher /me layout
  return (
    <div>
      {/* ... navbar ... */}
      {children}
    </div>
  );
}
```

**Flux**:
```
Utilisateur lié + non-staff visite /me
  ↓
getCurrentMemberOrThrowish() retourne { ok: true, member }
  ↓
Détecte: lié + non-staff
  ↓
redirect("/member/dashboard")
  ↓
/member/layout.tsx vérifie: lié ✅
  ↓
MemberLayout rendu ✅
```

---

### 4. API Sécurisée

**Fichier**: `app/api/member/dashboard/route.ts`

```typescript
import { checkMemberLinked } from "@/lib/auth-checks";

export async function GET(req: NextRequest) {
  // ✅ Vérifier member lié
  const memberResult = await checkMemberLinked();
  if (!memberResult) {
    return NextResponse.json(
      { error: "Unauthorized: not linked" },
      { status: 401 }
    );
  }

  // ✅ Member lié trouvé
  const memberId = memberResult.member.id;
  const steamId = memberResult.member.steamId;

  // Récupérer les données
  const sanctions = await prisma.sanction.count({
    where: { memberId },
  });

  return NextResponse.json({
    memberId,
    sanctions,
  });
}
```

**Flux**:
- Client non-lié appelle `GET /api/member/dashboard`
- `checkMemberLinked()` retourne `false`
- API répond `401 Unauthorized` ✅

---

### 5. Page Client qui Récupère Données

**Fichier**: `app/member/dashboard/page.tsx`

```typescript
"use client";

import { useEffect, useState } from "react";

export default function MemberDashboard() {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function fetchStats() {
      try {
        // ✅ Appel API sécurisée
        const res = await fetch("/api/member/dashboard", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`API error: ${res.status}`);
        }
        const data = await res.json();
        setStats(data);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  if (loading) return <div>Chargement...</div>;
  if (error) return <div>Erreur: {error}</div>;

  return (
    <div>
      <h1>Dashboard Membre</h1>
      <p>Sanctions: {stats.totalSanctions}</p>
      <p>Solde: ${stats.balance}</p>
    </div>
  );
}
```

**Flux**:
- Layout vérifie d'abord ✅
- Page rendue SEULEMENT si lié
- API double-vérifie au runtime ✅

---

### 6. Afficher/Masquer Navigation Conditionnellement

**Fichier**: `app/me/layout.tsx` (extrait navbar)

```typescript
const canSeeStaff = Boolean(
  (session as any)?.isStaff ||
    (session as any)?.isChef ||
    (session?.user as any)?.isStaff ||
    (session?.user as any)?.isChef
);

return (
  <nav>
    <Link href="/me">Dashboard</Link>
    <Link href="/me/banque">Banque</Link>
    <Link href="/me/sanctions">Sanctions</Link>
    
    {/* ✅ Afficher lien staff seulement si autorisé */}
    {canSeeStaff && (
      <Link href="/staff/dashboard">Panel Staff</Link>
    )}
  </nav>
);
```

**Key Point**: La navigation affiche le lien si autorisé, mais même sans lien, l'accès `/staff/dashboard` est bloqué au niveau layout ✅

---

## 🎯 Cas d'Usage

### Cas 1: Nouveau Membre Lié
```
1. Visite site → Non-lié
2. Liaison effectuée ✅
3. Session refresh → Nouveau Discord ID en session
4. Visite /me
5. /me/layout: lié + non-staff → redirect /member/dashboard ✅
6. /member/layout: vérification ✅
7. Dashboard affiché
```

### Cas 2: Promotion Chef
```
1. Membre visite /member/dashboard ✅
2. Admin le promeut chef dans DB
3. User logout/login (session refresh)
4. session.isChef = true maintenant
5. Visite /staff/dashboard
6. /staff/layout: isChef ✅
7. StaffLayout affiché ✅
```

### Cas 3: Tentative d'Accès Non-Autorisé
```
1. Membre visite /staff/dashboard directement
2. /staff/layout: await assertStaffOrRedirect()
3. checkStaffAuthorized() → false (isStaff === false)
4. redirect("/me") exécuté IMMÉDIATEMENT
5. HTML /staff/dashboard n'est JAMAIS rendu ✅
```

---

## 💡 Bonnes Pratiques

### ✅ À FAIRE

```typescript
// 1. Vérifier EN SERVER COMPONENT avant JSX
export default async function Layout({ children }) {
  await assertStaffOrRedirect();
  return <StaffLayout>{children}</StaffLayout>;
}

// 2. Utiliser les fonctions d'assertion
const result = await assertMemberLinkedOrRedirect();
// ou
if (!await checkStaffAuthorized()) return error;

// 3. Double-vérifier en API
export async function GET(req) {
  const member = await checkMemberLinked();
  if (!member) return 401;
  // ...
}

// 4. Afficher navigation conditionnelle côté client
{canSeeStaff && <Link href="/staff">Staff</Link>}
```

### ❌ NE PAS FAIRE

```typescript
// 1. Vérifier EN CLIENT COMPONENT
"use client";
export default function Page() {
  useEffect(() => {
    if (!isStaff) redirect("/me"); // ❌ Page rendue d'abord
  }, []);
}

// 2. Utiliser CSS pour masquer
return <div style={{ display: hidden ? "none" : "block" }}>
  {/* ❌ HTML rendu même s'il doit être caché */}
</div>;

// 3. Faire confiance SEULEMENT au frontend
// sans vérifier côté serveur ou API

// 4. Vérifier APRÈS avoir accordé l'accès
async function Layout({ children }) {
  return <StaffLayout>{children}</StaffLayout>;
  // ❌ Vérification jamais exécutée!
  await assertStaffOrRedirect();
}
```

---

## 🔧 Debugging

### Vérifier Session

```typescript
const session = await getSession();
console.log({
  authenticated: !!session?.user,
  isStaff: session?.isStaff,
  isChef: session?.isChef,
  discordId: session?.discordId,
});
```

### Vérifier Member

```typescript
const member = await getCurrentMemberOrThrowish();
console.log({
  linked: member.ok,
  memberId: member.member?.id,
  steamId: member.member?.steamId,
  error: member.error,
});
```

### Vérifier Auth Check

```typescript
const staffCheck = await checkStaffAuthorized();
const memberCheck = await checkMemberLinked();

console.log({
  isStaff: !!staffCheck,
  isLinked: !!memberCheck,
});
```

---

## 📋 Checklist Implémentation

Lors de l'ajout d'une nouvelle route:

- [ ] Route demande-t-elle un rôle spécifique?
- [ ] Layout ajouté? (`app/xxx/layout.tsx`)
- [ ] Vérification ajoutée? (`await assertXxxOrRedirect()`)
- [ ] Redirect cible correct? (`/me`, `/api/auth/signin`, etc.)
- [ ] Page client ou server?
- [ ] API sécurisée? (`checkMemberLinked()` ou equiv)
- [ ] Build OK? (`npm run build`)
- [ ] Tests manuels effectués?
