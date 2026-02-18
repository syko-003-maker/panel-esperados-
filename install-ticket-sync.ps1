# 🚀 Discord Ticket Sync MVP - Commandes PowerShell

# IMPORTANT: Arrêtez d'abord le serveur dev (Ctrl+C dans le terminal npm run dev)

# ================================================
# ÉTAPE 1: Migration DB
# ================================================

npx prisma migrate dev --name ticket_sync

# ================================================
# ÉTAPE 2: Génération client Prisma
# ================================================

npx prisma generate

# ================================================
# ÉTAPE 3: Vérification config Discord
# ================================================

# Connectez-vous à votre DB et exécutez:
<#
SELECT "complaintsChannelId", "recruitmentChannelId"
FROM "DiscordConfig"
WHERE "familyId" = 'esperados';

# Si NULL, mettez à jour:
UPDATE "DiscordConfig"
SET
  "complaintsChannelId" = 'VOTRE_CHANNEL_ID_PLAINTES',
  "recruitmentChannelId" = 'VOTRE_CHANNEL_ID_RECRUTEMENTS'
WHERE "familyId" = 'esperados';
#>

# ================================================
# ÉTAPE 4: Démarrer Next.js (Terminal 1)
# ================================================

npm run dev

# ================================================
# ÉTAPE 5: Démarrer Worker Discord (Terminal 2)
# ================================================

# Dans un NOUVEAU terminal PowerShell:
npm run discord:worker

# ================================================
# LOGS ATTENDUS
# ================================================

# Worker Discord:
# [discord-worker] ready as YourBot#1234

# Next.js:
# ✓ Ready in Xms

# ================================================
# TEST RAPIDE
# ================================================

# 1. Aller sur /staff/complaints ou /staff/recruitments
# 2. Créer une nouvelle plainte/recrutement
# 3. Aller sur la page de détail
# 4. Cliquer "Charger" dans "Conversation Discord"
# 5. Vérifier que le thread Discord a été créé
# 6. Ajouter des messages dans le thread
# 7. Cliquer "🔄 Rafraîchir"
# 8. Attendre 2-3 secondes
# 9. Cliquer "Charger" à nouveau
# 10. Vérifier que les nouveaux messages apparaissent

# ================================================
# DOCUMENTATION
# ================================================

# - docs/SETUP-TICKET-SYNC.md (guide complet)
# - docs/discord-ticket-sync-mvp.md (architecture)
# - TICKET-SYNC-SUMMARY.md (résumé)

Write-Host "✅ Commandes copiées ! Exécutez-les dans l'ordre." -ForegroundColor Green
