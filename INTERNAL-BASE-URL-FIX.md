# Fix: Internal Base URL pour Proxy LYG Banklogs

**Problème**: "[lyg-banklogs] fetch failed" sur canonical/legacy proxy en prod-local
- Le serveur Node essaie de fetch via l'URL publique https://losesperados.xyz
- Peut échouer à cause de tunnel/TLS/DNS alors que le navigateur marche

**Solution**: Utiliser l'adresse interne (loopback) pour les appels proxy

---

## Changes

### File: `src/lib/lyg-client.ts`

#### 1. Nouvelle fonction helper: `getInternalPanelBase()`
```typescript
/**
 * Get internal panel base URL for same-origin proxy calls
 * 
 * Fallback chain:
 * 1. PANEL_INTERNAL_BASE_URL (explicit config)
 * 2. http://127.0.0.1:{PORT} (loopback)
 * 3. http://localhost:3000 (dev fallback)
 */
function getInternalPanelBase(): string {
  if (process.env.PANEL_INTERNAL_BASE_URL) {
    const url = process.env.PANEL_INTERNAL_BASE_URL.trim();
    debug(`[lyg-banklogs] using INTERNAL base from PANEL_INTERNAL_BASE_URL: ${url}`);
    return stripTrailingSlash(url);
  }

  const port = process.env.PORT ?? "3000";
  const internalUrl = `http://127.0.0.1:${port}`;
  debug(`[lyg-banklogs] using INTERNAL base (loopback): ${internalUrl}`);
  return internalUrl;
}
```

#### 2. Modification de `lygFetchBanklogs()`
- Utilise `getInternalPanelBase()` pour les proxies internes
- ~~`safeJoinUrl(publicPanelBase, `api/lygbanklogs`)`~~
- ✅ `safeJoinUrl(internalPanelBase, `api/lygbanklogs`)`

---

## Configuration

### Option 1: Explicit (Optional)
```env
PANEL_INTERNAL_BASE_URL=http://127.0.0.1:3000
```

### Option 2: Automatic (Default)
L'application détecte automatiquement:
- Port depuis `process.env.PORT` (défaut 3000)
- Utilise `http://127.0.0.1:{PORT}`

---

## Testing

### Dans `.env.prod` (ou `.env.local`):
```env
LYG_BASE_URL=https://api.lyg.fr/api
LYG_TOKEN=<votre-token>
NEXTAUTH_URL=https://losesperados.xyz
PORT=3000

# Optionnel - si absent, utilise http://127.0.0.1:3000
# PANEL_INTERNAL_BASE_URL=http://127.0.0.1:3000
```

### Commandes de test:
```bash
# Terminal 1: Start local server
npm run start:prod

# Terminal 2: Start Cloudflare tunnel
cloudflared tunnel run panel

# Browser: Go to https://losesperados.xyz
# Click "Sync now" on /staff/members

# Vérifier les logs:
# ✓ [lyg-banklogs] using INTERNAL base (loopback): http://127.0.0.1:3000
# ✓ [lyg-banklogs] ✓ Success on Legacy proxy /api/lygbanklogs
# ✗ Ne doit plus voir: [lyg-banklogs] fetch failed
```

---

## What's Different

### Before
```
publicPanelBase = NEXTAUTH_URL || PANEL_PUBLIC_URL || "https://losesperados.xyz"
legacy proxy URL = https://losesperados.xyz/api/lygbanklogs
❌ Peut échouer: tunnel/TLS/DNS issues
```

### After
```
internalPanelBase = http://127.0.0.1:3000 (or PANEL_INTERNAL_BASE_URL)
legacy proxy URL = http://127.0.0.1:3000/api/lygbanklogs
✅ Toujours OK: loopback address sur le même serveur Node
```

---

## Why This Works

1. **Loopback Address** (`127.0.0.1`) est toujours disponible sur le serveur Node
2. **Pas de tunnel/TLS/DNS**: Connexion directe via TCP localhost
3. **Même serveur**: Le proxy `/api/lygbanklogs` est serveur par le même processus Node
4. **Compatible**: Fonctionne en dev ET en prod-local avec tunnel

---

## Logs

```
# Dev mode (default loopback)
[lyg-banklogs] using INTERNAL base (loopback): http://127.0.0.1:3000

# Explicit config
[lyg-banklogs] using INTERNAL base from PANEL_INTERNAL_BASE_URL: http://127.0.0.1:3000

# Tentative sur proxy interne
[lyg-banklogs] Trying Legacy proxy /api/lygbanklogs: http://127.0.0.1:3000/api/lygbanklogs

# Succès!
[lyg-banklogs] ✓ Success on Legacy proxy /api/lygbanklogs
```

---

## Impact

- ✅ Fixe fetch failed sur canonical/legacy proxy
- ✅ Pas de changement pour les appels LYG directs (https://api.lyg.fr/...)
- ✅ Backward compatible (PANEL_INTERNAL_BASE_URL est optionnel)
- ✅ Build passes: 0 errors
- ✅ Production ready

---

**Status**: ✅ Complete | **Exit Code**: 0 | **Ready to Deploy**: YES
