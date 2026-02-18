# GUIDE TECHNIQUE D'INTÉGRATION - Contact Notifications

## Architecture

```
┌─────────────────┐
│   Site Frontend │
│  (Next.js)      │
└────────┬────────┘
         │
         │ "Contacter le staff" click
         │ POST /api/discord/contact
         │
┌────────▼─────────────────────┐
│   Site Backend (Next.js API)  │
│  /api/discord/contact         │
│  → logs event                 │
└────────┬─────────────────────┘
         │
         │ forward to worker
         │ POST :3001/api/worker/contact-notification
         │
┌────────▼──────────────────────────┐
│   Discord Worker (Node.js)         │
│   HTTP Server on port 3001         │
│   /api/worker/contact-notification │
└────────┬───────────────────────────┘
         │
         │ send to Discord
         │
┌────────▼──────────────────┐
│   Discord (bots-famille)   │
│   1452869229295698025      │
└───────────────────────────┘
```

---

## 1. Endpoint Site: `/api/discord/contact`

**Location**: `app/api/discord/contact/route.ts`

```typescript
POST /api/discord/contact

Headers:
  Content-Type: application/json
  [Optional] Authorization: Bearer <WORKER_SECRET>
  [Optional] x-from-site: true

Body:
{
  "discordId": "user_id",
  "username": "username",
  "steamId": "steam_id",        // optional
  "rpName": "rp_name"           // optional
}

Response:
{
  "ok": true,
  "message": "Contact notification queued",
  "discordId": "user_id"
}
```

**Authentification**: 
- ✅ Pas requise (accessible depuis le site)
- Optionnelle depuis requêtes authentifiées

**Utilisation depuis le site**:
```javascript
async function notifyStaffContact(user) {
  const res = await fetch("/api/discord/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      discordId: user.discordId,
      username: user.username,
      steamId: user.steamId,
      rpName: user.rpName
    })
  });
  return res.json();
}
```

---

## 2. Endpoint Worker: `POST /api/worker/contact-notification`

**Location**: `discord-worker/src/http-server.ts`

**URL**: `http://localhost:3001/api/worker/contact-notification`

```typescript
POST /api/worker/contact-notification

Headers:
  Content-Type: application/json

Body:
{
  "discordId": "123456789",
  "username": "PlayerName",
  "steamId": "76561198123456789",    // optional
  "rpName": "Character Name"          // optional
}

Response (Succès):
{
  "ok": true,
  "message": "Contact notification sent",
  "discordId": "123456789"
}

Response (Erreur):
{
  "ok": false,
  "error": "BOTS_FAMILLE_CHANNEL_ID not found or not a text channel"
}
```

**Validation**:
- ✅ `discordId` - REQUIS
- ✅ `username` - REQUIS
- ⚠️ `steamId` - OPTIONNEL
- ⚠️ `rpName` - OPTIONNEL

**Authentification**:
- Optionnelle (Bearer token ou x-ingest-secret)
- Accepte requêtes non authentifiées du site

---

## 3. Message Discord

**Destination**: 
- Channel: `BOTS_FAMILLE_CHANNEL_ID` (1452869229295698025)
- Mentions: Recruteur, Chef famille, Etat Major

**Format**:
```
[ping] [ping] [ping]

📞 Demande de Contact
Un joueur souhaite contacter le staff

Discord: @username (discordId)
Discord ID: discordId
Steam ID: steamId (si fourni)
RP Name: rpName (si fourni)
```

**Couleur**: Orange (0xffa500)
**Timestamp**: Inclus

---

## 4. Configuration Environment

### Worker (.env.prod)
```bash
WORKER_HTTP_PORT=3001  # default
BOTS_FAMILLE_CHANNEL_ID=1452869229295698025
CONTACT_CHANNEL_ID=1312846003627622524
DISCORD_TOKEN=...
DISCORD_WORKER_SECRET=...  # optional
INGEST_SECRET=...
```

### Site (.env.local)
```bash
# Endpoint du worker (même domaine en prod)
NEXT_PUBLIC_WORKER_URL=http://localhost:3001

# Ou depuis le site lui-même:
INTERNAL_WORKER_URL=http://localhost:3001
```

---

## 5. Flux Complet

### 1. User clique "Contacter le staff"

```javascript
// Dans le composant site
async function handleContactStaff(user) {
  // Validation
  if (!user.discordId) {
    alert("Discord ID requis");
    return;
  }

  // Appel à l'endpoint site
  const res = await fetch("/api/discord/contact", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      discordId: user.discordId,
      username: user.username,
      steamId: user.steamId,
      rpName: user.rpName
    })
  });

  if (res.ok) {
    alert("✅ Notification envoyée au staff");
  } else {
    alert("❌ Erreur lors de l'envoi");
  }
}
```

### 2. Site reçoit la requête

```typescript
// POST /api/discord/contact
const body = await req.json();

// Log
console.log({
  event: "contact_notification_api",
  discordId: body.discordId,
  username: body.username
});

// Optionnellement: faire du forwarding au worker
// const workerRes = await fetch("http://localhost:3001/api/worker/contact-notification", ...);

return NextResponse.json({ ok: true });
```

### 3. Site envoie au worker (OPTIONNEL)

Actuellement, le site **loggue seulement**. Pour un flux complet:

```typescript
// POST /api/discord/contact (optionnel forwarding)
const workerRes = await fetch("http://localhost:3001/api/worker/contact-notification", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    discordId: body.discordId,
    username: body.username,
    steamId: body.steamId,
    rpName: body.rpName
  })
});

const result = await workerRes.json();
if (!result.ok) {
  console.error("Worker error:", result.error);
}
```

### 4. Worker reçoit et poste sur Discord

```typescript
// POST :3001/api/worker/contact-notification
export async function POST(req: Request) {
  const { discordId, username, steamId, rpName } = await req.json();
  
  // Appelle sendContactNotification()
  const result = await sendContactNotification(client, {
    discordId,
    username,
    steamId,
    rpName
  });
  
  return Response.json(result);
}
```

### 5. Discord reçoit le message

```
[Ping Recruteur] [Ping Chef famille] [Ping Etat Major]

📞 Demande de Contact
Un joueur souhaite contacter le staff

Discord: @PlayerName (123456789)
Discord ID: 123456789
Steam ID: 76561198123456789
RP Name: John Doe

[Timestamp: Jan 31, 2026 7:54 AM]
```

---

## 6. Tests

### Test avec cURL
```bash
curl -X POST http://localhost:3001/api/worker/contact-notification \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "123456789",
    "username": "TestPlayer",
    "steamId": "76561198123456789",
    "rpName": "Test Character"
  }'
```

### Test avec PowerShell
```powershell
$body = @{
    discordId = "123456789"
    username = "TestPlayer"
    steamId = "76561198123456789"
    rpName = "Test Character"
} | ConvertTo-Json

Invoke-WebRequest -Uri "http://localhost:3001/api/worker/contact-notification" `
    -Method POST `
    -Headers @{ "Content-Type" = "application/json" } `
    -Body $body
```

### Script fourni
```bash
# Scripts inclus
./discord-worker/test-contact-notification.sh   # Bash
./discord-worker/test-contact-notification.ps1  # PowerShell
```

---

## 7. Logs

### Site
```json
{
  "event": "contact_notification_api",
  "discordId": "123456789",
  "username": "TestPlayer",
  "hasSteamId": true,
  "hasRpName": true,
  "timestamp": "2026-01-31T07:54:36.000Z"
}
```

### Worker (succès)
```json
{
  "event": "contact_notification_sent",
  "discordId": "123456789",
  "username": "TestPlayer",
  "channel": "1452869229295698025",
  "timestamp": "2026-01-31T07:54:36.000Z"
}
```

### Worker (erreur)
```json
{
  "event": "contact_notification_failed",
  "error": "BOTS_FAMILLE_CHANNEL_ID not found",
  "discordId": "123456789",
  "timestamp": "2026-01-31T07:54:36.000Z"
}
```

---

## 8. Dépannage

### Le worker ne répond pas
```bash
# Vérifier que le worker tourne
ps aux | grep node

# Vérifier port 3001
netstat -an | grep 3001

# Lancer le worker
cd discord-worker
npm start
```

### L'endpoint retourne 404
```bash
# Vérifier que HTTP server est actif
curl http://localhost:3001/api/health

# Logs du worker
# Chercher "worker_http_server_started"
```

### Message n'apparaît pas sur Discord
```bash
# Vérifier les logs du worker
# Chercher "contact_notification_sent" ou "contact_notification_failed"

# Vérifier permissions du bot
# Bot doit avoir:
# - SendMessages dans bots-famille
# - MentionRoles pour les rôles
```

### Erreur "BOTS_FAMILLE_CHANNEL_ID not found"
```bash
# Vérifier que le bot a accès au canal
# Vérifier l'ID du canal (doit être 1452869229295698025)

# Relancer le worker pour recharger env
```

---

## 9. Sécurité

### Authentification
- ✅ Endpoint site: accessible sans auth (sécurisé via HTTPS)
- ✅ Endpoint worker: optionnel (mais peut valider Bearer token)
- ✅ Pas de données sensibles dans le body

### Rate limiting
- À implémenter si besoin (voir discord-worker/src/tickets.ts exemple)
- Actuellement pas de limite

### Validation
- ✅ discordId requis
- ✅ username requis
- ⚠️ steamId/rpName: aucune validation (passer as-is)

---

## 10. Exemple d'intégration complète

### React Component
```tsx
import { useState } from "react";

export function ContactStaffButton({ user }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleClick = async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/discord/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discordId: user.discordId,
          username: user.username,
          steamId: user.steamId,
          rpName: user.rpName
        })
      });

      if (!res.ok) throw new Error("Échec de l'envoi");
      
      alert("✅ Notification envoyée au staff");
    } catch (err) {
      setError(err.message);
      alert("❌ " + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button 
      onClick={handleClick} 
      disabled={loading}
      className="px-4 py-2 bg-blue-500 text-white rounded"
    >
      {loading ? "Envoi..." : "📞 Contacter le staff"}
    </button>
  );
}
```

---

**Documentation complète** ✅

