# 🔒 RBAC Staff Fix - Fernando Stats & Link Access

## 📋 Résumé du problème

Fernando est bien lié (discordId présent) mais n'a pas accès à:
- `/staff/stats` (statistiques bancaires)
- `/staff/link` (gestion des liaisons de comptes)

**Cause racine**: 3 systèmes de permissions qui coexistent sans synchronisation:
1. **Env vars allowlist** (`ADMIN_DISCORD_IDS`, `STAFF_DISCORD_IDS`, `CHEF_DISCORD_IDS`)
2. **Discord roles live** (via Discord API: `CHEF_FAMILLE_ROLE_ID`, `ETAT_MAJOR_ROLE_ID`)
3. **RBAC DB** (`StaffUser`, `StaffRole`, `StaffPermission`) - **existe mais non utilisé par ces pages**

---

## ✅ Solution implémentée

### 1️⃣ Endpoints debug créés

**GET /api/me/roles**
- Affiche pour l'utilisateur connecté:
  - `session` (userId, discordId, isStaff, isChef)
  - `discord` (roles Discord live, erreurs)
  - `staffUser` (rôle DB, permissions)
  - `member` (rpName, steamId, grade)
  - `legacyAccess` (flags env vars + Discord roles)
  - `rbacAccess` (flags DB)
  - `permissions` (détail des droits)
  - `diagnosis` (recommandations)

**GET /api/debug/rbac**
- Affiche la config complète du RBAC:
  - `staffRoles` (tous les rôles avec permissions)
  - `permissionsByCategory` (permissions groupées)
  - `staffUsers` (utilisateurs staff avec leurs rôles)
  - `envConfig` (variables d'environnement legacy)
  - `summary` (statistiques)
  - `diagnostic` (état du système + recommandations)

### 2️⃣ NextAuth amélioré

**Fichier**: `auth.ts`

**Changements**:
- ✅ Ajout scope OAuth Discord: `guilds.members.read`
- ✅ Callback session amélioré:
  - Fetch Discord roles à chaque session (cache 10 min)
  - Appel `syncDiscordRoleToPanel()` pour sync auto Discord → DB
  - Exposition dans session: `roles`, `permissions`, `staffRole`
- ✅ Type `NormalizedSession` étendu

**Bénéfices**:
- Les rôles Discord sont maintenant synchronisés automatiquement
- Plus besoin de mappings manuels en DB
- Permissions exposées directement dans la session

### 3️⃣ Permissions ajoutées

**Fichier**: `prisma/seed-rbac.ts`

**Nouvelles permissions**:
```typescript
{ code: "STATS_VIEW", name: "View Statistics", category: "stats" }
{ code: "LINK_MANAGE", name: "Manage Links", category: "members" }
```

**Assignées aux rôles**:
- **CHEF**: `STATS_VIEW`, `LINK_MANAGE`
- **WL1** (Whitelist 1): `STATS_VIEW`, `LINK_MANAGE`
- **WL2** (Whitelist 2): `STATS_VIEW`

**Mise à jour types**:
```typescript
// src/lib/rbac.ts
export type PermissionCode =
  | "TICKETS_VIEW"
  | ...
  | "STATS_VIEW"      // 🆕
  | "LINK_MANAGE"     // 🆕
  | "ADMIN_FULL";
```

### 4️⃣ Pages migrées vers RBAC DB

#### `/staff/stats` (page.tsx)
**AVANT**:
```typescript
import { requireAdmin } from "@/lib/guards";
const guard = await requireAdmin();
```

**APRÈS**:
```typescript
import { requirePermission } from "@/lib/rbac";
const guard = await requirePermission("STATS_VIEW");
```

#### `/api/staff/link` (route.ts)
**AVANT**:
```typescript
import { requireLinkAccess } from "@/lib/guards";
const guard = await requireLinkAccess(); // Vérifie CHEF_FAMILLE_ROLE_ID, ETAT_MAJOR_ROLE_ID
```

**APRÈS**:
```typescript
import { requirePermission } from "@/lib/rbac";
const guard = await requirePermission("LINK_MANAGE");
```

---

## 🚀 Déploiement

### Étape 1: Seed RBAC (créer permissions + rôles)

```bash
npx tsx prisma/seed-rbac.ts
```

**Output attendu**:
```
🔐 Seeding RBAC...

Creating permissions...
  ✓ TICKETS_VIEW
  ✓ SANCTIONS_VIEW
  ✓ STATS_VIEW       # 🆕
  ✓ LINK_MANAGE      # 🆕
  ...

Creating roles...
  ✓ ADMIN (priority: 100)
    → 1 permissions assigned
  ✓ CHEF (priority: 90)
    → 15 permissions assigned
  ...

✅ RBAC seed complete!
   Roles: 6
   Permissions: 26
   Role-Permission mappings: 75
```

### Étape 2: Vérifier la config RBAC

```bash
curl -H "Cookie: next-auth.session-token=..." \
  http://localhost:3000/api/debug/rbac | jq
```

**Vérifier**:
- `staffRoles` contient bien CHEF avec `STATS_VIEW` et `LINK_MANAGE`
- `permissionsByCategory.stats` existe
- `permissionsByCategory.members` contient `LINK_MANAGE`

### Étape 3: Mapper rôles Discord → Rôles DB

**Option A: Automatic sync (recommandé)**

Avec le nouveau callback NextAuth, la sync est automatique:
1. Fernando se connecte avec Discord
2. NextAuth récupère ses rôles Discord
3. `syncDiscordRoleToPanel()` crée/met à jour son `StaffUser` automatiquement

**Prérequis**: Les rôles DB doivent avoir `discordRoleId` mappé:

```sql
-- Mapper CHEF_FAMILLE_ROLE_ID au rôle CHEF
UPDATE "StaffRole"
SET "discordRoleId" = '1429607761720770623'
WHERE "familyId" = 'esperados' AND "code" = 'CHEF';

-- Mapper ETAT_MAJOR_ROLE_ID au rôle CHEF aussi
-- (ou créer un rôle ETAT_MAJOR séparé si besoin)
```

**Option B: Création manuelle (fallback)**

Si Fernando n'a pas les rôles Discord correctement configurés:

```sql
-- Créer StaffUser pour Fernando
INSERT INTO "StaffUser" ("id", "familyId", "discordId", "roleId", "isActive")
VALUES (
  gen_random_uuid(),
  'esperados',
  '123456789012345678',  -- Discord ID de Fernando
  (SELECT id FROM "StaffRole" WHERE "code" = 'CHEF' LIMIT 1),
  true
);
```

### Étape 4: Tester avec Fernando

**1. Se connecter en tant que Fernando**

**2. Vérifier status RBAC**:
```bash
curl -H "Cookie: ..." http://localhost:3000/api/me/roles | jq
```

**Output attendu**:
```json
{
  "ok": true,
  "data": {
    "session": {
      "discordId": "123...",
      "isStaff": true
    },
    "discord": {
      "discordId": "123...",
      "roles": ["1429607761720770623", ...],
      "rolesCount": 5
    },
    "staffUser": {
      "roleCode": "CHEF",
      "roleName": "Chef de Famille",
      "permissions": [
        "TICKETS_VIEW",
        "SANCTIONS_VIEW",
        "STATS_VIEW",      // ✅
        "LINK_MANAGE",     // ✅
        ...
      ]
    },
    "permissions": {
      "canViewTickets": true,
      "canViewSanctions": true,
      "isAdmin": false
    },
    "diagnosis": {
      "hasStaffInDB": true,           // ✅
      "canAccessViaRBAC": true,       // ✅
      "recommendedAction": "OK"       // ✅
    }
  }
}
```

**3. Tester accès aux pages**:
- ✅ `/staff/stats` → Should display
- ✅ `/staff/link` → POST should work

---

## 🔍 Diagnostic en cas de problème

### Problème: Fernando n'apparaît pas dans staffUsers

**Cause**: Discord roles pas synchronisés ou rôle Discord manquant

**Solutions**:
1. Vérifier qu'il a bien le rôle Discord sur le serveur:
   ```bash
   curl -H "Authorization: Bot $BOT_TOKEN" \
     https://discord.com/api/v10/guilds/$GUILD_ID/members/123456789
   ```

2. Forcer la synchronisation:
   - Se déconnecter
   - Se reconnecter avec Discord OAuth
   - Le callback session va créer le StaffUser automatiquement

3. Créer manuellement (Option B ci-dessus)

### Problème: staffUser existe mais permissions vides

**Cause**: Rôle DB pas mappé correctement aux permissions

**Solution**:
```bash
npx tsx prisma/seed-rbac.ts  # Re-run seed
```

### Problème: Discord API unavailable

**Symptôme**: `discord.rolesError` dans /api/me/roles

**Cause**: BOT_TOKEN ou GUILD_ID manquant/invalide

**Solution**:
```bash
# Vérifier .env
grep DISCORD_BOT_TOKEN .env
grep DISCORD_GUILD_ID .env

# Tester Discord API manuellement
curl -H "Authorization: Bot $BOT_TOKEN" \
  https://discord.com/api/v10/guilds/$GUILD_ID
```

### Problème: Session ne contient pas permissions

**Symptôme**: `session.permissions` undefined

**Solution**: Forcer nouveau login (le cache session expire après 10 min)

---

## 📊 Configuration des rôles Discord

**Fichiers concernés**: `.env`, `src/lib/discord-roles.ts`

### Variables d'environnement (LEGACY - à migrer)

```bash
# Legacy allowlists (ne PAS utiliser pour nouveaux utilisateurs)
ADMIN_DISCORD_IDS=123456789,987654321
STAFF_DISCORD_IDS=111222333,444555666
CHEF_DISCORD_IDS=777888999

# Rôles Discord (utilisés pour sync auto)
CHEF_FAMILLE_ROLE_ID=1429607761720770623
ETAT_MAJOR_ROLE_ID=1312845999366209683
RECRUTEUR_ROLE_ID=1312845999215214618

# Nouveaux: liste de rôles staff (CSV)
DISCORD_STAFF_FULL_ROLE_IDS=1429607761720770623,1312845999366209683,1312845999739375711,1312845999739375712
DISCORD_RECRUITER_ROLE_IDS=1312845999215214618
```

### Mapping recommandé Discord → DB

| Rôle Discord (ID) | Nom Discord | Rôle DB | Permissions |
|-------------------|-------------|---------|-------------|
| 1429607761720770623 | Chef Famille | CHEF | STATS_VIEW, LINK_MANAGE, ... (15 perms) |
| 1312845999366209683 | État-Major | CHEF | STATS_VIEW, LINK_MANAGE, ... |
| 1312845999739375711 | Haut Gradé | WL1 | STATS_VIEW, LINK_MANAGE, ... (11 perms) |
| 1312845999739375712 | Gradé | WL2 | STATS_VIEW, ... (7 perms) |
| 1312845999215214618 | Recruteur | RECRUITER | TICKETS_VIEW, MEMBERS_VIEW (3 perms) |

**Migration SQL**:
```sql
UPDATE "StaffRole" SET "discordRoleId" = '1429607761720770623' WHERE "code" = 'CHEF' AND "familyId" = 'esperados';
UPDATE "StaffRole" SET "discordRoleId" = '1312845999739375711' WHERE "code" = 'WL1' AND "familyId" = 'esperados';
UPDATE "StaffRole" SET "discordRoleId" = '1312845999739375712' WHERE "code" = 'WL2' AND "familyId" = 'esperados';
UPDATE "StaffRole" SET "discordRoleId" = '1312845999215214618' WHERE "code" = 'RECRUITER' AND "familyId" = 'esperados';
```

---

## 📝 Fichiers modifiés

### Créés
- ✅ `/app/api/me/roles/route.ts` (amélioré)
- ✅ `/app/api/debug/rbac/route.ts` (amélioré)

### Modifiés
- ✅ `auth.ts` (NextAuth session callback + Discord sync)
- ✅ `src/lib/rbac.ts` (ajout PermissionCode)
- ✅ `prisma/seed-rbac.ts` (ajout STATS_VIEW, LINK_MANAGE)
- ✅ `app/staff/stats/page.tsx` (requireAdmin → requirePermission)
- ✅ `app/api/staff/link/route.ts` (requireLinkAccess → requirePermission)

---

## 🎯 Prochaines étapes (optionnel)

### Migration complète vers RBAC DB

**Routes encore sur legacy guards**:
- `/api/admin/*` → utilisent `requireAdmin()` (env var ADMIN_DISCORD_IDS)
- Autres routes `/staff/*` → utilisent guards Discord live

**Plan de migration**:
1. Créer permissions granulaires:
   - `ACTIVITY_COMPUTE`, `BANK_ADMIN`, `DISCORD_ADMIN`
2. Migrer routes admin vers `requirePermission()`
3. Déprécier guards legacy (`requireAdmin`, `requirePrivileged`)
4. Supprimer env vars allowlist (`ADMIN_DISCORD_IDS`, etc.)

### Amélioration UI

- Badge rôle dans navbar: `session.staffRole.name`
- Affichage permissions dans profil utilisateur
- Page admin `/staff/rbac` pour gérer rôles/permissions

---

## 📞 Support

**En cas de problème**:
1. Vérifier `/api/me/roles` → `diagnosis.recommendedAction`
2. Vérifier `/api/debug/rbac` → `diagnostic.recommendedAction`
3. Consulter logs: `grep "\[RBAC\]" logs/app.log`
4. Consulter logs NextAuth: `grep "auth:session" logs/app.log`

**Logs importants**:
```
[RBAC] Permission denied: STATS_VIEW for user 123... (role: MEMBER)
→ User n'a pas StaffUser ou rôle sans permission

auth:session Synced Discord roles → RBAC for 123...
→ Sync auto a fonctionné

[discord-roles] cache_hit
→ Rôles Discord récupérés du cache (pas de call API)
```

---

## ✨ Résumé

**Avant**:
- Fernando lié mais accès refusé (pas dans ADMIN_DISCORD_IDS)
- Systèmes de permissions fragmentés et non synchronisés

**Après**:
- Sync automatique Discord roles → DB RBAC
- Permissions granulaires (STATS_VIEW, LINK_MANAGE)
- Diagnostic complet via APIs debug
- Migration progressive vers RBAC DB

**Fernando aura accès si**:
- Il a le rôle Discord `CHEF_FAMILLE_ROLE_ID` OU `ETAT_MAJOR_ROLE_ID`
- Le rôle DB CHEF est mappé avec `discordRoleId`
- La sync auto l'a créé dans StaffUser
- OU il a été créé manuellement en DB

**Commande de test finale**:
```bash
# 1. Seed RBAC
npx tsx prisma/seed-rbac.ts

# 2. Mapper Discord roles (SQL ci-dessus)

# 3. Fernando se connecte

# 4. Check status
curl -H "Cookie: ..." localhost:3000/api/me/roles | jq '.data.diagnosis'
```

**Expected output**:
```json
{
  "isAuthenticated": true,
  "hasDiscordLinked": true,
  "hasStaffInDB": true,
  "hasMemberInDB": true,
  "canAccessViaLegacy": true,
  "canAccessViaRBAC": true,
  "recommendedAction": "OK"
}
```

🎉 **SUCCESS!**
