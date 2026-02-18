# Discord Worker — Documentation

## Vue d'ensemble

Le Discord Worker est un service Node.js séparé qui gère :
- Le panneau de contact Discord (boutons Recrutement / Plainte)
- La création de threads tickets
- Les interactions staff (fermeture de tickets)
- La communication avec le Panel Next.js via l'API ingest

## Configuration Environnement

Créer un fichier `.env` dans `discord-worker/` :

```env
# Token du bot Discord
DISCORD_TOKEN=your_bot_token_here

# ID du serveur Discord
GUILD_ID=1312845998753710151

# IDs des salons
CONTACT_CHANNEL_ID=1312846003627622524       # Salon où le panneau Contact est posté
TICKETS_PARENT_CHANNEL_ID=1337799725662863380 # Salon parent pour les threads
TICKETS_LOGS_CHANNEL_ID=1337799814750142504   # Salon pour les logs de fermeture

# Panel / Ingest
INGEST_BASE_URL=https://votre-panel.example.com
INGEST_SECRET=votre-secret-super-long-random

# Rôle staff pour les pings (optionnel)
STAFF_ROLE_ID=

# URL de base du panel pour les liens "Ouvrir sur le Panel"
PANEL_BASE_URL=https://votre-panel.example.com

# Limite de tickets ouverts par utilisateur par type
TICKETS_OPEN_LIMIT=1

# Multi-family (par défaut: esperados)
FAMILY_ID=esperados
```

## Commandes

```bash
# Développement (hot reload)
npm run discord:dev

# Build production
npm run discord:build

# Démarrer en production
npm run discord:start
```

## Permissions Discord Requises

Le bot doit avoir les permissions suivantes sur le serveur :

| Permission | Obligatoire | Usage |
|------------|-------------|-------|
| `View Channels` | ✅ | Accès aux salons |
| `Send Messages` | ✅ | Envoyer le panneau contact |
| `Send Messages in Threads` | ✅ | Poster dans les threads |
| `Create Private Threads` | ⚠️ | Créer des threads privés (fallback public si absent) |
| `Manage Threads` | ⚠️ | Lock/archive les threads à la fermeture |
| `Read Message History` | ✅ | Upsert du panneau contact |
| `Embed Links` | ✅ | Afficher les embeds |
| `Use External Emojis` | ⚡ | Optionnel |

### Vérification au boot

Le worker vérifie les permissions au démarrage. Si les salons critiques ne sont pas accessibles, le worker **s'arrête** (hard fail).

## Healthcheck

Au démarrage, le worker effectue un healthcheck vers le Panel :
```
GET ${INGEST_BASE_URL}/api/health
```

- Si OK → log `panel_health_ok`
- Si KO → log `panel_health_warn` (continue quand même)

## Erreurs Fréquentes

### "Missing env: DISCORD_TOKEN"
→ Variable d'environnement manquante. Vérifier le fichier `.env`.

### "Channel not found"
→ L'ID du salon est incorrect ou le bot n'a pas accès.

### "Unauthorized" (ingest)
→ Le `INGEST_SECRET` ne correspond pas entre le worker et le Panel.

### "INGEST_SECRET not configured"
→ La variable `INGEST_SECRET` n'est pas définie côté Panel.

### Thread creation failed
→ Le bot n'a pas les permissions `Create Private Threads` ou `Send Messages in Threads`.

## Logs

Le worker produit des logs JSON structurés :

```json
{"event":"worker_ready","bot":"BotName#1234","timestamp":"..."}
{"event":"ticket_create","type":"recruitment","ticketKey":"R-20260120-XXXX","ingestOk":true,"timestamp":"..."}
{"event":"channel_access_failed","channel":"CONTACT","error":"...","timestamp":"..."}
```

## Architecture

```
discord-worker/
├── src/
│   ├── index.ts         # Point d'entrée, boot, interactions
│   ├── ids.ts           # Configuration IDs et constantes
│   ├── contactPanel.ts  # Upsert du panneau contact
│   ├── tickets.ts       # Modales, threads, fermeture
│   └── ingest.ts        # Communication HTTP avec le Panel
├── package.json
└── tsconfig.json
```

## Déploiement

### Option 1 : PM2

```bash
cd discord-worker
npm run build
pm2 start dist/index.js --name discord-worker
```

### Option 2 : Docker

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY dist ./dist
CMD ["node", "dist/index.js"]
```

### Option 3 : Systemd

```ini
[Unit]
Description=Discord Worker Esperados
After=network.target

[Service]
Type=simple
User=www-data
WorkingDirectory=/path/to/discord-worker
ExecStart=/usr/bin/node dist/index.js
Restart=always
EnvironmentFile=/path/to/discord-worker/.env

[Install]
WantedBy=multi-user.target
```
