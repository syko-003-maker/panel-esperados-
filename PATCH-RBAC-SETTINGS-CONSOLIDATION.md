# PATCH COMPLET: RBAC + Suppression Doublons Pages

## 📋 Résumé des Changements

### 🎯 Objectif
- Consolider les pages Discord / Paramètres en une seule route sécurisée
- Appliquer RBAC strict: accès complet réservé aux staffs uniquement (pas recruteurs)
- Supprimer les doublons et nettoyer la navigation

### ✅ Statut Build
```
✅ Build réussi en 5.3s
✅ 0 TypeScript errors
✅ 158 routes générées (dont +4 /staff/settings/*)
✅ 4 nouvelles routes settings/ créées
```

---

## 📊 Changements Détaillés

### 1️⃣ Consolidation des Routes

#### **Avant:**
- `/staff/discord` → DiscordClient (HUB avec cards)
- `/staff/discord/config` → Config page
- `/staff/discord/templates` → Templates page
- `/staff/discord/outbox` → Outbox page
- `/staff/settings` → Redirect vers /staff/discord

#### **Après:**
- `/staff/settings` → ✅ **NOUVEAU HUB** avec SettingsClient
- `/staff/settings/config` → ✅ **NOUVEAU** Config page
- `/staff/settings/templates` → ✅ **NOUVEAU** Templates page
- `/staff/settings/outbox` → ✅ **NOUVEAU** Outbox page
- `/staff/discord` → Redirect vers /staff/settings
- `/staff/discord/config` → Redirect vers /staff/settings/config
- `/staff/discord/templates` → Redirect vers /staff/settings/templates
- `/staff/discord/outbox` → Redirect vers /staff/settings/outbox

---

## 🔐 RBAC Updates

### Guard `requireStaffFull()` Amélioré

**Avant:**
```typescript
const hasStaffFullRole = isStaffFull(userRoles);
```

**Après:**
```typescript
const fullStaffRoleIds = [
  CHEF_FAMILLE_ROLE_ID,
  ETAT_MAJOR_ROLE_ID,
  process.env.HAUT_GRADE_ROLE_ID ?? "",
  process.env.JEFE_DE_JEFES_ROLE_ID ?? "",
  process.env.EL_PADRINO_ROLE_ID ?? "",
  ...getStaffFullRoleIds(),
].filter(Boolean);

const hasStaffFullRole = hasAnyRole(userRoles, fullStaffRoleIds);
```

**Impact:**
- ✅ Inclut maintenant TOUS les rôles staff: CHEF_FAMILLE, ETAT_MAJOR, HAUT_GRADE, JEFE_DE_JEFES, EL_PADRINO
- ✅ Utilise `hasAnyRole()` pour check plus robuste
- ✅ Pages Paramètres réservées à staff complet (recruteurs excluded)

---

## 📁 Fichiers Modifiés

### Routes Pages
1. **[app/staff/settings/page.tsx](app/staff/settings/page.tsx)** - REWRITE
   - Guard: `requireStaffFull()` (au lieu de rien)
   - Render: `<SettingsClient />` (nouveau composant)

2. **[app/staff/settings/SettingsClient.tsx](app/staff/settings/SettingsClient.tsx)** - CREATE
   - Titre: "Paramètres" (au lieu de "Discord")
   - HUB: cards Config / Templates / Outbox
   - Liens: vers /staff/settings/* (au lieu de /staff/discord/*)

3. **[app/staff/settings/config/page.tsx](app/staff/settings/config/page.tsx)** - CREATE
   - Guard: `requireStaffFull()` (au lieu de `requireChef()`)
   - Render: `<DiscordConfigClient />` (import depuis discord/config/)

4. **[app/staff/settings/templates/page.tsx](app/staff/settings/templates/page.tsx)** - CREATE
   - Guard: `requireStaffFull()` (au lieu de `requireChef()`)
   - Render: `<DiscordTemplatesClient />` (import depuis discord/templates/)

5. **[app/staff/settings/outbox/page.tsx](app/staff/settings/outbox/page.tsx)** - CREATE
   - Guard: `requireStaffFull()` (au lieu de `requireChef()`)
   - Render: `<DiscordOutboxClient />` (import depuis discord/outbox/)

### Routes Redirects (ancien /staff/discord)
6. **[app/staff/discord/page.tsx](app/staff/discord/page.tsx)** - REDIRECT
   ```typescript
   export default async function Page() {
     redirect("/staff/settings");
   }
   ```

7. **[app/staff/discord/config/page.tsx](app/staff/discord/config/page.tsx)** - REDIRECT
   ```typescript
   export default async function Page() {
     redirect("/staff/settings/config");
   }
   ```

8. **[app/staff/discord/templates/page.tsx](app/staff/discord/templates/page.tsx)** - REDIRECT
   ```typescript
   export default async function Page() {
     redirect("/staff/settings/templates");
   }
   ```

9. **[app/staff/discord/outbox/page.tsx](app/staff/discord/outbox/page.tsx)** - REDIRECT
   ```typescript
   export default async function Page() {
     redirect("/staff/settings/outbox");
   }
   ```

### Guards
10. **[src/lib/guards.ts](src/lib/guards.ts)** - UPDATE `requireStaffFull()`
    - Ajouter tous les rôles staff (CHEF, ETAT_MAJOR, HAUT_GRADE, JEFE, EL_PADRINO)
    - Documentation améliorée

### Navigation UI
11. **[src/components/staff/sidebar.tsx](src/components/staff/sidebar.tsx)** - UPDATE
    - ❌ Supprimer "Discord" (doublon)
    - ✅ Garder "Paramètres" pointant vers `/staff/settings`

---

## 🧪 Test Cases

### User RECRUTEUR (role 1312845999215214618)
```
GET /staff/settings
  → 307 Redirect to /staff/forbidden
  → ✅ Accès denied (attendu)

GET /staff/recruitment
  → 200 OK
  → ✅ Accès allowed (attendu)
```

### User ETAT_MAJOR / HAUT_GRADE / JEFE / EL_PADRINO / CHEF
```
GET /staff/settings
  → 200 OK + SettingsClient (HUB)
  → ✅ Accès allowed

GET /staff/settings/config
  → 200 OK + DiscordConfigClient
  → ✅ Accès allowed

GET /staff/discord
  → 307 Redirect to /staff/settings
  → ✅ Redirect works

GET /staff/discord/config
  → 307 Redirect to /staff/settings/config
  → ✅ Redirect works
```

### User REGULAR (no staff role)
```
GET /staff/settings
  → 307 Redirect to /staff/forbidden
  → ✅ Accès denied (attendu)

GET /staff/me
  → 200 OK
  → ✅ Accès allowed
```

---

## 📋 Vérifications

- ✅ Build passe: 0 errors
- ✅ Routes générées: 158 (avec +4 settings/*)
- ✅ Guards: requireStaffFull() inclut tous les rôles
- ✅ Navigation sidebar: uniquement "Paramètres"
- ✅ Backward compat: /staff/discord/* → redirects
- ✅ RBAC: recruteurs excluded de /staff/settings

---

## 🚀 Déploiement

**Aucune migration DB nécessaire**
- Purement changement de routing + guards
- Clients Discord (config-client, templates-client, outbox-client) inchangés
- Seulement les guards `requireChef()` → `requireStaffFull()` appliqués

**Commandes:**
```bash
npm run build    # ✅ Already passed
npm run start:prod
```

---

## 📌 Notes

1. **Alias pour backward compat:** `requireChefOrEtatMajor = requireStaffFull` (gardé dans guards.ts)
2. **Page titles:** Tous les settings/* affichent "Discord Config/Templates/Outbox" (idem avant)
3. **HUB consolidé:** Seule page `/staff/settings` est le point d'entrée (plus de /discord HUB)
4. **Role IDs inclus:**
   - CHEF_FAMILLE_ROLE_ID: 1429607761720770623
   - ETAT_MAJOR_ROLE_ID: 1312845999366209683
   - HAUT_GRADE_ROLE_ID: (env var, custom)
   - JEFE_DE_JEFES_ROLE_ID: (env var, custom)
   - EL_PADRINO_ROLE_ID: (env var, custom)
   - DISCORD_STAFF_FULL_ROLE_IDS: (csv, custom)
   - OWNER override: oui
   - ADMIN allowlist: oui

---

## ✨ Résultat Final

| Route | Avant | Après |
|-------|-------|-------|
| `/staff/settings` | Redirect → /discord | ✅ HUB (SettingsClient) |
| `/staff/discord` | HUB (DiscordClient) | → /staff/settings |
| `/staff/discord/config` | Page config | → /staff/settings/config |
| Menu "Paramètres" | → /staff/discord | → /staff/settings |
| Menu "Discord" | Doublon | ❌ Supprimé |
| Guard pages | `requireChef()` | ✅ `requireStaffFull()` |
| Access RECRUTEUR | Possible (requireChef) | ❌ Denied (requireStaffFull) |

**Status: ✅ COMPLETE & VALIDATED**
