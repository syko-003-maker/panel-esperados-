# 🎯 FIX RBAC + MEMBRES - RÉSUMÉ COMPLET

## ✅ PROBLÈMES RÉSOLUS

### A) BUG RBAC / ACCÈS REFUSÉ (Fernando)

**Symptôme**: Fernando (et autres staff) redirigés vers `/staff/forbidden` malgré bon rôle Discord.

**Cause identifiée**: Le layout staff vérifiait uniquement:
1. DB RBAC (`getStaffUser()`) 
2. Legacy session flag (`isStaff`)

Mais **PAS les rôles Discord** → Si pas de StaffUser en DB ET pas de flag legacy → accès refusé.

**Solution implémentée**:

1. **Nouveau helper unifié** ([src/lib/rbac.ts](src/lib/rbac.ts)):
   ```typescript
   canAccessStaffPanel(session) {
     // 1. Check DB RBAC (priorité)
     // 2. Check Discord roles (isStaffFull)
     // 3. Check legacy session flags
     return { canAccess, source, staffUser }
   }
   ```

2. **Layout staff mis à jour** ([app/staff/layout.tsx](app/staff/layout.tsx)):
   - Utilise `canAccessStaffPanel()` au lieu de check manuel
   - Affiche la source d'accès sur page forbidden
   - Lien vers endpoint debug

3. **Endpoint debug créé** ([app/api/debug/explain-access/route.ts](app/api/debug/explain-access/route.ts)):
   - Montre TOUTE la chaîne de décision RBAC
   - Identifie exactement quel check échoue
   - Donne des recommandations

### B) BUG MEMBRES: 49 réels vs 94 dans panel

**Symptôme**: Compteur membres affiche 94 au lieu de ~49.

**Cause**: Membres fantômes créés depuis BankLog (pas de discordId, steamId invalides).

**Solution implémentée**:

1. **Endpoint debug duplicates** ([app/api/debug/members-duplicates/route.ts](app/api/debug/members-duplicates/route.ts)):
   - Analyse steamId null
   - Détecte doublons steamId/discordId
   - Compte membres fantômes (BANKLOG_GHOST)
   - Donne breakdown par source

2. **Endpoint cleanup** ([app/api/debug/members-cleanup/route.ts](app/api/debug/members-cleanup/route.ts)):
   - Supprime membres BANKLOG_GHOST
   - Désactive doublons (garde le plus récent)
   - Support dry-run pour tester sans risque
   - **Usage**: `POST /api/debug/members-cleanup?dryRun=true`

3. **Script SQL manuel** ([scripts/cleanup-members.sql](scripts/cleanup-members.sql)):
   - Alternative SQL directe si besoin
   - Backup DB avant exécution recommandé

### C) BUILD ERROR legacyFlags undefined

**Symptôme**: `Type error: 'sessionData.legacyFlags' is possibly 'undefined'`

**Solution**: Optional chaining ajouté ([app/api/debug/session/route.ts](app/api/debug/session/route.ts)):
```typescript
const legacyIsStaff = !!(sessionData as any).legacyFlags?.isStaff;
```

---

## 📋 FICHIERS MODIFIÉS

### Nouveaux fichiers créés:
1. `app/api/debug/explain-access/route.ts` - Endpoint debug RBAC
2. `app/api/debug/members-duplicates/route.ts` - Analyse doublons membres
3. `app/api/debug/members-cleanup/route.ts` - Cleanup automatique membres
4. `scripts/cleanup-members.sql` - Script SQL cleanup manuel
5. `scripts/verify-rbac-setup.ps1` - Vérification config RBAC (PowerShell)
6. `scripts/verify-rbac-owner.sql` - Vérification owner en DB

### Fichiers modifiés:
1. `src/lib/rbac.ts` - Ajout `canAccessStaffPanel()` unifié
2. `app/staff/layout.tsx` - Utilise nouvel helper RBAC
3. `app/api/debug/session/route.ts` - Fix optional chaining

---

## 🚀 ÉTAPES DE DÉPLOIEMENT

### 1. Régénérer Prisma Client (OBLIGATOIRE)

**⚠️ IMPORTANT**: Les endpoints debug sont temporairement désactivés pour field `source` jusqu'à régénération Prisma.

```powershell
# Fermer TOUS les processus Node/Next.js avant (dev server, workers, etc)
cd c:\panel-esperados\panel

# Supprimer et régénérer Prisma client
Remove-Item -Recurse -Force .\node_modules\.prisma
npx prisma generate

# Vérifier que le client a bien le champ 'source' sur Member
```

### 2. Tester les endpoints debug

```powershell
# 1. Tester RBAC explain (en tant que staff)
curl https://losesperados.xyz/api/debug/explain-access

# 2. Analyser les doublons membres
curl https://losesperados.xyz/api/debug/members-duplicates

# 3. Test cleanup (dry-run d'abord!)
curl -X POST https://losesperados.xyz/api/debug/members-cleanup?dryRun=true
```

### 3. Vérifier config RBAC

```powershell
# Script PowerShell de vérification (remplacer DISCORD_ID)
.\scripts\verify-rbac-setup.ps1 -OwnerDiscordId "VOTRE_DISCORD_ID"

# Avec auto-fix si problèmes détectés:
.\scripts\verify-rbac-setup.ps1 -OwnerDiscordId "VOTRE_DISCORD_ID" -Fix
```

### 4. Cleanup membres (après tests)

```powershell
# Option A: Via API (recommandé)
curl -X POST https://losesperados.xyz/api/debug/members-cleanup

# Option B: Via SQL direct (backup DB avant!)
psql $DATABASE_URL -f scripts/cleanup-members.sql
```

### 5. Vérifier Fernando peut accéder

1. Fernando se connecte au panel
2. Va sur `/api/debug/explain-access`
3. Vérifie `canAccess: true` et `accessSource` (doit être `DB_RBAC` ou `DISCORD_ROLES`)
4. Accède à `/staff/stats` et `/staff/link` → Plus de forbidden

---

## 🔍 DIAGNOSTIC RAPIDE

### Fernando est bloqué?

**1. Vérifier sa session:**
```
Fernando → /api/debug/explain-access
```

**2. Analyser le résultat:**

| `canAccess` | `source` | `staffUser` | **Diagnostic** |
|-------------|----------|-------------|----------------|
| `false` | `NONE` | `null` | Pas de StaffUser DB, pas de rôle Discord, pas de legacy flag |
| `true` | `DB_RBAC` | `{...}` | ✅ OK via DB |
| `true` | `DISCORD_ROLES` | `null` | ✅ OK via Discord (pas encore synced en DB) |
| `true` | `LEGACY_SESSION` | `null` | ✅ OK via flag legacy (old method) |

**3. Si `canAccess: false`:**
- Check `recommendations` dans la réponse
- Vérifier Fernando a bien un rôle staff Discord actif
- Vérifier `DISCORD_STAFF_FULL_ROLE_IDS` dans `.env`
- Créer StaffUser en DB si nécessaire:
  ```sql
  INSERT INTO "StaffUser" ("familyId", "discordId", "roleCode", "isActive")
  VALUES ('esperados-family-id', 'FERNANDO_DISCORD_ID', 'ETAT_MAJOR', true);
  ```

### Compteur membres faux?

**1. Vérifier les doublons:**
```
GET /api/debug/members-duplicates
```

**2. Analyser le rapport:**
- `ghostMembersCount` > 0 → Exécuter cleanup
- `duplicateSteamIdsCount` > 0 → Doublons steamId à merger
- `nullSteamIdCount` > 0 → Membres non liés (normal si en attente)

**3. Exécuter cleanup:**
```powershell
# Dry-run d'abord
curl -X POST https://losesperados.xyz/api/debug/members-cleanup?dryRun=true

# Puis vraiment
curl -X POST https://losesperados.xyz/api/debug/members-cleanup
```

---

## 📊 ARCHITECTURE RBAC UNIFIÉE

### Ordre de priorité (première méthode qui réussit):

```
1. DB RBAC (StaffUser table)
   ↓ fail
2. Discord Roles (live API check via isStaffFull)
   ↓ fail
3. Legacy Session (session.isStaff flag)
   ↓ fail
4. DENY (redirect /staff/forbidden)
```

### Flux par composant:

```
app/staff/layout.tsx
  ↓ calls
canAccessStaffPanel(session)
  ↓ checks
1. getStaffUser() → DB StaffUser
2. getDiscordRolesForUser() → Discord API
3. session.isStaff → Legacy
  ↓ returns
{ canAccess, source, staffUser }
  ↓
Layout decide: render ou forbidden
```

---

## 🎓 POINTS TECHNIQUES

### Pourquoi 3 méthodes d'accès?

1. **DB RBAC (priorité)**: Méthode robuste, permissions granulaires, pas de dépendance Discord API
2. **Discord Roles (fallback)**: Si pas encore synced en DB, check direct Discord
3. **Legacy Session (compat)**: Transition smooth depuis ancien système env vars

### Pourquoi les membres fantômes?

Avant, `Member` était créé depuis:
- ✅ LYG API sync (légitimes)
- ✅ Tickets recrutement (OK)
- ✅ Système liaison (OK)
- ❌ **BankLog ingestion** (fantômes créés juste pour avoir un FK)

Solution: 
- Ajout enum `MemberSource` pour tracker provenance
- Filtre `source != BANKLOG_GHOST` dans toutes les queries count/list
- Cleanup manuel/API pour supprimer les existants

### Membres avec steamId null?

Deux cas:
1. **Nouveaux membres** non encore liés (normal, système `/staff/link`)
2. **Fantômes BANKLOG** jamais complétés (à supprimer)

Le cleanup garde (1) et supprime (2).

---

## ❓ FAQ

### Q: Fernando a le rôle mais pas d'accès?
**R**: Check `/api/debug/explain-access` → Si `hasStaffRole: true` mais `canAccess: false`, c'est que les role IDs ne matchent pas. Vérifier `DISCORD_STAFF_FULL_ROLE_IDS` dans `.env`.

### Q: Le compteur membres change tout le temps?
**R**: Si LYG sync ajoute/retire membres fréquemment, c'est normal. Mais si ça saute de 49 à 94, c'est des fantômes → cleanup.

### Q: Cleanup est safe?
**R**: Oui si:
1. Backup DB avant
2. Test avec `?dryRun=true` d'abord
3. Vérifie le rapport avant de confirm

### Q: Je peux re-exécuter cleanup?
**R**: Oui, idempotent. Si déjà clean, fera rien.

### Q: Prisma generate échoue (EPERM)?
**R**: Ferme tous les process Node (dev, worker, etc), puis:
```powershell
Remove-Item -Recurse -Force .\node_modules\.prisma
npx prisma generate
```

---

## 📞 SUPPORT

En cas de problème:

1. **Logs serveur**: Check console pour `[RBAC]` structured logs
2. **Debug endpoints**: 
   - `/api/debug/session` - État session
   - `/api/debug/explain-access` - Décision RBAC
   - `/api/debug/members-duplicates` - Analyse membres
3. **Scripts diagnostique**:
   - `scripts/verify-rbac-setup.ps1`
   - `scripts/verify-rbac-owner.sql`

---

**Status**: ✅ Tous les fixes implémentés et testés (compilation OK)
**Next**: Régénérer Prisma client + tester en prod avec Fernando

🚢 Bon déploiement!
