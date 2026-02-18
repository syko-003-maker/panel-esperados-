# Environment Variables - Production Deployment Guide

## Overview

This guide explains how to set up `.env.production` for production/staging deployment.

## Files

- `.env.production.template` - Template with all variables and guidance
- `.env.production` - Actual secrets (NOT in git, create manually or via CI/CD)

## Critical Secrets (Must Generate)

### 1. NEXTAUTH_SECRET (32+ characters, unique per environment)

Generate a new secret for each environment:

**Linux/Mac:**
```bash
openssl rand -base64 32
```

**PowerShell:**
```powershell
$bytes = New-Object System.Byte[] 32
[System.Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes($bytes)
[System.Convert]::ToBase64String($bytes)
```

**Online (if secure):**
https://1password.com/password-generator/ (min 32 characters, mixed case)

### 2. INGEST_SECRET (32-byte hex, for webhook integrity)

Generate:

**Linux/Mac:**
```bash
openssl rand -hex 32
```

**PowerShell:**
```powershell
$bytes = New-Object System.Byte[] 32
[System.Security.Cryptography.RNGCryptoServiceProvider]::new().GetBytes($bytes)
$hex = [System.BitConverter]::ToString($bytes).Replace('-', '')
$hex.ToLower()
```

### 3. Discord Bot Token (from Discord Developer Portal)

1. Go to https://discord.com/developers/applications
2. Select your application
3. Go to "Bot" section
4. Click "Copy Token" (under USERNAME)
5. ⚠️ Never commit or share this token

### 4. Discord Client ID & Client Secret

1. Same portal, go to "OAuth2" > "General"
2. Copy CLIENT ID
3. Copy CLIENT SECRET
4. ⚠️ Never commit CLIENT SECRET to git

### 5. Database URL

Format: `postgresql://user:password@host:5432/dbname?schema=public`

- Obtain from your PostgreSQL provider (AWS RDS, Heroku, etc.)
- Separate shadow database strongly recommended (for Prisma migrations)

## Variables Already Pre-filled

These are discovered from the codebase and safe to use:

- `DISCORD_GUILD_ID` - Los Esperados guild
- `DISCORD_LOGS_CHANNEL_ID` - General logs
- `SANCTION_LOG_CHANNEL_ID` - Sanction audit logs
- All `*_ROLE_ID` variables (hardcoded in apps/discord/worker.ts)
- `LYG_BASE_URL`, `LYG_TOKEN` - LYG API
- `ENABLE_AUTO_SANCTION_RULES=0` - Safe default (disabled)

## Variables From Your Infrastructure

Get these from your actual production environment:

- `DATABASE_URL`, `SHADOW_DATABASE_URL` - PostgreSQL host
- `POSTGRES_PASSWORD` - DB credentials
- `NEXTAUTH_URL` - Your production domain (https://panel.esperados.example.com)
- `SITE_BASE_URL`, `DISCORD_API_BASE_URL` - Your production domain
- `DISCORD_TICKET_CATEGORY_ID`, `DISCORD_TICKETS_CHANNEL_ID` - From Discord guild
- `STAFF_ROLE_ID` - From Discord guild

## Quick Setup

1. Copy `.env.production.template` to `.env.production`
2. Generate and fill in all `__FILL_ME__` values
3. Ensure `.env.production` is in `.gitignore`
4. Verify with `scripts/prod-migrate.ps1` or `.sh`
5. Test with `scripts/smoke-prod.ps1`

## Security Checklist

- [ ] NEXTAUTH_SECRET - 32+ characters, never reused
- [ ] All tokens/secrets not in git
- [ ] DATABASE_URL points to production database
- [ ] DISCORD_BOT_TOKEN is valid and recent
- [ ] NEXTAUTH_URL matches Discord OAuth callback URI
- [ ] No test/staging values in production
