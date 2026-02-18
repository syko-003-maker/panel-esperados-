# Fix Membres Fantômes - Guide de Déploiement

## 📋 Résumé des changements

### 🎯 Objectif 1 : Corriger le bug des membres fantômes (93/94 alors qu'on est ~49)

**Problème** : Des Member sont créés avec uniquement un `steamId` (sans `discordId`), probablement issus d'un ancien import ou sync de BankLog non lié.

**Solution implémentée** :
1. ✅ Ajout d'un enum `MemberSource` et d'un champ `source` au modèle Prisma
2. ✅ Validation SteamID64 avec regex `/^7656119\d{10}$/`
3. ✅ Filtrage dans `/api/staff/members` pour exclure `source = BANKLOG_GHOST`
4. ✅ Mise à jour de tous les points de création de Member :
   - `sync/all` → `source: "LYG"`
   - `link` → `source: "LINK"`
   - `import/members` → `source: "MANUAL"`
   - `ingest/tickets` → `source: "RECRUITMENT"`

### 🔒 Objectif 2 : RBAC Fernando

**Statut** : ✅ Déjà implémenté dans session précédente
- [app/staff/stats/page.tsx](app/staff/stats/page.tsx#L63) utilise `requirePermission("STATS_VIEW")`
- [app/staff/link/page.tsx](app/staff/link/page.tsx#L49) utilise `requirePermission("LINK_MANAGE")`
- Fernando aura accès s'il a le rôle CHEF avec ces permissions dans la DB

### 💬 Objectif 3 : /bank Discord command

**Statut** : ✅ Déjà implémenté dans session précédente
- Réponse PUBLIC (`ephemeral: false`)
- Membres normaux : voient QUE leur propre banque
- Staff : peuvent chercher autre membre via `@user` ou `steamid`
- Embed clean avec dette globale (si solde négatif)

### 📊 Objectif 4 : UI /staff/stats

**Statut** : ✅ Déjà implémenté partiellement
- Top 15 partout (au lieu de Top 8) ✅
- Débiteurs globaux avec style propre (carte neutre, pas gros panneau rouge) ✅
- Menu "ST / Debug / Déconnexion" en haut à droite : **NON TROUVÉ** ❓
  - Aucun menu dropdown trouvé dans le code actuel
  - Déconnexion existe bien dans le sidebar en bas à gauche
  - Peut-être déjà supprimé dans version antérieure ?

---

## 🚀 Déploiement

### Étape 1 : Pull + Install

```powershell
cd c:\panel-esperados\panel
git pull
npm install
```

### Étape 2 : Migration Prisma

Le schéma a déjà été pushé avec `db push`. Pour créer une vraie migration :

```powershell
npx prisma migrate dev --name add_member_source_tracking
npx prisma generate
```

### Étape 3 : Nettoyer les Member fantômes existants

```powershell
# Ouvrir Prisma Studio pour inspecter
npx prisma studio

# OU exécuter le script SQL (voir scripts/cleanup-ghost-members.sql)
```

**Option A : Via psql**
```bash
psql -h 127.0.0.1 -p 5434 -U postgres -d postgres -f scripts/cleanup-ghost-members.sql
```

**Option B : Via Prisma Studio**
1. Ouvrir Prisma Studio
2. Aller dans "Member"
3. Filtrer WHERE `steamId IS NOT NULL AND discordId IS NULL AND source = 'LYG'`
4. Sélectionner et mettre à jour : `source = 'BANKLOG_GHOST'`, `isActive = false`

### Étape 4 : Build + Restart

```powershell
# Build Next.js
npm run build

# Restart PM2 (ou Docker si applicable)
pm2 restart panel-web

# Rebuild Discord Worker si changements nécessaires
cd discord-worker
npm run build
pm2 restart panel-discord-worker
```

### Étape 5 : Vérifier

```powershell
# Test 1 : Vérifier le count de membres
curl http://localhost:3000/api/staff/members?countOnly=1

# Test 2 : Lister les membres (devrait exclure les fantômes)
curl http://localhost:3000/api/staff/members?limit=10

# Test 3 : Vérifier les permissions Fernando (remplacer DISCORD_ID)
curl http://localhost:3000/api/me/roles -H "Cookie: next-auth.session-token=..."

# Test 4 : Tester /bank Discord command
# - En tant que membre normal : /bank (montre votre banque, public)
# - En tant que membre normal : /bank @AutreMembre (erreur "Seuls les chefs...")
# - En tant que Chef : /bank @AutreMembre (montre banque membre, public)
# - En tant que Chef : /bank steamid:76561198123456789 (montre banque, public)
```

---

## 📁 Fichiers modifiés

### Nouveaux fichiers
- [src/lib/validation/steamid.ts](src/lib/validation/steamid.ts) - Validation SteamID64
- [scripts/cleanup-ghost-members.sql](scripts/cleanup-ghost-members.sql) - Script de nettoyage

### Fichiers modifiés
1. [prisma/schema.prisma](prisma/schema.prisma)
   - Ajout enum `MemberSource`
   - Ajout champ `source: MemberSource @default(LYG)`

2. [app/api/staff/members/route.ts](app/api/staff/members/route.ts)
   - Filtre `source: { not: "BANKLOG_GHOST" }` dans `fetchMembersFromDB()`
   - Filtre dans `count()` query

3. [app/api/staff/sync/all/route.ts](app/api/staff/sync/all/route.ts)
   - Import `normalizeSteamId64`
   - Validation SteamID avant création
   - Set `source: "LYG"`

4. [app/api/staff/link/[discordId]/route.ts](app/api/staff/link/[discordId]/route.ts)
   - Import `normalizeSteamId64`
   - Validation SteamID avant création
   - Set `source: "LINK"`

5. [app/api/staff/import/members/route.ts](app/api/staff/import/members/route.ts)
   - Import `normalizeSteamId64`
   - Validation SteamID avant création (skip si invalide)
   - Set `source: "MANUAL"`

6. [app/api/ingest/tickets/route.ts](app/api/ingest/tickets/route.ts)
   - Import `normalizeSteamId64`
   - Validation SteamID avant création
   - Set `source: "RECRUITMENT"`

---

## 🧪 Testing

### Test 1 : Validation SteamID

```typescript
import { normalizeSteamId64, isValidSteamId64 } from "@/lib/validation/steamid";

// Valide
console.log(isValidSteamId64("76561198123456789")); // true
console.log(normalizeSteamId64("76561198123456789")); // "76561198123456789"

// Invalide
console.log(isValidSteamId64("1234567890")); // false
console.log(normalizeSteamId64("1234567890")); // null
console.log(isValidSteamId64("STEAM_0:1:12345")); // false
```

### Test 2 : Compter membres réels

```sql
-- Avant nettoyage
SELECT COUNT(*) FROM "Member" WHERE "isActive" = true;
-- Résultat attendu : ~93-94

-- Après nettoyage
SELECT COUNT(*) FROM "Member" WHERE "isActive" = true AND source != 'BANKLOG_GHOST';
-- Résultat attendu : ~49
```

### Test 3 : Vérifier sources

```sql
SELECT 
  source,
  COUNT(*) as count,
  COUNT(CASE WHEN "isActive" = true THEN 1 END) as active_count
FROM "Member"
GROUP BY source
ORDER BY count DESC;

-- Résultat attendu :
-- LYG: ~49 (active: 49)
-- BANKLOG_GHOST: ~44 (active: 0)
-- LINK: <10
-- RECRUITMENT: <5
-- MANUAL: <5
```

---

## ⚠️ Limitations & Notes

1. **Member fantômes existants** : Nécessite exécution manuelle du script SQL de nettoyage
2. **Menu "ST / Debug / Déconnexion"** : Non trouvé dans le code - peut-être déjà supprimé ?
3. **Fernando RBAC** : Doit avoir un `StaffUser` en DB avec role CHEF et permissions STATS_VIEW + LINK_MANAGE

---

## 🔄 Rollback (si besoin)

```sql
-- Restaurer tous les Member fantômes
UPDATE "Member"
SET 
  source = 'LYG',
  "isActive" = true
WHERE source = 'BANKLOG_GHOST';

-- Supprimer le champ source (nécessite migration Prisma)
-- Reverter le commit Git et re-migrer
```

---

## 📞 Support

Si problème :
1. Vérifier logs : `pm2 logs panel-web`
2. Vérifier DB : `npx prisma studio`
3. Vérifier member count : `SELECT source, COUNT(*) FROM "Member" GROUP BY source;`
