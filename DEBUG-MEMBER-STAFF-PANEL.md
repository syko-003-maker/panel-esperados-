# 🔍 DEBUG - MEMBER VOIT ENCORE STAFF PANEL

**Date:** 31 janvier 2026  
**Build:** ✅ exit 0

---

## 🎯 PROBLÈME REPORTÉ

> "Un membre voit encore le menu staff (STAFF PANEL) + navigation mène vers /staff/link"

---

## ✅ ARCHITECTURE ACTUELLE

### Guards en place:

1. **[app/staff/layout.tsx](app/staff/layout.tsx)** - Guard staff
   ```typescript
   const role = await getUserRole(session);
   if (role === "member") {
     return <AccèsRefuséPage />; // Pas redirect /staff/link
   }
   ```

2. **[app/(member)/layout.tsx](app/(member)/layout.tsx)** - Guard member
   ```typescript
   const role = await getUserRole(session);
   if (role !== "member") {
     redirect("/staff/dashboard");
   }
   ```

3. **[src/server/auth/rbac.ts](src/server/auth/rbac.ts)** - RBAC unique
   ```typescript
   getUserRole(session) {
     // Discord ID from Account.providerAccountId
     // Check ENV: CHEF_DISCORD_IDS, STAFF_DISCORD_IDS
     // Return: "member" | "staff" | "chef"
   }
   ```

### Sidebars séparés:

- **Member:** `app/(member)/components/member-sidebar.tsx` → "Member Panel" ✅
- **Staff:** `src/components/staff-layout.tsx` → "Staff Panel" ✅

---

## 🔍 DIAGNOSTIC - ÉTAPES

### ÉTAPE 1: Vérifier le rôle actuel

Accéder: **[/debug/role](http://localhost:3000/debug/role)**

Cette page affiche:
- ✅ Rôle actuel (member/staff/chef)
- ✅ Discord ID (session + database)
- ✅ ENV config (STAFF_DISCORD_IDS, CHEF_DISCORD_IDS)
- ✅ Test navigation

**Symptômes possibles:**

| Symptôme | Cause probable | Solution |
|----------|---------------|----------|
| Role = "staff" mais devrait être "member" | Discord ID dans STAFF_DISCORD_IDS | Retirer de ENV |
| Discord ID = null | Account Discord non lié | Relancer OAuth Discord |
| STAFF_DISCORD_IDS vide | ENV non configuré | Ajouter dans .env |

---

### ÉTAPE 2: Vérifier les logs console

Après connexion, vérifier les logs serveur (terminal):

```
✅ RBAC: User is MEMBER { discordId: '123456789' }
```

ou

```
⚠️ RBAC WARNING: No Discord ID found for user { userId: 'xxx', hasSession: true }
```

**Si "No Discord ID found":**
1. Vérifier table `Account` dans DB
2. Vérifier `provider = "discord"`
3. Relancer OAuth si absent

---

### ÉTAPE 3: Tester navigation

**En tant que MEMBER:**
1. Accéder `/dashboard` → ✅ Devrait voir "Member Panel"
2. Accéder `/staff/dashboard` → ✅ Devrait voir "Accès Refusé"
3. Vérifier sidebar → ✅ Seulement 4 items + logout

**En tant que STAFF:**
1. Accéder `/staff/dashboard` → ✅ Devrait voir "Staff Panel"
2. Accéder `/dashboard` → ✅ Redirect vers `/staff/dashboard`

---

## 🛠️ SOLUTIONS PAR SYMPTÔME

### Symptôme 1: "Discord ID introuvable"

**Cause:** Compte NextAuth non lié à Discord OAuth

**Solution:**
```bash
# 1. Vérifier dans DB
SELECT u.id, u.name, a.provider, a.providerAccountId 
FROM "User" u 
LEFT JOIN "Account" a ON a.userId = u.id 
WHERE a.provider = 'discord';

# 2. Si absent: se déconnecter + reconnecter via Discord OAuth
```

---

### Symptôme 2: "Role = staff mais je suis member"

**Cause:** Discord ID dans allowlist staff par erreur

**Solution:**
```bash
# .env.prod ou .env.local
CHEF_DISCORD_IDS="111111111,222222222"
STAFF_DISCORD_IDS="333333333,444444444"

# Retirer votre Discord ID de STAFF_DISCORD_IDS
# Redémarrer l'app
npm run start:prod
```

---

### Symptôme 3: "Je vois quand même Staff Panel"

**Causes possibles:**

1. **Cache browser**
   - Solution: Ctrl+Shift+R (hard refresh)
   - Ou: Vider cache + cookies

2. **Build obsolète**
   ```bash
   # Rebuild complet
   rm -rf .next
   npm run build
   npm start
   ```

3. **Route sans guard**
   - Vérifier quelle URL affiche Staff Panel
   - Si c'est une route custom, ajouter guard

4. **Session cachée**
   ```bash
   # Se déconnecter complètement
   # Fermer tous les onglets
   # Reconnecter
   ```

---

### Symptôme 4: "Redirect vers /staff/link"

**Cause:** Ancien code qui redirect vers `/staff/link`

**Fichiers à vérifier:**
- ❌ `app/staff/StaffNav.tsx:134` - Lien direct vers /staff/link
- ❌ `app/staff/debug/auth/page.tsx:232` - Lien debug
- ✅ `src/lib/auth-checks.ts:102` - Corrigé vers /dashboard

**Solution:**
```bash
# Rechercher tous les redirects
grep -r "redirect.*staff/link" app/
grep -r "href=.*staff/link" app/

# Remplacer par /dashboard ou page d'erreur
```

---

## 🧪 TEST COMPLET

### Setup test:

1. **Créer 3 comptes test:**
   - Membre: Discord ID `111111111`
   - Staff: Discord ID `222222222`
   - Chef: Discord ID `333333333`

2. **Configurer ENV:**
   ```bash
   STAFF_DISCORD_IDS="222222222"
   CHEF_DISCORD_IDS="333333333"
   ```

3. **Build + Start:**
   ```bash
   npm run build
   npm run start:prod
   ```

### Test membre (ID: 111111111):

```bash
✅ Login → redirect /me → redirect /dashboard
✅ Sidebar affiche "Member Panel"
✅ Menu: Dashboard, Banque, Absence, Sanction, Logout
✅ Accès /staff/dashboard → "Accès Refusé"
✅ Aucun lien vers /staff/link visible
```

### Test staff (ID: 222222222):

```bash
✅ Login → redirect /me → redirect /staff/dashboard
✅ Sidebar affiche "Staff Panel"
✅ Menu: Dashboard, Membres, Sanctions, etc.
✅ Accès /dashboard → redirect /staff/dashboard
```

---

## 🔧 OUTILS DE DEBUG CRÉÉS

### 1. [/debug/role](http://localhost:3000/debug/role)
Page de diagnostic complète:
- Affiche role actuel
- Discord ID (session + DB)
- ENV config
- Test navigation

### 2. Logs console enrichis
Dans `src/server/auth/rbac.ts`:
```typescript
console.log("✅ RBAC: User is MEMBER", { discordId });
console.log("⚠️ RBAC WARNING: No Discord ID found");
```

### 3. Sidebar unifié
Nouveau composant: `src/components/unified-sidebar.tsx`
```typescript
<UnifiedSidebar role={role} />
// Affiche automatiquement le bon menu selon role
```

---

## 📋 CHECKLIST DE VALIDATION

### Configuration ENV:
- [ ] `.env.prod` contient `STAFF_DISCORD_IDS`
- [ ] `.env.prod` contient `CHEF_DISCORD_IDS`
- [ ] Discord IDs sont séparés par virgules
- [ ] Pas d'espaces dans les IDs

### Database:
- [ ] Table `Account` contient entries avec `provider="discord"`
- [ ] `providerAccountId` correspond au Discord ID
- [ ] Users liés ont un `userId` valide

### Guards:
- [ ] `app/staff/layout.tsx` utilise `getUserRole()`
- [ ] `app/(member)/layout.tsx` utilise `getUserRole()`
- [ ] `app/me/page.tsx` dispatch selon role
- [ ] Aucun redirect vers `/staff/link` pour members

### UI:
- [ ] Member voit "Member Panel"
- [ ] Staff voit "Staff Panel"
- [ ] Member a 4 items + logout
- [ ] Staff a menu complet

---

## 🚨 SI LE PROBLÈME PERSISTE

### Action 1: Debug session
```bash
# Ajouter dans app/debug/role/page.tsx déjà créé
# Accéder /debug/role en tant que member
# Vérifier:
- Discord ID présent?
- Role correct?
- ENV configuré?
```

### Action 2: Hard reset
```bash
# 1. Déconnexion
# 2. Clear cache browser
# 3. Rebuild
rm -rf .next
npm run build

# 4. Restart
npm run start:prod

# 5. Reconnexion
```

### Action 3: Vérifier routes
```typescript
// Dans le browser, ouvrir Console DevTools
// Taper:
console.log(window.location.pathname);

// Si pathname === "/staff/dashboard" et role === "member"
// → Le guard ne fonctionne pas
// → Vérifier getUserRole() retourne bien "member"
```

### Action 4: Support
Si tout échoue, fournir ces infos:
1. Screenshot de `/debug/role`
2. Logs console (terminal serveur)
3. URL exacte où "Staff Panel" apparaît
4. Browser + OS

---

## 📊 MÉTRIQUES

- **Fichiers modifiés:** 3
- **Fichiers créés:** 2
  - `app/debug/role/page.tsx` - Page diagnostic
  - `src/components/unified-sidebar.tsx` - Sidebar flexible
- **Logs ajoutés:** 4 (RBAC)
- **Build:** ✅ exit 0

---

## 🔗 FICHIERS CLÉS À VÉRIFIER

1. [src/server/auth/rbac.ts](src/server/auth/rbac.ts) - Logique RBAC
2. [app/staff/layout.tsx](app/staff/layout.tsx) - Guard staff
3. [app/(member)/layout.tsx](app/(member)/layout.tsx) - Guard member
4. [app/debug/role/page.tsx](app/debug/role/page.tsx) - 🆕 Diagnostic
5. [.env.prod](.env.prod) - Config ENV

---

**✅ PROCHAINE ÉTAPE: Accéder /debug/role pour diagnostic**
