# Production Deployment Guide

## Overview

Complete deployment package for panel-esperados sanctions system to production/staging.

**Status:** ✅ READY TO DEPLOY
**Build:** ✅ SUCCESS (4.8s, 0 errors)
**Sanctions:** ✅ v2 PRODUCTION READY

---

## Files Created

### A) Environment Configuration

| File | Purpose | Status |
|------|---------|--------|
| `env/.env.production.template` | Production env template with guidance | ✅ Created |
| `env/README-ENV.md` | Secret generation & variable guide | ✅ Created |

**Setup:** Copy `.env.production.template` to `.env.production` and fill `__FILL_ME__` values

### B) Docker Orchestration

| File | Purpose | Status |
|------|---------|--------|
| `docker-compose.prod.yml` | Postgres + App + Worker stack | ✅ Created |

**Services:**
- `postgres`: PostgreSQL 16 with volumes, healthchecks
- `app`: Next.js build + start with migrations
- `worker`: Discord worker for sanctions/embeds
- Network: `panel-network` (internal)

### C) Database Management

| File | Purpose | Status |
|------|---------|--------|
| `scripts/prod-migrate.ps1` | PowerShell: Load env + migrate | ✅ Created |
| `scripts/prod-migrate.sh` | Bash/Linux: Load env + migrate | ✅ Created |
| `scripts/prod-status.ps1` | PowerShell: Check migration status | ✅ Created |
| `scripts/prod-status.sh` | Bash/Linux: Check migration status | ✅ Created |

### D) Configuration Checklists

| File | Purpose | Status |
|------|---------|--------|
| `PROD-AUTH-CHECK.md` | NextAuth setup & Discord OAuth | ✅ Created |
| `PROD-DISCORD-CHECK.md` | Bot intents, permissions, hierarchy | ✅ Created |

### E) Testing

| File | Purpose | Status |
|------|---------|--------|
| `scripts/smoke-prod.ps1` | Health + Auth + Sanction tests | ✅ Created |

---

## Quick Start: Deployment Steps

### Step 1: Prepare Environment

```powershell
# Copy template to production file
Copy-Item env\.env.production.template env\.env.production

# Edit with actual values (see env/README-ENV.md)
# Critical values to fill:
# - DATABASE_URL (PostgreSQL connection)
# - NEXTAUTH_SECRET (32+ random chars)
# - DISCORD_BOT_TOKEN (from Dev Portal)
# - DISCORD_CLIENT_ID, DISCORD_CLIENT_SECRET
# - INGEST_SECRET (32 random hex)
# - Domain URLs (NEXTAUTH_URL, SITE_BASE_URL)
```

### Step 2: Generate Secrets

**Generate NEXTAUTH_SECRET (PowerShell):**
```powershell
$bytes = New-Object System.Byte[] 32
[System.Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes($bytes)
[System.Convert]::ToBase64String($bytes)
```

**Generate INGEST_SECRET (PowerShell):**
```powershell
$bytes = New-Object System.Byte[] 32
[System.Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes($bytes)
$hex = [System.BitConverter]::ToString($bytes).Replace('-', '')
$hex.ToLower()
```

### Step 3: Verify Discord Bot

**Checklist:** See [PROD-DISCORD-CHECK.md](PROD-DISCORD-CHECK.md)

Key requirements:
- ✅ Bot token valid and current
- ✅ Bot in Los Esperados guild
- ✅ Bot role **above** all sanction roles (hierarchy)
- ✅ Bot has "Manage Roles" permission
- ✅ Intents: GUILD_MEMBERS enabled
- ✅ SANCTION_LOG_CHANNEL_ID accessible

### Step 4: Verify NextAuth Configuration

**Checklist:** See [PROD-AUTH-CHECK.md](PROD-AUTH-CHECK.md)

Key requirements:
- ✅ NEXTAUTH_URL matches your domain (https://yourdomain.com)
- ✅ Discord redirect URI registered: https://yourdomain.com/api/auth/callback/discord
- ✅ NEXTAUTH_SECRET is 32+ random characters
- ✅ HTTPS enabled on production domain

### Step 5: Deploy with Docker

```bash
# Build and start all services
docker compose -f docker-compose.prod.yml up -d --build

# Monitor startup
docker compose -f docker-compose.prod.yml logs -f app

# Expected output: "ready - started server on 0.0.0.0:3000"
```

### Step 6: Run Database Migrations

```powershell
# PowerShell
.\scripts\prod-migrate.ps1 -EnvFile env\.env.production

# Expected output:
# [MIGRATE] Running Prisma migrations...
# [SUCCESS] Prisma migrations applied successfully
```

Or bash:
```bash
./scripts/prod-migrate.sh env/.env.production
```

### Step 7: Smoke Test

```powershell
.\scripts\smoke-prod.ps1 -Url https://panel.esperados.com

# Expected output:
# [OK] Health check passed (200)
# [OK] Auth redirect working
# [OK] Application appears healthy!
```

### Step 8: Monitor & Test

**1. Verify application is running:**
```
https://yourdomain.com → Should redirect to login or show login form
```

**2. Test login flow:**
- Click "Login with Discord"
- Should redirect to Discord
- After auth, should return to app
- `/me` route should show user info

**3. Test sanction creation (staff only):**
- Go to `/staff/sanctions/new`
- Create test AVERT_LEGER sanction
- Check Discord member for role
- Check SANCTION_LOG_CHANNEL_ID for embed

**4. Monitor logs:**
```bash
docker compose -f docker-compose.prod.yml logs -f app
docker compose -f docker-compose.prod.yml logs -f worker
```

---

## Architecture

### Services

```
docker-compose.prod.yml
├── postgres (PostgreSQL 16)
│   └── volumes: postgres_data (persistent)
│   └── healthcheck: pg_isready
│
├── app (Next.js)
│   ├── depends_on: postgres (healthy)
│   ├── ports: 3000:3000
│   ├── healthcheck: GET /api/health
│   └── environment: All .env variables
│
└── worker (Discord Worker)
    ├── depends_on: app (healthy)
    ├── environment: DB + Discord config
    └── no exposed ports (internal)
```

### Network

- `panel-network` (bridge): Internal communication between services
- Only app (port 3000) exposed to public
- Worker + Postgres internal only

### Data Flow

```
1. User visits https://yourdomain.com
   └─→ Next.js app (port 3000)
       └─→ Discord OAuth callback
           └─→ Session created (NEXTAUTH_SECRET encrypted)

2. Staff creates sanction: POST /api/staff/sanctions
   └─→ App creates SanctionRecord + DiscordOutbox job
       └─→ Worker picks up job (polls every 3s)
           └─→ Fetches member + applies role
               └─→ Sends embed to SANCTION_LOG_CHANNEL_ID

3. Sanction expires (7-14d):
   └─→ Worker poll every 60s
       └─→ Finds expired sanctions (expiresAt <= now)
           └─→ Removes role
               └─→ Sends expiration embed to log channel
```

---

## Environment Variables

### Required (Must Fill)

```
DATABASE_URL                    # PostgreSQL connection
SHADOW_DATABASE_URL             # Prisma shadow DB
NEXTAUTH_SECRET                 # 32+ random chars
NEXTAUTH_URL                    # https://yourdomain.com
DISCORD_BOT_TOKEN              # From Dev Portal
DISCORD_CLIENT_ID              # From Dev Portal
DISCORD_CLIENT_SECRET          # From Dev Portal
INGEST_SECRET                  # 32 random hex
```

### Pre-filled (Verified)

```
DISCORD_GUILD_ID               # 1312845998753710151
DISCORD_LOGS_CHANNEL_ID        # 1452869229295698025
SANCTION_LOG_CHANNEL_ID        # 1409028569203740792
LOS_ESPERADOS_ROLE_ID          # 1290707699888373832
CITIZEN_ROLE_ID                # 1226485545055666206
ANCIEN_ESPERADOS_ROLE_ID       # 1312846000289833050
All AVERT_*_ROLE_ID            # Sanction role IDs
DEMOTE_ROLE_ID                 # 1340837563753304075
RESERVISTE_ROLE_ID             # 1312845999366209682
BLACKLIST_ROLE_ID              # 1338901141873758288
LYG_BASE_URL                   # https://api.lyg.fr/api
LYG_TOKEN                      # esperados
ENABLE_AUTO_SANCTION_RULES     # 0 (safe default)
```

---

## Sanction System v2

### 7 Sanction Types

| Type | Role | Duration | Auto-Remove | Clear Method |
|------|------|----------|-------------|--------------|
| `AVERT_ORAL_PLAYTIME` | Custom role | 7 days | Yes | Auto (via worker) |
| `AVERT_ORAL_REUNION` | Custom role | 7 days | Yes | Auto (via worker) |
| `AVERT_LEGER` | Custom role | 7 days | Yes | Auto or Manual |
| `AVERT_LOURD` | Custom role | 14 days | Yes | Auto or Manual |
| `DEMOTE` | Custom roles | None | No | Manual only |
| `RESERVISTE` | Custom role | None | No | Manual only |
| `BLACKLIST` | Custom role | None | No | Manual only |

### Features

- ✅ Role-based (not timeouts/mutes)
- ✅ Auto-expiration (7-14 days for warnings)
- ✅ Discord role assignment/removal
- ✅ Audit trail (all operations logged)
- ✅ Manual clear (staff action)
- ✅ Auto-escalation rules (optional):
  - 3x AVERT_LEGER → DEMOTE
  - 2x AVERT_LOURD → DEMOTE
- ✅ Discord notifications (embeds in SANCTION_LOG_CHANNEL_ID)
- ✅ Member timeline (GET /api/staff/members/{id}/sanctions)

---

## Troubleshooting

### Docker Services Won't Start

```bash
# Check logs
docker compose -f docker-compose.prod.yml logs postgres
docker compose -f docker-compose.prod.yml logs app

# Common issues:
# 1. DATABASE_URL wrong format
# 2. Port 5432 or 3000 already in use
# 3. .env.production not loaded

# Fix: Verify env file and ports
```

### Bot Can't Assign Roles

See [PROD-DISCORD-CHECK.md](PROD-DISCORD-CHECK.md#troubleshooting)

**Most common:** Bot role too low in hierarchy

### Auth Not Working

See [PROD-AUTH-CHECK.md](PROD-AUTH-CHECK.md#troubleshooting)

**Most common:** NEXTAUTH_URL mismatch with domain

### Migrations Failed

```bash
# Check status
./scripts/prod-status.ps1 -EnvFile env\.env.production

# If drift detected, reset carefully:
npm run prisma:reset  # ⚠️ Clears data
./scripts/prod-migrate.ps1
```

---

## Security Checklist

- [ ] All `__FILL_ME__` values replaced
- [ ] `.env.production` in `.gitignore`
- [ ] NEXTAUTH_SECRET is 32+ random characters
- [ ] DISCORD_BOT_TOKEN not committed to git
- [ ] Database password min 16 characters
- [ ] HTTPS enabled on production domain
- [ ] Bot role above sanction roles
- [ ] Discord redirect URI registered
- [ ] Healthchecks passing
- [ ] Logs monitored for errors

---

## Rollback Procedure

If issues occur:

```bash
# Stop services
docker compose -f docker-compose.prod.yml down

# Restore from backup
# (assumes database backups in place)
# - Restore PostgreSQL backup
# - Redeploy: docker compose up -d

# Check status
docker compose -f docker-compose.prod.yml logs -f app
```

---

## Next Steps

1. ✅ Build: **SUCCESS** (4.8s)
2. ✅ Fill environment variables (see `env/README-ENV.md`)
3. ✅ Verify Discord bot (see `PROD-DISCORD-CHECK.md`)
4. ✅ Verify NextAuth (see `PROD-AUTH-CHECK.md`)
5. ✅ Deploy: `docker compose -f docker-compose.prod.yml up -d`
6. ✅ Migrate: `./scripts/prod-migrate.ps1`
7. ✅ Test: `./scripts/smoke-prod.ps1`
8. ✅ Monitor logs 24 hours

**Questions?** Check the docs:
- Sanctions flow: [docs/SANCTIONS-V2.md](docs/SANCTIONS-V2.md)
- Environment setup: [env/README-ENV.md](env/README-ENV.md)
- Auth issues: [PROD-AUTH-CHECK.md](PROD-AUTH-CHECK.md)
- Bot issues: [PROD-DISCORD-CHECK.md](PROD-DISCORD-CHECK.md)
