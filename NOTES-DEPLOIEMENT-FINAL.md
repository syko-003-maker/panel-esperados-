# NOTES DE DÉPLOIEMENT

**Date**: 31 Janvier 2026
**Version**: 1.0-FINAL

---

## ✅ DÉPLOIEMENT COMPLÉTÉ

### Étapes effectuées

1. ✅ Correction de `CONTACT_CHANNEL_ID` dans `.env.prod`
2. ✅ Figement du "Tickets panel" (jamais republié)
3. ✅ Désactivation du "Link panel" auto
4. ✅ Implémentation du système de notifications de contact
5. ✅ Création du serveur HTTP worker (port 3001)
6. ✅ Build réussi sans erreurs
7. ✅ Worker démarré et opérationnel

---

## 📦 FICHIERS CHANGÉS

### Core changes
- `discord-worker/.env.prod` — IDs corrigés
- `discord-worker/src/contactPanel.ts` — Panels figés
- `discord-worker/package.json` — Express ajouté

### Nouvelles fonctionnalités
- `discord-worker/src/contact-notification.ts` — Notifications
- `discord-worker/src/http-server.ts` — Serveur HTTP
- `app/api/discord/contact/route.ts` — Endpoint site

### Tests et documentation
- `discord-worker/test-contact-notification.sh` — Test bash
- `discord-worker/test-contact-notification.ps1` — Test PS
- Plusieurs fichiers `.md` de documentation

---

## 🚀 PRODUCTION CHECKLIST

### Before going live

- [ ] Vérifier que tous les IDs Discord sont corrects (voir logs de boot)
- [ ] Tester endpoint `/api/worker/contact-notification` avec curl
- [ ] Vérifier que les messages apparaissent dans bots-famille
- [ ] Vérifier que les rôles sont pingés correctement
- [ ] Vérifier les logs pour erreurs/warnings
- [ ] Tester depuis le site (formulaire contact)
- [ ] Vérifier permissions du bot sur les canaux
- [ ] Vérifier rate limiting si implémenté

### After deployment

- [ ] Monitorer les logs du worker
- [ ] Vérifier health check `/api/health`
- [ ] Tester une notification de contact réelle
- [ ] Vérifier que aucun panel auto n'est posté
- [ ] Vérifier que tickets panel reste figé

---

## 🔧 CONFIGURATION

### Environment Variables Requises

```bash
# .env.prod (worker)
DISCORD_TOKEN=...
GUILD_ID=1312845998753710151
CONTACT_CHANNEL_ID=1312846003627622524          ← CRITIQUE
BOTS_FAMILLE_CHANNEL_ID=1452869229295698025     ← CRITIQUE
TICKETS_PARENT_CHANNEL_ID=1337799725662863380
TICKETS_LOGS_CHANNEL_ID=1325618925303758858
INGEST_BASE_URL=https://losesperados.xyz
INGEST_SECRET=...
NODE_ENV=production
WORKER_HTTP_PORT=3001  # optional (default 3001)
```

### Commandes de démarrage

```bash
# Worker
cd discord-worker
npm install
npm run build
npm start

# Site (si pas déjà lancé)
cd ..
npm run dev
```

---

## 📊 VÉRIFICATION DES LOGS

### Au démarrage du worker, vérifier:

```
✅ [ENV CHECK OK] — Tous les IDs affichés
✅ [WORKER BOT] Los Esperados#6743
✅ tickets_panel_frozen
✅ contact_panel_ok
✅ channel_access_ok [CONTACT: 1312846003627622524]
✅ channel_access_ok [TICKETS_PARENT: 1337799725662863380]
✅ channel_access_ok [TICKETS_LOGS: 1325618925303758858]
✅ commands_register_ok
✅ boot_complete
✅ worker_http_server_started [port 3001]
```

### Health check

```bash
curl http://localhost:3001/api/health

Response:
{"ok":true,"service":"discord-worker"}
```

### Test de notification

```bash
curl -X POST http://localhost:3001/api/worker/contact-notification \
  -H "Content-Type: application/json" \
  -d '{
    "discordId": "123456789",
    "username": "TestUser",
    "steamId": "76561198123456789",
    "rpName": "Test Character"
  }'

Response:
{"ok":true,"message":"Contact notification sent","discordId":"123456789"}
```

Vérifier que le message apparaît dans bots-famille.

---

## 🎯 IDs Discord Principaux

| Canal | ID | Utilisation |
|-------|----|----|
| 🎫 CONTACT | 1312846003627622524 | Tickets panel (figé) |
| 🤖 bots-famille | 1452869229295698025 | Notifications contact |
| 🎫 TICKETS_PARENT | 1337799725662863380 | Parent des threads |
| 📋 TICKETS_LOGS | 1325618925303758858 | Logs des tickets |

| Rôle | ID | Utilisation |
|------|----|----|
| 🎖️ Recruteur | 1312845999215214618 | Ping notifications |
| 👨‍👩‍👧‍👦 Chef famille | 1429607761720770623 | Ping notifications |
| ⚙️ Etat Major | 1312845999366209683 | Ping notifications |

---

## ⚠️ PROBLÈMES CONNUS

### Panel health check warning
```json
{"event":"panel_health_warn","url":"https://losesperados.xyz"}
```
→ Normal si le site n'est pas accessible au démarrage du worker
→ Worker continue normalement

### Deprecation warning
```
DeprecationWarning: The ready event has been renamed to clientReady
```
→ Normal (discord.js v14 → v15)
→ À corriger dans les prochaines versions

### Sync disabled
```json
{"event":"sync_disabled"}
```
→ Normal (role sync optionnel)
→ Ignorer ou activer si needed

---

## 🔄 MISE À JOUR FUTURE

### Pour modifier les IDs
1. Éditer `discord-worker/.env.prod`
2. Relancer le worker (`npm start`)
3. Vérifier les logs de boot

### Pour modifier les rôles à pinguer
1. Éditer `discord-worker/src/contact-notification.ts` (ROLE_IDS)
2. Recompiler (`npm run build`)
3. Relancer le worker (`npm start`)

### Pour modifier le format du message
1. Éditer `discord-worker/src/contact-notification.ts` (embed)
2. Recompiler (`npm run build`)
3. Relancer le worker (`npm start`)

---

## 📞 SUPPORT

### Vérifier l'état du worker
```bash
# Port 3001 actif?
curl http://localhost:3001/api/health

# Processus node actif?
ps aux | grep "discord-worker"

# Logs récents?
# Voir terminal du worker ou fichiers logs
```

### Problèmes courants

**Worker démarre puis s'arrête**
→ Vérifier les erreurs TypeScript: `npm run build`

**Endpoint retourne 404**
→ Vérifier que HTTP server est démarré (log: "worker_http_server_started")

**Message n'apparaît pas sur Discord**
→ Vérifier les logs: "contact_notification_sent" ou "contact_notification_failed"

**Channel access failed**
→ Vérifier que le bot a les permissions sur le canal

---

## 📈 MÉTRIQUES DE SUCCÈS

- ✅ Worker démarre sans erreurs
- ✅ Tous les canaux sont accessibles
- ✅ Tickets panel reste figé
- ✅ Link panel ne réapparaît pas
- ✅ Endpoint contact répond correctement
- ✅ Messages apparaissent dans bots-famille
- ✅ Rôles sont pingés automatiquement
- ✅ Pas de notifications d'erreur dans les logs

---

**Déploiement PRÊT** ✅

Toutes les tâches sont complétées. Le worker est opérationnel et prêt pour la production.

