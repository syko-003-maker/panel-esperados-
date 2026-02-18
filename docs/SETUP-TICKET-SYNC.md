# 🚀 Discord Ticket Sync MVP - GUIDE D'INSTALLATION

## ✅ IMPLÉMENTATION TERMINÉE

Tous les fichiers ont été créés/modifiés. Suivez ces étapes pour activer le système.

---

## 📋 ÉTAPE 1: Migration de la base de données

### Arrêter le serveur dev (si actif)
```bash
# Dans le terminal où tourne `npm run dev`, faire Ctrl+C
```

### Appliquer la migration
```bash
npx prisma migrate dev --name ticket_sync
```

**Ce que fait cette migration:**
- ✅ Crée la table `TicketMessage`
- ✅ Ajoute `ticketChannelId`, `lastSyncedMessageId`, `lastSyncedAt` sur `Complaint`
- ✅ Ajoute `ticketChannelId`, `lastSyncedMessageId`, `lastSyncedAt` sur `Recruitment`

### Générer le client Prisma
```bash
npx prisma generate
```

---

## 📋 ÉTAPE 2: Vérifier la configuration Discord

Dans votre base de données, vérifiez que `DiscordConfig` (familyId=esperados) contient:

```sql
SELECT 
  complaintsChannelId,
  recruitmentChannelId
FROM "DiscordConfig"
WHERE "familyId" = 'esperados';
```

**Si NULL**, mettez à jour:
```sql
UPDATE "DiscordConfig"
SET 
  "complaintsChannelId" = 'VOTRE_CHANNEL_ID_PLAINTES',
  "recruitmentChannelId" = 'VOTRE_CHANNEL_ID_RECRUTEMENTS'
WHERE "familyId" = 'esperados';
```

> **Note**: Ce sont les channels **parents** où seront créés les threads.

---

## 📋 ÉTAPE 3: Démarrer les services

### Terminal 1: Serveur Next.js
```bash
npm run dev
```

### Terminal 2: Worker Discord
```bash
npm run discord:worker
```

**Logs attendus:**
```
[discord-worker] ready as YourBot#1234
```

---

## 🧪 ÉTAPE 4: Test du système

### A) Créer un ticket manuellement (optionnel)

**Via API (Postman/curl):**
```bash
POST http://localhost:3000/api/staff/tickets/create
Content-Type: application/json

{
  "ticketKind": "COMPLAINT",
  "ticketId": "cm...",
  "title": "Test plainte",
  "description": "Test description",
  "authorDiscordId": "123456789",
  "authorRpName": "John Doe",
  "targetName": "Jane Doe"
}
```

**Logs worker attendus:**
```
[discord-worker] TICKET_CREATE ok kind=COMPLAINT ticketId=cm... threadId=1234567890
```

### B) Vérifier la création du thread Discord

1. Aller dans le channel parent sur Discord
2. Vérifier qu'un thread a été créé avec le nom `Plainte-Test plainte`
3. Vérifier l'embed initial dans le thread

### C) Synchroniser les messages

1. **UI**: Aller sur la page de détail de la plainte (`/staff/complaints/[id]`)
2. **Cliquer** sur "Charger" dans la section "Conversation Discord"
3. **Ajouter des messages** manuellement dans le thread Discord
4. **Cliquer** sur "🔄 Rafraîchir"
5. **Attendre 2-3 secondes** puis cliquer à nouveau sur "Charger"
6. **Vérifier** que les nouveaux messages apparaissent

**Logs worker attendus:**
```
[discord-worker] syncSingleTicket saved 3 messages for COMPLAINT cm...
[discord-worker] TICKET_SYNC completed kind=COMPLAINT ticketId=cm...
```

---

## 🔍 LOGS À SURVEILLER

### Worker Discord (`npm run discord:worker`)

**Création de ticket:**
```
[discord-worker] TICKET_CREATE ok kind=COMPLAINT ticketId=cm... threadId=1234...
```

**Synchronisation:**
```
[discord-worker] syncSingleTicket saved 5 messages for COMPLAINT cm...
[discord-worker] TICKET_SYNC completed kind=COMPLAINT ticketId=cm...
```

**Erreurs:**
```
[discord-worker] TICKET_CREATE DiscordConfig not found
[discord-worker] TICKET_CREATE missing COMPLAINT channelId in config
```

### API Next.js

**Création:**
```
[api/staff/tickets/create] Created ticket job for COMPLAINT cm...
```

**Sync:**
```
[api/staff/tickets/sync] Created sync job for COMPLAINT cm... thread=1234...
```

---

## ⚙️ CONFIGURATION AVANCÉE

### Sync automatique périodique (optionnel)

Pour sync tous les tickets ouverts automatiquement, ajoutez dans `apps/discord/worker.ts`:

```typescript
// Dans la fonction runDiscordWorker, après setInterval(poll, ...)
setInterval(() => {
  // Créer job sync global toutes les 5 minutes
  prisma.discordOutbox.create({
    data: {
      familyId: "esperados",
      type: "SANCTION_NOTIFY",
      entityId: "global-sync",
      status: "PENDING",
      attempt: 0,
      nextAttemptAt: new Date(),
      meta: { kind: "TICKET_SYNC" }, // Pas de ticketKind/ticketId = sync global
    },
  }).catch(err => console.error("[discord-worker] Failed to create global sync:", err));
}, 5 * 60 * 1000); // 5 minutes
```

---

## 🐛 TROUBLESHOOTING

### Erreur: "Channel not found"
**Cause**: `complaintsChannelId` ou `recruitmentChannelId` invalide
**Solution**: Vérifier les IDs dans `DiscordConfig`

### Erreur: "Thread creation failed"
**Cause**: Channel parent n'est pas un TextChannel
**Solution**: Le channel parent doit être un salon textuel classique

### Messages ne se synchronisent pas
**Cause**: `lastSyncedMessageId` incorrect ou thread archivé
**Solution**: 
1. Vérifier que le thread n'est pas archivé
2. Réinitialiser `lastSyncedMessageId` à NULL dans la DB

### Worker ne traite pas les jobs
**Cause**: Type de job non géré
**Solution**: Vérifier que `type=SANCTION_NOTIFY` et `meta.kind` est correct

---

## 📊 STRUCTURE DES DONNÉES

### Table TicketMessage
```
id: cm...
ticketKind: "COMPLAINT"
ticketId: "cm123..."
discordMessageId: "1234567890"
authorDiscordId: "987654321"
authorTag: "user#1234"
content: "Ceci est un message de test"
createdAt: 2026-01-22T10:30:00Z
isDeleted: false
familyId: "esperados"
```

### Complaint/Recruitment (nouveaux champs)
```
ticketKey: "1234567890" (threadId)
discordThreadId: "1234567890"
ticketChannelId: "9876543210" (parent channel)
lastSyncedMessageId: "1111111111"
lastSyncedAt: 2026-01-22T10:35:00Z
```

---

## ✅ CHECKLIST DE VALIDATION

- [ ] Migration appliquée (`npx prisma migrate dev`)
- [ ] Client Prisma généré (`npx prisma generate`)
- [ ] `DiscordConfig` configuré avec les bons channel IDs
- [ ] Worker Discord démarre sans erreur
- [ ] Serveur Next.js démarre sans erreur
- [ ] Création manuelle d'un ticket fonctionne
- [ ] Thread Discord créé automatiquement
- [ ] Embed initial posté dans le thread
- [ ] Messages synchronisés depuis Discord vers DB
- [ ] UI affiche la conversation correctement
- [ ] Bouton "Rafraîchir" fonctionne

---

## 🎯 PROCHAINES ÉTAPES (Post-MVP)

1. **Auto-création**: Brancher `TICKET_CREATE` lors de la création de plaintes/recrutements via UI
2. **Sync périodique**: Activer le sync global automatique toutes les X minutes
3. **Webhooks Discord**: Remplacer le polling par des webhooks (si besoin de real-time)
4. **UI améliorée**: Afficher les pièces jointes, réactions, embeds
5. **Notifications**: Notifier le staff quand un nouveau message arrive

---

## 📞 SUPPORT

En cas de problème, vérifier:
1. Logs du worker Discord
2. Logs de l'API Next.js (console serveur)
3. Logs du navigateur (console client)
4. État de la table `DiscordOutbox` (jobs en PENDING/FAILED)

**Commande SQL utile:**
```sql
SELECT * FROM "DiscordOutbox" 
WHERE status != 'SENT' 
ORDER BY "createdAt" DESC 
LIMIT 10;
```

---

**MVP PRÊT ! 🚀**
