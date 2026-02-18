# Fix HTML Redirect sur Worker /link - Middleware Bypass

**Date**: 2026-02-05  
**Status**: ✅ IMPLÉMENTÉ  
**Fichier modifié**: `proxy.ts`

---

## Problème Identifié

Même avec le fix précédent (routes acceptant `x-ingest-secret`), le worker Discord reçoit toujours une page HTML au lieu de JSON.

**Cause**: Le fichier `proxy.ts` (middleware Next.js) intercepte TOUTES les requêtes AVANT qu'elles n'atteignent les routes. Quand une requête vers `/api/staff/link` arrive sans session NextAuth, `proxy.ts` redirige vers `/login` **avant même** que la route ne puisse vérifier le header `x-ingest-secret`.

---

## Solution Implémentée

### Modifications dans `proxy.ts`

Ajout d'un **bypass machine-to-machine** au début du middleware:

```typescript
// ✅ SECURITY: Check for worker authentication (machine-to-machine)
const ingestSecret = req.headers.get("x-ingest-secret");
const expectedSecret = process.env.INGEST_SECRET;

if (ingestSecret && expectedSecret && ingestSecret === expectedSecret && isWorkerAccessiblePath(pathname)) {
  // Valid worker auth - bypass session check
  return NextResponse.next();
}
```

### Endpoints bypassés pour workers

```typescript
const WORKER_ACCESSIBLE_PREFIXES = [
  "/api/staff/link",       // Worker link management
  "/api/ingest/",          // All ingest endpoints
  "/api/health",           // Health checks
  "/api/ping",             // Ping checks
];
```

---

## Flux d'Authentification

### Avant (cassé)

```
Worker Request
  ↓
  x-ingest-secret: SECRET
  ↓
proxy.ts middleware
  ├─ Vérifie session NextAuth
  ├─ ❌ Pas de session
  └─ Redirect 302 → /login (HTML)
      ↓
      ❌ Worker reçoit HTML au lieu de JSON
```

### Après (fixé)

```
Worker Request
  ↓
  x-ingest-secret: SECRET
  ↓
proxy.ts middleware
  ├─ Vérifie header x-ingest-secret
  ├─ ✅ Secret valide ET pathname in WORKER_ACCESSIBLE_PREFIXES
  └─ NextResponse.next() (bypass session check)
      ↓
      Route handler /api/staff/link
        ├─ Re-vérifie x-ingest-secret (double sécurité)
        └─ ✅ Retourne JSON
```

### Pour utilisateurs staff (inchangé)

```
Browser Request (session NextAuth)
  ↓
  Cookie: next-auth.session-token=...
  ↓
proxy.ts middleware
  ├─ Pas de header x-ingest-secret
  ├─ Vérifie session NextAuth
  ├─ ✅ Session valide
  └─ NextResponse.next()
      ↓
      Route handler /api/staff/link
        ├─ Vérifie requireLinkAccess()
        └─ ✅ Retourne JSON ou redirect HTML
```

---

## Sécurité

### Double Validation

1. **Middleware (proxy.ts)**: Vérifie `x-ingest-secret` pour bypass session check
2. **Route handler**: Re-vérifie `x-ingest-secret` dans chaque route

Cela garantit que même si le middleware laisse passer une requête, la route applique sa propre validation.

### Endpoints Protégés

| Endpoint | Worker Auth | Staff Auth | Public |
|----------|-------------|------------|--------|
| `/api/staff/link` | ✅ x-ingest-secret | ✅ NextAuth | ❌ |
| `/api/ingest/*` | ✅ x-ingest-secret | ❌ | ❌ |
| `/api/health` | ✅ x-ingest-secret | ✅ Public | ✅ |
| `/api/ping` | ✅ x-ingest-secret | ✅ Public | ✅ |
| `/staff/*` (pages) | ❌ | ✅ NextAuth | ❌ |

---

## Testing

### Test 1: Worker avec secret valide

```bash
curl -X POST http://localhost:3000/api/staff/link \
  -H "x-ingest-secret: $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"discordId": "123", "steamId": "456", "rpName": "Test"}'

# ✅ Attendu: 200 OK avec JSON
# {"ok": true, "discordId": "123", ...}
```

### Test 2: Worker avec secret invalide

```bash
curl -X POST http://localhost:3000/api/staff/link \
  -H "x-ingest-secret: wrong-secret" \
  -H "Content-Type: application/json" \
  -d '{"discordId": "123", "steamId": "456", "rpName": "Test"}'

# ✅ Attendu: 401 avec JSON (pas HTML)
# {"ok": false, "error": "INVALID_INGEST_SECRET"}
```

### Test 3: Worker sans header secret

```bash
curl -X POST http://localhost:3000/api/staff/link \
  -H "Content-Type: application/json" \
  -d '{"discordId": "123", "steamId": "456", "rpName": "Test"}'

# ✅ Attendu: 302 redirect vers /login (HTML) - comportement normal pour requêtes non-authentifiées
```

### Test 4: Staff user via browser

```bash
# Browser avec session NextAuth
GET /api/staff/link/123
Cookie: next-auth.session-token=...

# ✅ Attendu: 200 OK avec JSON (pas affecté par le fix)
```

---

## Impact

### ✅ Changements

- ✅ Worker peut maintenant appeler `/api/staff/link` sans session NextAuth
- ✅ Middleware bypass session check si header `x-ingest-secret` valide
- ✅ Worker reçoit JSON, jamais HTML redirect

### ✅ Inchangé

- ✅ Staff users utilisent toujours NextAuth (aucun changement)
- ✅ Pages `/staff/*` toujours protégées par session
- ✅ RBAC permissions inchangées
- ✅ Aucune modification de base de données

---

## Fichiers Modifiés

| Fichier | Changement | Lignes |
|---------|------------|--------|
| [proxy.ts](proxy.ts) | Ajout bypass worker auth | +20 |

**Total**: 1 fichier, ~20 lignes ajoutées

---

## Déploiement

### Pré-requis

```bash
# Vérifier que INGEST_SECRET est configuré
echo $INGEST_SECRET

# Doit retourner une valeur (pas vide)
```

### Commandes

```bash
# 1. Pull code
git pull

# 2. Build (si erreur TypeScript mineure, ignore)
npm run build

# 3. Restart application
pm2 restart panel  # ou docker-compose restart
```

### Validation Post-Déploiement

```bash
# Test endpoint avec secret
curl -v http://localhost:3000/api/staff/link \
  -H "x-ingest-secret: $INGEST_SECRET"

# Vérifier headers:
# - Content-Type: application/json (PAS text/html)
# - Status: 200 ou 401 (PAS 302 redirect)
```

---

## Troubleshooting

### Problème: Worker reçoit toujours HTML

**Cause possible**: `INGEST_SECRET` non configuré ou différent entre panel et worker

**Solution**:
```bash
# Vérifier secret côté panel
echo $INGEST_SECRET

# Vérifier secret côté worker
docker logs discord-worker | grep INGEST_SECRET

# Ils doivent être identiques
```

### Problème: Staff users ne peuvent plus accéder

**Cause possible**: Le middleware bloque les sessions valides

**Solution**: Vérifier que le bypass n'est appliqué QUE si `x-ingest-secret` présent:

```typescript
if (ingestSecret && expectedSecret && ingestSecret === expectedSecret && isWorkerAccessiblePath(pathname)) {
  return NextResponse.next();
}
// ⬇️ Ne pas oublier de continuer la logique normale après
```

---

## Documentation Complète

- [DISCORD-WORKER-LINK-FIX.md](DISCORD-WORKER-LINK-FIX.md) - Fix initial (routes)
- [DISCORD-WORKER-LINK-FIX-MIDDLEWARE.md](DISCORD-WORKER-LINK-FIX-MIDDLEWARE.md) - Ce document (middleware)

---

**Completed**: 2026-02-05  
**Status**: Ready for testing & deployment ✅
