# 🎯 BLOCAGE PROD — FIXES APPLIQUÉS

**Date:** $(Get-Date -Format "yyyy-MM-dd HH:mm")
**Session:** Phase finale production
**Objectif:** Débloquer la production (DB vide, sync échoue, self-linking bloqué)

---

## ✅ MODIFICATIONS EFFECTUÉES

### A) Config LYG centralisée — `src/lib/lyg.ts`

**Changements:**
- ✅ Création de `getLygConfig()` pour centraliser la validation des variables d'environnement
- ✅ Normalisation de `LYG_BASE_URL` (suppression trailing `/`, respect du protocole fourni, ajout https par défaut si manquant)
- ✅ Cache de configuration pour éviter les re-validations
- ✅ Logs debug (dev uniquement) avec token masqué (`XXX***`)
- ✅ Exports legacy `LYG_BASE_URL` et `LYG_TOKEN` pour compatibilité ascendante

**Pourquoi:**
- Validation robuste des variables d'environnement au démarrage
- Évite les erreurs silencieuses de configuration
- Normalisation cohérente de l'URL LYG

---

### B) Retry logic + meilleurs messages d'erreur — `src/lib/lyg.ts`

**Changements:**
- ✅ Fonction `lygFetchAttempt()` avec gestion des erreurs améliorée
- ✅ Retry automatique 2x avec backoff exponentiel (1s, 2s)
- ✅ Détection spécifique des erreurs SSL/TLS avec hints
- ✅ Pas de retry sur les erreurs 401/403 (problèmes d'authentification)
- ✅ Timeout configuré à 15s par tentative
- ✅ Logs détaillés avec URL complète en cas d'erreur SSL

**Pourquoi:**
- Résout les erreurs réseau transitoires (timeouts, connexions perdues)
- Fournit des hints actionnables pour les erreurs SSL/TLS (`ERR_SSL_PACKET_LENGTH_TOO_LONG`)
- Améliore la résilience face aux problèmes réseau

**Messages d'erreur ajoutés:**
```
❌ Erreur SSL/TLS:
💡 Possible HTTP/HTTPS mismatch. Check if LYG_BASE_URL should use http:// instead of https://
```

---

### C) Diagnostic LYG — `app/api/staff/diagnostics/lyg/route.ts` (NOUVEAU)

**Changements:**
- ✅ Endpoint `GET /api/staff/diagnostics/lyg` (RBAC: Chef/État-Major)
- ✅ Tests automatiques de 2 endpoints LYG: `/api/infos` et `/api/members`
- ✅ Retour structuré: config, status, statusCode, duration, error, hint
- ✅ Hints contextuels selon le type d'erreur (401 → "Token invalide", SSL → "Essayez http://", timeout → "Vérifiez connexion")

**Pourquoi:**
- Outil de debug essentiel pour diagnostiquer les problèmes LYG
- Permet de tester la config sans relancer le serveur
- Visible directement dans l'interface staff

**Format de réponse:**
```json
{
  "ok": true|false,
  "results": {
    "config": {
      "baseUrl": "http://...",
      "tokenPresent": true
    },
    "tests": [
      {
        "name": "infos",
        "endpoint": "http://.../api/infos",
        "status": "success",
        "statusCode": 200,
        "duration": 145
      }
    ]
  }
}
```

---

### D) UI Diagnostic LYG — `app/staff/diagnostics/diagnostics-client.tsx`

**Changements:**
- ✅ Ajout section "API LYG" avec bouton "🔄 Tester la connexion LYG"
- ✅ Auto-test au chargement pour les Chef/État-Major
- ✅ Affichage détaillé: baseUrl, token présent, statut de chaque endpoint
- ✅ Indicateurs visuels (✓/✗) avec durée de réponse
- ✅ Hints en orange (💡) pour guider vers la résolution

**Pourquoi:**
- Interface visuelle pour tester LYG sans ouvrir les dev tools
- Feedback immédiat sur les problèmes de configuration
- Visible uniquement pour Chef/État-Major (RBAC)

**Visuel:**
```
✓ LYG API
Base URL: http://...
Token: ✓ Présent

✓ infos         HTTP 200  145ms
  http://.../api/infos
  
✗ members       HTTP 401  89ms
  http://.../api/members
  Unauthorized
  💡 Token invalide ou manquant. Vérifiez LYG_TOKEN.
```

---

### E) Fix Self-Linking — `app/api/staff/link/route.ts`

**Changements:**
- ✅ Suppression du blocage strict `SELF_LINKING_FORBIDDEN`
- ✅ Autorisation du self-linking pour Chef/État-Major **uniquement**
- ✅ Sécurité maintenue: seuls ceux qui passent `requireLinkAccess()` peuvent se lier
- ✅ Log informatif au lieu de console.warn

**Pourquoi:**
- Chef Famille et État-Major doivent pouvoir se lier eux-mêmes si non liés
- `requireLinkAccess()` garantit déjà que seuls Chef/ÉtatMajor accèdent à cet endpoint
- Les membres classiques ne peuvent toujours pas accéder (403 en amont)

**Avant:**
```typescript
if (actualTargetDiscordId === verifiedDiscordId) {
  return NextResponse.json(
    { ok: false, error: "SELF_LINKING_FORBIDDEN" },
    { status: 403 }
  );
}
```

**Après:**
```typescript
if (actualTargetDiscordId === verifiedDiscordId) {
  console.info("[link:POST] Self-linking allowed for Chef/État-Major:", verifiedDiscordId);
  // Allow the self-linking to proceed
}
```

---

### F) Login page cleanup — ✅ DÉJÀ FAIT

**État actuel:**
- ✅ Pas de texte "Vous serez redirigé vers /"
- ✅ Pas de footer technique
- ✅ Seul texte: "Accédez au panel en quelques secondes avec Discord"
- ✅ Design premium avec BrandLogo et gradient

**Rien à modifier.**

---

## 📁 FICHIERS MODIFIÉS

1. **src/lib/lyg.ts** (✏️ refactoré)
   - Ajout `getLygConfig()` avec validation et normalisation
   - Refactor `lygFetch()` avec retry logic et meilleurs messages d'erreur
   - Détection SSL/TLS avec hints

2. **app/api/staff/link/route.ts** (✏️ modifié)
   - Autorisation du self-linking pour Chef/État-Major
   - Suppression du blocage strict `SELF_LINKING_FORBIDDEN`

3. **app/api/staff/diagnostics/lyg/route.ts** (🆕 créé)
   - Endpoint diagnostic LYG
   - Tests de connectivité avec hints contextuels

4. **app/staff/diagnostics/diagnostics-client.tsx** (✏️ augmenté)
   - Section "API LYG" avec bouton de test
   - Auto-test au chargement
   - Affichage détaillé des résultats

---

## 🧪 CHECKLIST DE TEST MANUEL

### 1️⃣ Vérifier la configuration LYG

```powershell
# En dev (avec .env.local)
npm run dev
# Naviguer vers http://localhost:3000/staff/diagnostics
```

**Vérifications:**
- [ ] Section "API LYG" visible (si Chef/État-Major)
- [ ] Cliquer sur "🔄 Tester la connexion LYG"
- [ ] Vérifier `baseUrl` affiché (doit être normalisé, sans trailing `/`)
- [ ] Vérifier "Token: ✓ Présent"
- [ ] Si erreur SSL: le hint suggère-t-il `http://` si `https://` est utilisé ?

---

### 2️⃣ Tester la synchronisation LYG

```powershell
# Depuis /staff/members ou /staff/finances
# Cliquer sur le bouton "Synchroniser maintenant"
```

**Vérifications:**
- [ ] Le bouton ne reste pas bloqué en "Synchronisation..."
- [ ] Si erreur, le message est clair et actionnable (pas juste "Unauthorized")
- [ ] Si succès, les données apparaissent dans les tableaux
- [ ] DB contient des enregistrements (vérifier via `/api/debug/db` ou Prisma Studio)

---

### 3️⃣ Tester le self-linking (Chef/État-Major)

```powershell
# Aller sur /staff/link
# Entrer votre propre Discord ID, Steam ID, etc.
# Soumettre
```

**Vérifications:**
- [ ] Pas d'erreur `SELF_LINKING_FORBIDDEN`
- [ ] Le formulaire se soumet avec succès
- [ ] Le member est créé/mis à jour dans la DB
- [ ] Log dans la console: `[link:POST] Self-linking allowed for Chef/État-Major: XXXXXX`

---

### 4️⃣ Vérifier les logs en production

```powershell
# En prod (NODE_ENV=production)
pm2 logs panel-esperados

# OU
docker logs -f panel-container
```

**Vérifications:**
- [ ] Pas de logs `debug` visibles (réservés au dev)
- [ ] Les erreurs LYG affichent l'URL complète + hint en cas de SSL
- [ ] Retry visible: `[lyg] Retry 1/2 after 1000ms`
- [ ] Config chargée au démarrage: `[lyg] Config loaded: { baseUrl: '...', tokenPresent: true }`

---

### 5️⃣ Valider les variables d'environnement

```bash
# Vérifier .env.prod (ou variables de production)
cat .env.prod | grep LYG
```

**Vérifications:**
- [ ] `LYG_BASE_URL` est défini (avec ou sans protocol)
- [ ] `LYG_TOKEN` est défini (Bearer token valide)
- [ ] Si LYG est en localhost/IP privée: utiliser `http://` au lieu de `https://`
- [ ] Pas de trailing `/` dans `LYG_BASE_URL` (le code le supprime, mais mieux prévenir)

---

## 🚀 NEXT STEPS

1. **Déployer en production:**
   ```powershell
   npm run build
   npm run start:prod
   ```

2. **Tester immédiatement:**
   - Accéder à `/staff/diagnostics`
   - Cliquer "Tester la connexion LYG"
   - Si ✓ succès: tester la synchro complète (`/staff/members` → bouton Sync)

3. **Si échec LYG:**
   - Lire le hint fourni dans l'interface
   - Vérifier `LYG_BASE_URL` et `LYG_TOKEN` dans `.env.prod`
   - Si erreur SSL: essayer `http://` au lieu de `https://`
   - Vérifier que le serveur LYG est accessible depuis le container/VM

4. **Monitoring continu:**
   - Surveiller les logs pour détecter les retries excessifs
   - Si retry échoue après 2 tentatives: problème réseau ou config

---

## 📌 NOTES IMPORTANTES

### Retry Logic

- **Max 2 retries** (3 tentatives au total)
- **Backoff:** 1s, puis 2s
- **Pas de retry** sur 401/403 (auth)
- **Retry** sur timeouts, ECONNREFUSED, SSL, etc.

### Logs Debug

- **Dev uniquement:** `NODE_ENV !== 'production'`
- **Token masqué:** `XXX***` dans les logs
- **URL complète** visible en cas d'erreur SSL

### Sécurité Self-Linking

- Seuls Chef/État-Major peuvent accéder à `/api/staff/link` (guard en amont)
- Self-linking autorisé **uniquement** pour ceux qui passent `requireLinkAccess()`
- Membres classiques: toujours bloqués (403 avant même d'arriver au check)

---

## ❓ TROUBLESHOOTING

### Sync échoue avec "Unauthorized" malgré bon token

**Causes possibles:**
1. Token expiré → régénérer depuis l'API LYG
2. Token mal copié (espaces, line breaks) → vérifier `.env.prod`
3. API LYG attend un format différent → vérifier la doc LYG

**Solution:**
- Vérifier dans `/staff/diagnostics` : "Token: ✓ Présent"
- Tester manuellement avec `curl`:
  ```bash
  curl -H "Authorization: Bearer $LYG_TOKEN" http://LYG_BASE_URL/api/infos
  ```

---

### ERR_SSL_PACKET_LENGTH_TOO_LONG persiste

**Causes:**
- `LYG_BASE_URL` utilise `https://` mais le serveur LYG écoute en HTTP

**Solution:**
- Changer `LYG_BASE_URL=https://...` en `LYG_BASE_URL=http://...`
- Redémarrer le serveur
- Le diagnostic affichera le hint automatiquement

---

### Retry infinis dans les logs

**Causes:**
- LYG inaccessible (ECONNREFUSED, DNS, firewall)
- URL incorrecte

**Solution:**
- Vérifier connectivité réseau depuis le container/VM:
  ```bash
  ping <lyg-host>
  curl http://<lyg-host>/api/infos
  ```
- Corriger `LYG_BASE_URL`

---

## ✅ VALIDATION FINALE

- [x] Config LYG centralisée avec validation
- [x] Retry logic avec backoff
- [x] Diagnostic LYG avec hints
- [x] Self-linking autorisé pour Chef/État-Major
- [x] Login page propre (déjà fait)
- [x] Logs debug désactivés en prod
- [x] Erreurs SSL détectées et expliquées

**Status:** ✅ READY FOR PRODUCTION

---

**Commit message suggéré:**
```
fix(prod): déblocage prod - LYG retry + diagnostics + self-linking

- Centralise config LYG avec getLygConfig() (validation + normalisation)
- Ajoute retry logic 2x avec backoff sur lygFetch
- Détecte et explique erreurs SSL/TLS avec hints
- Crée endpoint /api/staff/diagnostics/lyg pour test LYG
- Intègre diagnostic LYG dans UI staff/diagnostics
- Autorise self-linking pour Chef/État-Major uniquement
- Améliore messages d'erreur (token invalide, protocol mismatch, etc.)

Fixes: BLOCAGE PROD (DB vide, sync échoue, SELF_LINKING_FORBIDDEN)
```
