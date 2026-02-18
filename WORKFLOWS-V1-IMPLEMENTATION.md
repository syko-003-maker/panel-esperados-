# IMPLÉMENTATION COMPLÈTE: WORKFLOWS DISCORD V1 PRODUCTION-READY

## 📋 RÉSUMÉ DES CHANGEMENTS

Cette implémentation rend les interactions Discord production-ready pour 3 workflows critiques:
1. **LINK**: Modification safe avec anti-collisions + update embed
2. **RECRUTEMENTS**: Décisions (accept/refuse) + update DB + logs + idempotence
3. **PLAINTES**: Décisions (traité/non résolu/refusé) + update DB + logs + idempotence

## 🎯 OBJECTIFS ATTEINTS

### ✅ LINK — Modification Safe (Anti-Collision)
- Transaction Prisma collision-safe existante (`app/api/staff/link/[discordId]/route.ts`)
- Détection collisions: même Steam lié à autre Discord (bloque)
- Gestion erreurs avec classe `LinkConflictError`
- Update embed automatique après modification via `buildLinkPanelEmbed()`
- Logs structurés: `link_bind_start`, `link_submit_ok`, `link_bind_fail`

### ✅ RECRUTEMENTS — Workflow Complet
**Fichiers créés:**
- `app/api/discord/recruitment/decide/route.ts` — API décision (POST)
- `discord-worker/src/recruitment-decision.ts` — Handler Discord

**Fonctionnalités:**
- Boutons: APPROVE/REFUSE (customId: `recruitment:decide:DECISION:TICKETKEY`)
- Idempotence job-level via `JobRun` (clé: `RECRUITMENT_DECIDE:ticketKey:decision`)
- Vérification permissions staff (gradeLevel >= 5)
- Update DB: status → ACCEPTED/REJECTED, closedAt, closedByDiscordId
- Update embed Discord avec décision + disable boutons
- Post logs dans channel configuré (env: `RECRUITMENT_LOG_CHANNEL_ID`)
- Logs structurés: `recruitment_decide_start`, `recruitment_decide_success`, `recruitment_decide_api_failed`

### ✅ PLAINTES — Workflow Complet
**Fichiers créés:**
- `app/api/discord/complaint/decide/route.ts` — API décision (POST)
- `discord-worker/src/complaint-decision.ts` — Handler Discord

**Fonctionnalités:**
- Boutons: TRAITE/NON_RESOLU/REFUSE (customId: `complaint:decide:STATUS:TICKETKEY`)
- Compatible format legacy: `ticket:complaint:close:STATUS:TICKETKEY`
- Idempotence job-level via `JobRun` (clé: `COMPLAINT_DECIDE:ticketKey:decision`)
- Vérification permissions staff (gradeLevel >= 5)
- Update DB: status → RESOLVED/CLOSED/REJECTED, closedAt, closedByDiscordId
- Update embed Discord avec décision + disable boutons
- Post logs dans channel configuré (env: `COMPLAINT_LOG_CHANNEL_ID` ou `TICKETS_LOGS_CHANNEL_ID`)
- Logs structurés: `complaint_decide_start`, `complaint_decide_success`, `complaint_decide_api_failed`

### ✅ INFRASTRUCTURE: Idempotence Job-Level
**Fichiers créés:**
- `prisma/schema.prisma` — Ajout model `JobRun`
- `prisma/migrations/20260206130000_add_jobrun_idempotence/migration.sql`
- `discord-worker/src/lib/job-idempotence.ts` — Helpers

**Model JobRun:**
```prisma
model JobRun {
  id        String   @id @default(cuid())
  jobKey    String   @unique
  type      String
  status    String   // started|done|failed
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

**API:**
- `startJob(jobKey, type): Promise<boolean>` — Retourne false si duplicate
- `finishJob(jobKey, status)` — Marque job comme done/failed
- `getJobStatus(jobKey)` — Check statut (debug)

## 📂 FICHIERS MODIFIÉS/CRÉÉS

### Nouveaux fichiers (7)
```
✨ prisma/migrations/20260206130000_add_jobrun_idempotence/migration.sql
✨ discord-worker/src/lib/job-idempotence.ts
✨ discord-worker/src/recruitment-decision.ts
✨ discord-worker/src/complaint-decision.ts
✨ app/api/discord/recruitment/decide/route.ts
✨ app/api/discord/complaint/decide/route.ts
```

### Fichiers modifiés (2)
```
📝 prisma/schema.prisma — Ajout model JobRun
📝 discord-worker/src/index.ts — Router interactions mis à jour
```

## 🚀 DÉPLOIEMENT

### 1. Migration Base de Données
```bash
cd c:\panel-esperados\panel

# Générer client Prisma avec nouveau model
npx prisma generate

# Appliquer migration (dev)
npx prisma migrate dev --name add_jobrun_idempotence

# OU en production
npx prisma migrate deploy
```

### 2. Variables d'Environnement (Optionnel)
```bash
# Channels de logs (optionnel, fallback sur channels existants)
RECRUITMENT_LOG_CHANNEL_ID=1234567890123456789
COMPLAINT_LOG_CHANNEL_ID=1234567890123456789
```

### 3. Build & Restart
```bash
# Worker
cd discord-worker
npm run build
pm2 restart discord-worker

# Panel
cd ..
npm run build
pm2 restart panel
```

## 🧪 TESTS DE VALIDATION

### Test 1: Recrutement — Décision APPROVE
1. Créer un ticket recrutement dans Discord
2. Staff clique bouton "Approuver"
3. ✅ Embed mis à jour avec décision verte
4. ✅ Boutons disabled
5. ✅ Log posté dans channel recruitment logs
6. ✅ DB: `Recruitment.status = ACCEPTED`, `closedAt` rempli

### Test 2: Plainte — Décision TRAITE
1. Créer une plainte dans Discord
2. Staff clique bouton "Traité"
3. ✅ Embed mis à jour avec décision verte
4. ✅ Boutons disabled
5. ✅ Log posté dans channel complaint logs
6. ✅ DB: `Complaint.status = RESOLVED`, `closedAt` rempli

### Test 3: Idempotence — Double Click
1. Staff clique bouton décision
2. Pendant traitement, re-clique même bouton
3. ✅ Deuxième clic rejeté: "Cette décision a déjà été traitée"
4. ✅ Pas de double write en DB

### Test 4: Link — Collision Steam
1. User A lié à Steam X
2. User B tente de lier Steam X
3. ✅ Erreur: "Ce SteamID est déjà lié à un autre Discord"
4. ✅ Transaction rollback, pas de corruption

## 📊 ARCHITECTURE TECHNIQUE

### Flow Recrutement/Plainte
```
[Discord Button Click]
        ↓
[handleRecruitmentDecision/handleComplaintDecision]
        ↓
[startJob() — Idempotence Check]
        ↓ (si nouveau)
[POST /api/discord/{type}/decide — Verify Staff + Update DB]
        ↓
[interaction.update() — Refresh Embed + Disable Buttons]
        ↓
[postDecisionLog() — Send to Log Channel]
        ↓
[finishJob('done')]
```

### Flow Link (Existant)
```
[Modal Submit: steamId + rpName]
        ↓
[handleLinkModalSubmission]
        ↓
[POST /api/staff/link/{discordId}]
        ↓
[prisma.$transaction() — Check Collisions]
        ↓ (si collision Steam)
[Throw LinkConflictError("STEAM_ALREADY_LINKED")]
        ↓ (si OK)
[Update/Create Member]
        ↓
[buildLinkPanelEmbed() — Refresh Panel]
```

## 🔒 SÉCURITÉ

### API Routes Discord
- Authorization: Vérifie `Member.isActive = true` + `gradeLevel >= 5` (STAFF)
- Auth method: Discord ID passé par worker (interne)
- Pas d'accès public (pas de NextAuth, c'est machine-to-machine)

### Idempotence
- Clés uniques: `{TYPE}:{ticketKey}:{decision}`
- Contrainte DB: `JobRun.jobKey UNIQUE`
- Prevents: Double execution Discord retries, double clicks

### Collisions Link
- Transaction atomique: Check + Write
- Validate: `familyId_steamId` et `familyId_discordId` uniques
- Explicit error codes: `STEAM_ALREADY_LINKED`

## 📝 LOGS STRUCTURÉS

### Recruitment
```json
{"event":"recruitment_decide_start","ticketKey":"R-20260206-ABCD","decision":"APPROVE","staffDiscordId":"123","staffTag":"staff#1234"}
{"event":"recruitment_decide_success","ticketKey":"R-20260206-ABCD","decision":"APPROVE","staffDiscordId":"123"}
{"event":"recruitment_log_posted","ticketKey":"R-20260206-ABCD","channelId":"456"}
```

### Complaint
```json
{"event":"complaint_decide_start","ticketKey":"C-20260206-WXYZ","decision":"TRAITE","staffDiscordId":"123","staffTag":"staff#1234"}
{"event":"complaint_decide_success","ticketKey":"C-20260206-WXYZ","decision":"TRAITE","staffDiscordId":"123"}
{"event":"complaint_log_posted","ticketKey":"C-20260206-WXYZ","channelId":"789"}
```

### Job Idempotence
```json
{"event":"job_started","jobKey":"RECRUITMENT_DECIDE:R-20260206-ABCD:APPROVE","type":"RECRUITMENT_DECIDE"}
{"event":"job_deduped","jobKey":"RECRUITMENT_DECIDE:R-20260206-ABCD:APPROVE","type":"RECRUITMENT_DECIDE"}
{"event":"job_finished","jobKey":"RECRUITMENT_DECIDE:R-20260206-ABCD:APPROVE","status":"done"}
```

## 🐛 TROUBLESHOOTING

### Erreur: "Property 'jobRun' does not exist"
**Cause:** Prisma client pas régénéré après ajout model.
**Fix:**
```bash
npx prisma generate
npm run build
```

### Décision ne s'enregistre pas
**Check:**
1. Staff a bien `gradeLevel >= 5` en DB
2. Panel accessible depuis worker (`INGEST_BASE_URL`)
3. Logs API: `recruitment_decide_api_failed` ou `complaint_decide_api_failed`

### Embed ne se met pas à jour
**Check:**
1. Bot a permission `SendMessages` dans thread
2. Logs: `recruitment_message_update_failed` avec détails erreur
3. Fallback: message éphémère confirmant décision

### Logs pas postés dans channel
**Check:**
1. `RECRUITMENT_LOG_CHANNEL_ID` ou `COMPLAINT_LOG_CHANNEL_ID` configuré
2. Bot a permission `SendMessages` dans channel
3. Logs: `recruitment_log_channel_missing` ou `complaint_log_post_failed`

## ✅ CHECKLIST DÉPLOIEMENT

- [ ] Migration Prisma appliquée (`npx prisma migrate deploy`)
- [ ] Client Prisma régénéré (`npx prisma generate`)
- [ ] Worker build (`cd discord-worker && npm run build`)
- [ ] Panel build (`npm run build`)
- [ ] Worker redémarré (pm2/docker)
- [ ] Panel redémarré
- [ ] Test: Créer ticket recrutement + cliquer APPROVE
- [ ] Test: Créer plainte + cliquer TRAITE
- [ ] Test: Double-clic bouton → idempotence OK
- [ ] Test: Link collision → erreur propre
- [ ] Vérifier logs dans channels configurés

## 📚 RÉFÉRENCES

### CustomIds
- **Recruitment**: `recruitment:decide:APPROVE:TICKETKEY` ou `recruitment:decide:REFUSE:TICKETKEY`
- **Complaint**: `complaint:decide:TRAITE:TICKETKEY` ou `complaint:decide:NON_RESOLU:TICKETKEY` ou `complaint:decide:REFUSE:TICKETKEY`
- **Link**: `link:modal:submit` (existant)

### API Endpoints
- `POST /api/discord/recruitment/decide` — Body: `{ticketKey, decision, staffDiscordId}`
- `POST /api/discord/complaint/decide` — Body: `{ticketKey, decision, staffDiscordId}`
- `POST /api/staff/link/{discordId}` — Body: `{steamId, rpName}` (existant)

### Status Mappings
**Recruitment:**
- `APPROVE` → `status: ACCEPTED`
- `REFUSE` → `status: REJECTED`

**Complaint:**
- `TRAITE` → `status: RESOLVED`
- `NON_RESOLU` → `status: CLOSED`
- `REFUSE` → `status: REJECTED`

---

**Auteur:** GitHub Copilot  
**Date:** 2026-02-06  
**Version:** V1 Production-Ready  
**Status:** ✅ Implémentation Complète
