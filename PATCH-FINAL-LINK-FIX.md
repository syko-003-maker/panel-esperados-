# PATCH FINAL - Discord Worker /link Fix

**Date**: 2026-02-05  
**Status**: ✅ Build Success  
**Problème résolu**: "Unexpected token '<'" + MISSING_DISCORD_ID

---

## 🎯 Changements Implémentés

### 1. API Routes - Accepter discordId de Multiple Sources

#### [app/api/staff/link/route.ts](app/api/staff/link/route.ts) (POST)
```typescript
// ✅ Accept discordId from:
// 1. Query string: ?discordId=... OR ?targetDiscordId=...
// 2. Body: { discordId } OR { targetDiscordId } OR { targetId }
// 3. Staff self-link: verified session discordId

const { searchParams } = new URL(req.url);
const queryDiscordId = searchParams.get("discordId") || searchParams.get("targetDiscordId") || "";
const bodyDiscordId = String(
  data.targetDiscordId ?? data.discordId ?? data.targetId ?? ""
).trim();

const targetDiscordId = bodyDiscordId || queryDiscordId;

// ✅ Debug info on error
if (!actualTargetDiscordId) {
  const receivedKeys = Object.keys(data);
  const hasQueryDiscordId = !!queryDiscordId;
  
  console.error("[link:POST] MISSING_DISCORD_ID debug:", {
    isWorker,
    contentType,
    receivedKeys,
    hasQueryDiscordId,
    bodyDiscordId,
    queryDiscordId,
  });
  
  return NextResponse.json(
    { 
      ok: false, 
      error: "MISSING_DISCORD_ID",
      hint: "Send discordId in URL /api/staff/link/:discordId OR query ?discordId=... OR body {discordId}",
      receivedKeys,
      hasQueryDiscordId,
    },
    { status: 400 }
  );
}
```

#### [app/api/staff/link/[discordId]/route.ts](app/api/staff/link/[discordId]/route.ts)
```typescript
// ✅ NEW: POST /api/staff/link/{discordId}
export async function POST(req: NextRequest, context: Context) {
  const { discordId } = await context.params;
  
  // ✅ x-ingest-secret OR NextAuth session
  // ✅ Create/update member link with explicit discordId from URL
  // ✅ Returns JSON only (never redirect)
}
```

### 2. Discord Worker - Appel Explicite avec discordId dans URL

#### [discord-worker/src/link.ts](discord-worker/src/link.ts)
```typescript
// ✅ BEFORE: POST /api/staff/link with body {discordId, steamId, rpName}
// ❌ PROBLEM: Route couldn't find discordId

// ✅ NOW: POST /api/staff/link/{discordId}
async function updateMemberLink(
  discordId: string,
  steamId: string,
  rpName: string
): Promise<PanelLinkResponse | null> {
  const data = await panelFetch(`/api/staff/link/${discordId}`, {
    method: "POST",
    body: JSON.stringify({
      discordId, // Also send in body for backwards compatibility
      steamId,
      rpName,
    }),
  });
  if (!data || !("memberId" in data)) return null;
  return data as PanelLinkResponse;
}
```

### 3. Worker - Logs Détaillés

```typescript
async function panelFetch(path: string, options: RequestInit = {}) {
  const method = options.method || "GET";

  // ✅ Log request
  log("link_request", {
    method,
    url,
    hasSecret: !!WORKER_SECRET,
  });

  const res = await fetch(url, {...});

  // ✅ Log response
  log("link_response", {
    method,
    url,
    status: res.status,
    contentType: res.headers.get("content-type"),
  });

  // ✅ Verify JSON before parsing
  if (!contentType.includes("application/json")) {
    const textPreview = await res.text().catch(() => "(unable to read)");
    log("panel_fetch_error", {
      method,
      path,
      error: `Invalid content-type: expected application/json, got ${contentType}`,
      textPreview: textPreview.slice(0, 200),
    });
    return null;
  }

  return res.json().catch((err) => {
    log("panel_fetch_json_error", {...});
    return null;
  });
}
```

---

## 📋 Tests de Validation

### Test 1: Worker appelle avec discordId dans URL
```bash
curl -i -X POST "https://losesperados.xyz/api/staff/link/123456789012345678" \
  -H "x-ingest-secret: $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "steamId": "76561198012345678",
    "rpName": "Test Player"
  }'

# ✅ Expected:
# HTTP/1.1 200 OK
# Content-Type: application/json
# {"ok":true,"discordId":"123456789012345678","steamId":"76561198012345678",...}
```

### Test 2: Body avec discordId (backward compat)
```bash
curl -i -X POST "https://losesperados.xyz/api/staff/link" \
  -H "x-ingest-secret: $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "123456789012345678",
    "steamId": "76561198012345678",
    "rpName": "Test Player"
  }'

# ✅ Expected: 200 OK + JSON
```

### Test 3: Query string avec discordId
```bash
curl -i -X POST "https://losesperados.xyz/api/staff/link?discordId=123456789012345678" \
  -H "x-ingest-secret: $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "steamId": "76561198012345678",
    "rpName": "Test Player"
  }'

# ✅ Expected: 200 OK + JSON
```

### Test 4: MISSING_DISCORD_ID avec debug info
```bash
curl -i -X POST "https://losesperados.xyz/api/staff/link" \
  -H "x-ingest-secret: $INGEST_SECRET" \
  -H "Content-Type: application/json" \
  -d '{
    "steamId": "76561198012345678",
    "rpName": "Test Player"
  }'

# ✅ Expected:
# HTTP/1.1 400 Bad Request
# Content-Type: application/json
# {
#   "ok": false,
#   "error": "MISSING_DISCORD_ID",
#   "hint": "Send discordId in URL /api/staff/link/:discordId OR query ?discordId=... OR body {discordId}",
#   "receivedKeys": ["steamId", "rpName"],
#   "hasQueryDiscordId": false
# }
```

### Test 5: Discord /link command
```bash
# Dans Discord:
/link @username

# ✅ Expected:
# - Modal s'affiche pour saisir SteamID64 et Nom RP
# - Pas d'erreur "Unexpected token '<'"
# - Pas d'erreur "MISSING_DISCORD_ID"
# - Lien créé avec succès
# - Message de confirmation
```

### Test 6: Logs worker (dev)
```bash
# Vérifier les logs du worker Discord:
docker logs discord-worker -f --tail 50 | grep link_

# ✅ Expected:
# {"event":"link_request","method":"POST","url":"https://.../api/staff/link/123...","hasSecret":true,"timestamp":"..."}
# {"event":"link_response","method":"POST","url":"https://.../api/staff/link/123...","status":200,"contentType":"application/json","timestamp":"..."}
```

### Test 7: Logs panel (dev)
```bash
# Vérifier les logs du panel Next.js:
pm2 logs panel --lines 50 | grep "link:POST"

# ✅ Expected (si discordId manquant):
# [link:POST] MISSING_DISCORD_ID debug: { isWorker: true, contentType: "application/json", receivedKeys: [...], ... }
```

---

## 🔍 Logs de Debug Ajoutés

### Panel API (si MISSING_DISCORD_ID)
```typescript
console.error("[link:POST] MISSING_DISCORD_ID debug:", {
  isWorker: boolean,
  contentType: string,
  receivedKeys: string[],
  hasQueryDiscordId: boolean,
  bodyDiscordId: string,
  queryDiscordId: string,
});
```

### Worker Requests
```json
{
  "event": "link_request",
  "method": "POST",
  "url": "https://losesperados.xyz/api/staff/link/123456789012345678",
  "hasSecret": true,
  "timestamp": "2026-02-05T..."
}
```

### Worker Responses
```json
{
  "event": "link_response",
  "method": "POST",
  "url": "https://losesperados.xyz/api/staff/link/123456789012345678",
  "status": 200,
  "contentType": "application/json",
  "timestamp": "2026-02-05T..."
}
```

### Worker Errors (si content-type invalide)
```json
{
  "event": "panel_fetch_error",
  "method": "POST",
  "path": "/api/staff/link/123...",
  "error": "Invalid content-type: expected application/json, got text/html",
  "textPreview": "<!DOCTYPE html>...",
  "timestamp": "2026-02-05T..."
}
```

---

## 📊 Résumé des Changements

| Fichier | Changement | Lignes |
|---------|-----------|--------|
| [app/api/staff/link/route.ts](app/api/staff/link/route.ts) | Accepter discordId depuis query/body multi-keys + debug | ~30 |
| [app/api/staff/link/[discordId]/route.ts](app/api/staff/link/[discordId]/route.ts) | Ajouter POST handler avec discordId dans URL | ~150 |
| [discord-worker/src/link.ts](discord-worker/src/link.ts) | Appeler /api/staff/link/${discordId} + logs | ~40 |

**Total**: ~220 lignes modifiées/ajoutées

---

## 🛡️ Sécurité Inchangée

- ✅ Double validation: middleware + route handler
- ✅ x-ingest-secret toujours vérifié
- ✅ Staff web UI inchangé (NextAuth RBAC)
- ✅ Pas de bypass non autorisé
- ✅ JSON-only pour workers (jamais HTML)

---

## 🚀 Déploiement

### 1. Panel Next.js
```bash
# Build déjà fait ✅
npm run build

# Restart
pm2 restart panel
# ou
docker-compose restart panel
```

### 2. Discord Worker
```bash
# Rebuild image
docker-compose build discord-worker

# Restart
docker-compose restart discord-worker

# Vérifier logs
docker logs discord-worker -f --tail 20
```

### 3. Vérifier Health
```bash
curl https://losesperados.xyz/api/health
# Expected: {"ok":true,"timestamp":"..."}
```

---

## ✅ Checklist de Validation

- [ ] `npm run build` passe sans erreurs
- [ ] curl POST /api/staff/link/{discordId} retourne JSON 200
- [ ] curl sans discordId retourne MISSING_DISCORD_ID avec debug
- [ ] Discord `/link @user` fonctionne sans erreur
- [ ] Logs worker montrent link_request/link_response
- [ ] Logs panel montrent debug si discordId manquant
- [ ] Staff web UI fonctionne normalement
- [ ] Pas de régression sur autres endpoints

---

## 🔧 Rollback (si problème)

```bash
# Panel
git checkout HEAD~1 app/api/staff/link/route.ts app/api/staff/link/[discordId]/route.ts
npm run build
pm2 restart panel

# Worker
git checkout HEAD~1 discord-worker/src/link.ts
docker-compose build discord-worker
docker-compose restart discord-worker
```

---

**Status**: ✅ Ready for Testing  
**Breaking Changes**: ❌ NO  
**Backward Compatible**: ✅ YES (accepte ancien body format)
