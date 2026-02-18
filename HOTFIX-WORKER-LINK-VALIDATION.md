# HOTFIX - Test de Validation Worker /link

**Date**: 2026-02-05  
**Fichier modifié**: `proxy.ts`  
**Status**: ✅ Ready for testing

---

## Changement Implémenté

### Dans `proxy.ts` (middleware Next.js)

Ajout d'un **bypass machine-to-machine** AVANT toute vérification NextAuth:

```typescript
const ingestSecret = req.headers.get("x-ingest-secret");
const expectedSecret = process.env.INGEST_SECRET;

if (ingestSecret && expectedSecret && ingestSecret === expectedSecret && isWorkerAccessiblePath(pathname)) {
  // Valid worker auth - bypass session check
  if (process.env.NODE_ENV !== "production") {
    console.log("[middleware] ingest bypass", pathname);
  }
  return NextResponse.next();
}
```

### Endpoints bypassés

```typescript
const WORKER_ACCESSIBLE_PREFIXES = [
  "/api/staff/link",
  "/api/ingest/",
  "/api/health",
  "/api/ping",
];
```

---

## Tests de Validation

### Test 1: Worker avec secret valide → JSON (pas HTML)

```bash
curl -i -H "x-ingest-secret: $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  https://losesperados.xyz/api/staff/link/123456789012345678

# ✅ Vérifier:
# - HTTP/1.1 200 OK (ou 404 si membre pas trouvé)
# - Content-Type: application/json
# - PAS de Content-Type: text/html
# - PAS de redirect Location: /login
# - Body: {"ok": true, ...} ou {"error": "NOT_FOUND", ...}
```

### Test 2: POST /api/staff/link avec secret

```bash
curl -i -X POST https://losesperados.xyz/api/staff/link \
  -H "x-ingest-secret: $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "123456789012345678",
    "steamId": "76561198012345678",
    "rpName": "Test Player"
  }'

# ✅ Vérifier:
# - HTTP/1.1 200 OK
# - Content-Type: application/json
# - Body: {"ok": true, "discordId": "...", "steamId": "...", ...}
```

### Test 3: DELETE /api/staff/link avec secret

```bash
curl -i -X DELETE https://losesperados.xyz/api/staff/link/123456789012345678 \
  -H "x-ingest-secret: $INGEST_SECRET"

# ✅ Vérifier:
# - HTTP/1.1 200 OK (ou 404 si membre pas trouvé)
# - Content-Type: application/json
# - Body: {"ok": true, "message": "Link deleted successfully", ...}
```

### Test 4: Sans secret → Redirect HTML (normal)

```bash
curl -i https://losesperados.xyz/api/staff/link/123456789012345678

# ✅ Vérifier:
# - HTTP/1.1 302 Found
# - Location: /login?next=...
# - Comportement INCHANGÉ (normal pour requêtes non-authentifiées)
```

### Test 5: Secret invalide → JSON Error (pas HTML)

```bash
curl -i -H "x-ingest-secret: wrong-secret" \
  https://losesperados.xyz/api/staff/link/123456789012345678

# ✅ Vérifier:
# - HTTP/1.1 401 Unauthorized
# - Content-Type: application/json
# - Body: {"ok": false, "error": "INVALID_INGEST_SECRET"}
# - PAS de redirect HTML
```

### Test 6: Worker Discord `/link` command

```bash
# Dans Discord:
/link @username

# ✅ Vérifier:
# - Commande s'exécute sans erreur
# - Pas d'erreur "Unexpected token '<'"
# - Modal s'affiche pour saisir SteamID64 et Nom RP
# - Lien se crée correctement
```

### Test 7: Logs serveur (dev uniquement)

```bash
# Vérifier les logs serveur (si NODE_ENV=development):
grep "middleware.*ingest bypass" /var/log/panel.log

# ✅ Devrait afficher:
# [middleware] ingest bypass /api/staff/link/123456789012345678
```

---

## Critères de Succès

| Test | Critère | Status |
|------|---------|--------|
| ✅ GET avec secret | `Content-Type: application/json` | [ ] |
| ✅ POST avec secret | `Content-Type: application/json` | [ ] |
| ✅ DELETE avec secret | `Content-Type: application/json` | [ ] |
| ✅ Sans secret | Redirect `/login` (HTML OK) | [ ] |
| ✅ Secret invalide | JSON error 401 | [ ] |
| ✅ Discord `/link` | Pas d'erreur "Unexpected token" | [ ] |
| ✅ Staff web UI | Fonctionne normalement | [ ] |
| ✅ Build | `npm run build` OK | [x] |

---

## Rollback (si problème)

```bash
# 1. Revert proxy.ts
git checkout HEAD~1 proxy.ts

# 2. Rebuild
npm run build

# 3. Restart
pm2 restart panel  # ou docker-compose restart
```

---

## Points de Vérification Sécurité

- ✅ Double validation: middleware + route handler
- ✅ Secret comparaison stricte (`===`)
- ✅ Bypass uniquement pour prefixes définis
- ✅ Pas de bypass si secret manquant
- ✅ Staff web UI inchangé (NextAuth toujours actif)
- ✅ RBAC permissions inchangées

---

## Variables d'Environnement Requises

```bash
# .env.prod (panel)
INGEST_SECRET=your-secret-value-here

# Worker Discord
INGEST_SECRET=your-secret-value-here  # DOIT être identique
```

**Important**: Les deux valeurs doivent être **exactement identiques**.

---

## Troubleshooting

### Problème: Toujours "Unexpected token '<'"

**Cause**: Secret différent entre panel et worker

**Solution**:
```bash
# Panel
grep INGEST_SECRET .env.prod

# Worker
docker logs discord-worker | grep -i secret

# Comparer les valeurs
```

### Problème: Staff ne peut plus accéder

**Cause**: Middleware bloque sessions valides

**Solution**: Vérifier que le bypass vérifie `ingestSecret` ET `expectedSecret`:
```typescript
if (ingestSecret && expectedSecret && ingestSecret === expectedSecret && ...)
```

### Problème: Log spam en production

**Solution**: Log uniquement en dev:
```typescript
if (process.env.NODE_ENV !== "production") {
  console.log("[middleware] ingest bypass", pathname);
}
```

---

**Ready for deployment**: ✅ YES  
**Breaking changes**: ❌ NO  
**Testing required**: ✅ YES (voir tests ci-dessus)
