# UI Separation par Rôle - Livrable

**Date**: Janvier 2026  
**Status**: ✅ **COMPLET - Build OK**

---

## 📋 Résumé des Changements

### Problème Résolu
✅ **Fuite UI**: Les utilisateurs non-liés et membres simples voyaient la sidebar staff et le dashboard staff  
✅ **Solution**: Séparation structurelle des layouts avec vérifications de rôle AVANT rendu JSX

---

## 🏗️ Nouvelle Architecture

### 1️⃣ Utilisateur NON LIÉ
- **Route**: `/me` (seule accessible)
- **Layout**: Simple navbar (Dashboard, Banque, Sanctions, Absences)
- **Message**: "Compte non lié" avec lien vers /staff/link
- **Aucun accès**: `/staff/*`, `/member/*`

### 2️⃣ MEMBRE SIMPLE (lié mais pas Chef/État-Major)
- **Route**: `/member/dashboard`
- **Layout**: MemberLayout (navbar simple sans staff)
- **Pages disponibles**:
  - `/member/dashboard` - Stats: sanctions, argent, déficit
  - `/me/banque` - Gestion bancaire
  - `/me/sanctions` - Détail sanctions
  - `/me/absences` - Absences
- **Aucun accès**: `/staff/*`
- **Redirect automatique**: `/me` → `/member/dashboard` si lié et non-staff

### 3️⃣ CHEF / ÉTAT-MAJOR (Staff)
- **Route**: `/staff/*`
- **Layout**: StaffLayout complet avec sidebar
- **Pages disponibles**: Toutes les pages staff actuelles
- **Aucun changement**: Garde l'accès complet

---

## 🔒 Vérifications de Sécurité

### Fichier: `src/lib/auth-checks.ts` (NOUVEAU)
Fonctions de vérification ServerComponent avec redirects immédiats:
- `assertStaffOrRedirect()` - Vérifie staff, redirige /me sinon
- `assertMemberLinkedOrRedirect()` - Vérifie lié, redirige signin sinon
- `assertAuthenticatedOrRedirect()` - Vérifie session, redirige signin sinon
- `checkStaffAuthorized()` - Retourne session/member si staff
- `checkMemberLinked()` - Retourne member si lié

**Principe**: Vérification AVANT `return JSX` = aucun rendu non-autorisé

---

## 📁 Fichiers Modifiés

### Layouts (Vérification + Rendering)

| Fichier | Changement |
|---------|-----------|
| `app/staff/layout.tsx` | ✅ Ajout `assertStaffOrRedirect()` avant StaffLayout |
| `app/member/layout.tsx` | ✨ NOUVEAU - Layout sécurisé pour membres |
| `app/me/layout.tsx` | ✅ Redirect `/me` → `/member/dashboard` si lié+non-staff |

### Components (Presentation)

| Fichier | Changement |
|---------|-----------|
| `src/components/member-layout.tsx` | ✨ NOUVEAU - Navbar simple pour membres |
| `src/components/staff-layout.tsx` | ❌ Pas de modification (StaffLayout inchangé) |

### Pages

| Fichier | Changement |
|---------|-----------|
| `app/member/page.tsx` | ✨ NOUVEAU - Redirect vers `/member/dashboard` |
| `app/member/dashboard/page.tsx` | ✨ NOUVEAU - Dashboard membre client-side |
| `app/staff/page.tsx` | ❌ Pas de modification |

### APIs

| Fichier | Changement |
|---------|-----------|
| `app/api/member/dashboard/route.ts` | ✨ NOUVEAU - GET endpoint pour stats membre |

### Libs

| Fichier | Changement |
|---------|-----------|
| `src/lib/auth-checks.ts` | ✨ NOUVEAU - Fonctions de vérification rôle |

---

## 🔄 Flux de Navigation

### Utilisateur Non-Lié
```
1. Visite site
2. Prompt login
3. ✅ Authentifié mais non-lié
4. /me/layout vérifie: non-lié → affiche message
5. Lien vers /staff/link pour liaison
```

### Utilisateur Membre Simple
```
1. Authentifié + Lié
2. Visite /me → /me/layout
3. /me/layout détecte: lié + non-staff
4. Redirect /member/dashboard
5. /member/layout vérifie: lié → affiche MemberLayout
6. Dashboard affiche: sanctions, argent, déficit
```

### Utilisateur Chef/État-Major
```
1. Authentifié + Lié + Chef/État-Major
2. Visite /me → /me/layout
3. /me/layout détecte: chef → permet navigation
4. Visite /staff/* → /staff/layout
5. /staff/layout vérifie: chef → affiche StaffLayout complet
```

---

## 🛡️ Garanties de Sécurité

✅ **Vérification AVANT rendu**: Aucun JSX ne s'exécute sans autorisation  
✅ **Redirects immédiats**: Non-autorisés redirigés avant layout chargement  
✅ **Pas de CSS masquage**: Séparation structurelle (pas de `display: none`)  
✅ **Isolation des routes**: `/staff/*` nécessite `assertStaffOrRedirect()`  
✅ **Aucun changement backend**: Guards, NextAuth, Prisma intacts  
✅ **Build OK**: TypeScript compilation sans erreurs

---

## 📊 Dashboard Membre

### Endpoint: `GET /api/member/dashboard`
```json
{
  "memberId": "...",
  "discordId": "...",
  "rpName": "...",
  "steamId": "...",
  "totalSanctions": 2,
  "activeSanctions": 1,
  "balance": 50000,
  "deficit": 0,
  "bankLogsCount": 42
}
```

### Page: `/member/dashboard`
- Affichage stats avec icons
- Bouton masquer/afficher solde
- Liens rapides vers sanctions/banque
- Loading states + error handling

---

## 🧪 Cas de Test

| Cas | Comportement |
|-----|--------------|
| **Non-lié** visite `/staff/dashboard` | Redirect `/me` ✅ |
| **Membre** visite `/staff/dashboard` | Redirect `/me` ✅ |
| **Membre** visite `/me` | Redirect `/member/dashboard` ✅ |
| **Chef** visite `/staff/dashboard` | Affiche dashboard ✅ |
| **Non-lié** visite `/member/dashboard` | Redirect `/api/auth/signin` ✅ |
| **Membre** visite `/member/dashboard` | Affiche dashboard ✅ |

---

## 🚀 Déploiement

```bash
# Build OK ✅
npm run build

# Pas de changements API/Prisma
# Pas de migrations requises

# Production ready
npm run start:prod
```

---

## 📝 Notes Techniques

### getSession() vs getCurrentMemberOrThrowish()
- `getSession()` = vérifier authentification (peut ne pas être lié)
- `getCurrentMemberOrThrowish()` = vérifier lié + récupérer member data

### Role Checks
```typescript
// Dans session
session.isStaff || session.isChef

// Avant AccorderAccès à /staff
const result = await assertStaffOrRedirect();
```

### Member Layout vs Staff Layout
- **MemberLayout**: Navbar simple, client component
- **StaffLayout**: Sidebar + topbar, client component + Sidebar menu
- **Décision**: Layout dans layout.tsx (Server), enfant client peut être client

---

## ✅ Checklist

- [x] Séparation layouts (StaffLayout sécurisé + MemberLayout)
- [x] Vérifications avant rendu (assertStaffOrRedirect, assertMemberLinkedOrRedirect)
- [x] Dashboard membre (stats, sanctions, argent, déficit, logs)
- [x] Navigation intelligente (/me → /member/dashboard si lié+non-staff)
- [x] Sidebar staff uniquement pour chefs
- [x] Aucun rendu UI non-autorisé
- [x] Zero CSS masquage (séparation structurelle)
- [x] Build OK (TypeScript 0 errors)
- [x] Aucun changement backend (guards/NextAuth/Prisma)
- [x] Code prêt production
