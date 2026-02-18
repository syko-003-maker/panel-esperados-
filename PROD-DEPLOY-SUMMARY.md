# PROD DEPLOY PACK - Résumé Exécution

**Date:** 2026-01-31  
**Status:** ✅ COMPLET  
**Build:** ✅ SUCCESS (4.8s compilation, 0 errors)

---

## Fichiers Créés (11 fichiers)

### A) Environment Configuration (2 files)
- ✅ `env/.env.production.template` - Template production avec guidance
- ✅ `env/README-ENV.md` - Guide génération secrets (NEXTAUTH_SECRET, INGEST_SECRET)

### B) Docker Orchestration (1 file)
- ✅ `docker-compose.prod.yml` - Stack complète (postgres + app + worker)
  - Services: postgres (healthcheck), app (depends_on postgres), worker (depends_on app)
  - Volumes: postgres_data (persistent), app_logs, worker_logs
  - Network: panel-network (bridge, internal)
  - Ports: 3000 (app only, postgres/worker internal)

### C) Database Scripts (4 files)
- ✅ `scripts/prod-migrate.ps1` - Migration PowerShell (load env + prisma migrate deploy)
- ✅ `scripts/prod-migrate.sh` - Migration Bash/Linux
- ✅ `scripts/prod-status.ps1` - Status PowerShell
- ✅ `scripts/prod-status.sh` - Status Bash/Linux

### D) Configuration Checklists (2 files)
- ✅ `PROD-AUTH-CHECK.md` - NextAuth setup complet
  - NEXTAUTH_SECRET generation
  - NEXTAUTH_URL matching
  - Discord OAuth redirect URI
  - Testing login flow
- ✅ `PROD-DISCORD-CHECK.md` - Discord Bot setup complet
  - Bot token & intents (GUILD_MEMBERS)
  - Permissions requises (Manage Roles, Send Messages, Embed Links)
  - Hiérarchie des rôles (bot role doit être AU-DESSUS des sanctions)
  - Channels (SANCTION_LOG_CHANNEL_ID)
  - Testing sanction operations

### E) Smoke Testing (1 file)
- ✅ `scripts/smoke-prod.ps1` - Tests post-deploy
  - Health check: GET /api/health
  - Auth redirect: GET / (should redirect)
  - Database: Configuration loaded
  - Sanction ops: Instructions pour test manuel

### F) Documentation (1 file)
- ✅ `PROD-DEPLOY.md` - Guide déploiement complet
  - Quick start (8 steps)
  - Architecture overview
  - Secrets required + pre-filled
  - Troubleshooting
  - Rollback procedure
  - Security checklist

---

## Commandes de Déploiement

### Quick Deploy (8 steps)

```bash
# 1. Setup env
Copy-Item env\.env.production.template env\.env.production
# Edit .env.production with actual values

# 2. Generate secrets
# NEXTAUTH_SECRET: openssl rand -base64 32
# INGEST_SECRET: openssl rand -hex 32

# 3. Verify Discord (see PROD-DISCORD-CHECK.md)
# - Bot token valid
# - Bot in guild
# - Bot role above sanction roles
# - Intents: GUILD_MEMBERS

# 4. Verify NextAuth (see PROD-AUTH-CHECK.md)
# - NEXTAUTH_URL matches domain
# - Redirect URI registered
# - HTTPS enabled

# 5. Deploy with Docker
docker compose -f docker-compose.prod.yml up -d --build

# 6. Run migrations
.\scripts\prod-migrate.ps1 -EnvFile env\.env.production

# 7. Smoke test
.\scripts\smoke-prod.ps1 -Url https://yourdomain.com

# 8. Monitor
docker compose -f docker-compose.prod.yml logs -f app
```

---

## Variables Pré-remplies (18)

```
✓ DISCORD_GUILD_ID=1312845998753710151
✓ DISCORD_LOGS_CHANNEL_ID=1452869229295698025
✓ SANCTION_LOG_CHANNEL_ID=1409028569203740792
✓ LOS_ESPERADOS_ROLE_ID=1290707699888373832
✓ CITIZEN_ROLE_ID=1226485545055666206
✓ ANCIEN_ESPERADOS_ROLE_ID=1312846000289833050
✓ AVERT_ORAL_PLAYTIME_ROLE_ID=1343272798231199836
✓ AVERT_ORAL_REUNION_ROLE_ID=1343272736331665500
✓ AVERT_LEGER_ROLE_ID=1312845999340781640
✓ AVERT_LOURD_ROLE_ID=1312845999340781641
✓ DEMOTE_ROLE_ID=1340837563753304075
✓ RESERVISTE_ROLE_ID=1312845999366209682
✓ BLACKLIST_ROLE_ID=1338901141873758288
✓ LYG_BASE_URL=https://api.lyg.fr/api
✓ LYG_TOKEN=esperados
✓ ENABLE_AUTO_SANCTION_RULES=0 (safe default)
✓ NODE_ENV=production
✓ NEXT_PUBLIC_DISCORD_GUILD_ID=1312845998753710151
```

---

## À Remplir Avant Déploiement (15)

| Variable | Type | Où obtenir |
|----------|------|-----------|
| DATABASE_URL | Secret | PostgreSQL provider |
| SHADOW_DATABASE_URL | Secret | PostgreSQL provider |
| NEXTAUTH_SECRET | Secret | Générer: openssl rand -base64 32 |
| NEXTAUTH_URL | Config | Votre domaine (https://panel.esperados.com) |
| DISCORD_BOT_TOKEN | Secret | Discord Dev Portal > Bot > TOKEN |
| DISCORD_CLIENT_ID | Config | Discord Dev Portal > CLIENT ID |
| DISCORD_CLIENT_SECRET | Secret | Discord Dev Portal > CLIENT SECRET |
| POSTGRES_DB | Config | Nom base prod |
| POSTGRES_USER | Config | User PostgreSQL |
| POSTGRES_PASSWORD | Secret | Password PostgreSQL |
| DISCORD_TICKET_CATEGORY_ID | Config | Discord guild ID |
| DISCORD_TICKETS_CHANNEL_ID | Config | Discord channel ID |
| STAFF_ROLE_ID | Config | Discord role ID |
| SITE_BASE_URL | Config | Votre domaine HTTPS |
| DISCORD_API_BASE_URL | Config | Votre domaine HTTPS |
| INGEST_SECRET | Secret | Générer: openssl rand -hex 32 |

---

## Architecture Déployée

```
┌─────────────────────────────────────┐
│   docker-compose.prod.yml           │
├─────────────────────────────────────┤
│                                     │
│  ┌──────────────┐                  │
│  │  postgres    │                  │
│  │  pg:16       │                  │
│  │  5432 (int)  │ ← healthcheck     │
│  └──────────────┘                  │
│         ↑                           │
│  ┌──────────────┐                  │
│  │   app        │                  │
│  │  Next.js     │                  │
│  │  3000 (pub)  │ ← healthcheck     │
│  └──────────────┘                  │
│         ↑                           │
│  ┌──────────────┐                  │
│  │   worker     │                  │
│  │  Discord     │ ← internal only   │
│  │  (no port)   │                  │
│  └──────────────┘                  │
│                                     │
│  Network: panel-network (bridge)   │
│  Volumes: postgres_data (persistent)
└─────────────────────────────────────┘
```

**Data Flow:**
1. User → HTTPS:3000 (app)
2. App → postgres (healthcheck)
3. App → Discord API (OAuth, roles)
4. Worker ← App (depends_on healthy)
5. Worker → Discord (apply sanctions, send embeds)

---

## Sanctions v2 Features

✅ 7 types (AVERT_*, DEMOTE, RESERVISTE, BLACKLIST)  
✅ Auto-expiration (7-14 jours, via worker 60s polling)  
✅ Role-based (pas de timeouts/mutes)  
✅ Audit trail complète (AuditLog)  
✅ Manual clear API + UI ("Retirer maintenant")  
✅ Member timeline (GET /api/staff/members/{id}/sanctions)  
✅ Auto-escalation rules (optional, disabled by default)  
✅ Discord notifications (embeds in SANCTION_LOG_CHANNEL_ID)  

---

## Pre-Deploy Checklists

### PROD-AUTH-CHECK.md
- [ ] NEXTAUTH_SECRET: 32+ chars, unique per env
- [ ] NEXTAUTH_URL: https://yourdomain.com (no slash)
- [ ] Discord Client ID/Secret: Valid, from Dev Portal
- [ ] Redirect URI: yourdomain.com/api/auth/callback/discord registered
- [ ] HTTPS: Valid certificate, not self-signed

### PROD-DISCORD-CHECK.md
- [ ] Bot Token: Valid, recent
- [ ] Bot Intents: GUILD_MEMBERS enabled
- [ ] Bot Permissions: Manage Roles, Send Messages, Embed Links
- [ ] Bot Role: POSITIONED ABOVE all sanction roles
- [ ] SANCTION_LOG_CHANNEL_ID: Bot can post embeds
- [ ] All role IDs: Exist in guild

---

## Testing Post-Deploy

### Smoke Test
```bash
.\scripts\smoke-prod.ps1 -Url https://yourdomain.com
```

Expected:
```
[OK] Health check passed (200)
[OK] Auth redirect working
[OK] Application appears healthy!
```

### Manual Tests
1. **Login:** https://yourdomain.com → Discord OAuth
2. **Sanction:** /staff/sanctions/new → Create AVERT_LEGER
3. **Discord:** Check member has role in guild
4. **Logs:** Check SANCTION_LOG_CHANNEL_ID for embed

---

## Security Checklist

- [ ] .env.production NOT in git (.gitignore ✓)
- [ ] All __FILL_ME__ replaced
- [ ] NEXTAUTH_SECRET unique, 32+ chars
- [ ] DISCORD_BOT_TOKEN not in git
- [ ] DATABASE_URL points to PROD
- [ ] HTTPS enabled
- [ ] Bot role above sanction roles
- [ ] Secrets backed up securely
- [ ] Logs monitored 24h post-deploy

---

## Fichiers de Référence

- `PROD-DEPLOY.md` - Guide complet avec architecture
- `PROD-AUTH-CHECK.md` - NextAuth checklist
- `PROD-DISCORD-CHECK.md` - Discord Bot checklist
- `env/README-ENV.md` - Génération secrets
- `docs/SANCTIONS-V2.md` - Feature documentation (400+ lines)

---

## Build Status

```
✅ Compiled successfully in 4.8s
✅ TypeScript: PASS (0 errors)
✅ Routes: 134 compiled
✅ Exit code: 0
```

**Ready for production deployment! 🚀**

---

## Contacts & Support

- **Sanctions bugs:** Check AuditLog for failed operations
- **Auth issues:** PROD-AUTH-CHECK.md
- **Bot issues:** PROD-DISCORD-CHECK.md
- **Deployment issues:** PROD-DEPLOY.md troubleshooting
- **Database issues:** `./scripts/prod-status.ps1`
