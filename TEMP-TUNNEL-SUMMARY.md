# TEMP TUNNEL DEPLOYMENT - Summary

**Date:** 2026-01-31  
**Status:** ✅ COMPLETE  
**Build:** ✅ SUCCESS (5.3s, 0 errors)  
**Purpose:** Temporary HTTPS public access via Cloudflare Tunnel (2 weeks)

---

## 📦 Files Created (7 files)

### A) PowerShell Scripts (5)

1. ✅ **scripts/tunnel-install.ps1**
   - Downloads cloudflared.exe (Windows x64)
   - Verifies installation
   - Places binary in `bin/cloudflared.exe`

2. ✅ **scripts/tunnel-login.ps1**
   - Authenticates Cloudflare account
   - Opens browser for login
   - Stores credentials locally

3. ✅ **scripts/tunnel-create.ps1**
   - Creates named tunnel: "panel-esperados-temp"
   - Generates config.yml
   - Supports `-UseTryCloudflare` for temporary URLs

4. ✅ **scripts/tunnel-start.ps1**
   - Starts Cloudflare Tunnel
   - Builds & starts Next.js app (port 3000)
   - Starts Discord worker
   - Displays tunnel URL + redirect URI instructions
   - Monitors services (CTRL+C to stop)

5. ✅ **scripts/tunnel-stop.ps1**
   - Stops all jobs (tunnel, app, worker)
   - Cleans up processes

### B) Environment Configuration (1)

6. ✅ **env/.env.production.local**
   - Based on `.env.local.prod-ready.example`
   - Pre-filled: Guild IDs, Role IDs, Channel IDs
   - To fill: NEXTAUTH_SECRET, DISCORD tokens, NEXTAUTH_URL
   - Critical notes for Discord redirect URI setup

### C) Documentation (1)

7. ✅ **TEMP-TUNNEL-README.md**
   - 5-step quick start guide
   - Testing instructions
   - Troubleshooting section
   - Security notes
   - Architecture diagram

---

## 🚀 Deployment Commands (5 Steps)

### Step 1: Install
```powershell
.\scripts\tunnel-install.ps1
```
Downloads cloudflared.exe to `bin/`

### Step 2: Login
```powershell
.\scripts\tunnel-login.ps1
```
Authenticates with Cloudflare (opens browser)

### Step 3: Configure Env
Edit `env\.env.production.local`:
```env
NEXTAUTH_SECRET=your_32_char_secret
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret
```

### Step 4: Start Tunnel
```powershell
.\scripts\tunnel-start.ps1 -UseTryCloudflare -EnvFile env\.env.production.local
```
Starts tunnel + app + worker, displays URL

### Step 5: Configure Discord
1. Copy tunnel URL from output
2. Go to https://discord.com/developers/applications
3. Add redirect URI: `https://YOUR_TUNNEL_URL/api/auth/callback/discord`
4. Update env file with tunnel URL
5. Restart: `.\scripts\tunnel-stop.ps1` then `tunnel-start.ps1`

---

## 🔒 Security Architecture

### What's Exposed
- ✅ Port 3000 (Next.js app) → HTTPS tunnel
- ❌ Port 5432 (PostgreSQL) → LOCAL ONLY
- ❌ Discord worker → LOCAL ONLY

### Tunnel Flow
```
Internet → Cloudflare Edge → Encrypted Tunnel → localhost:3000
```

### Key Security Features
- No port forwarding required
- Database never exposed
- Worker runs locally
- Cloudflare DDoS protection
- Automatic HTTPS/TLS

---

## 📊 Configuration Details

### Pre-filled Variables (18)
```
✓ DISCORD_GUILD_ID=1312845998753710151
✓ DISCORD_LOGS_CHANNEL_ID=1452869229295698025
✓ SANCTION_LOG_CHANNEL_ID=1409028569203740792
✓ LOS_ESPERADOS_ROLE_ID=1290707699888373832
✓ CITIZEN_ROLE_ID=1226485545055666206
✓ ANCIEN_ESPERADOS_ROLE_ID=1312846000289833050
✓ AVERT_* role IDs (7 sanction roles)
✓ DEMOTE_ROLE_ID=1340837563753304075
✓ RESERVISTE_ROLE_ID=1312845999366209682
✓ BLACKLIST_ROLE_ID=1338901141873758288
✓ LYG_BASE_URL, LYG_TOKEN
✓ ENABLE_AUTO_SANCTION_RULES=0 (safe)
✓ NODE_ENV=production
✓ DATABASE_URL (localhost PostgreSQL)
```

### To Fill (6 critical)
```
◽ NEXTAUTH_SECRET - 32+ random chars
◽ NEXTAUTH_URL - Tunnel URL (after start)
◽ DISCORD_BOT_TOKEN - From Dev Portal
◽ DISCORD_CLIENT_ID - From Dev Portal
◽ DISCORD_CLIENT_SECRET - From Dev Portal
◽ SITE_BASE_URL - Same as NEXTAUTH_URL
◽ DISCORD_API_BASE_URL - Same as NEXTAUTH_URL
```

---

## ✅ Testing Checklist

### Health Check
```powershell
Invoke-WebRequest -Uri "https://YOUR_TUNNEL_URL/api/health"
# Expected: 200 OK
```

### Login Flow
1. Visit `https://YOUR_TUNNEL_URL`
2. Click "Login with Discord"
3. Authenticate
4. Should return to panel
5. Visit `/me` - should show profile

### Sanction System
1. Go to `/staff/sanctions/new`
2. Create `AVERT_LEGER` test sanction
3. Check Discord member - should have role
4. Check SANCTION_LOG_CHANNEL_ID - should see embed

---

## 🛠 Management

### View Logs
```powershell
Get-Job  # List all jobs
Receive-Job -Id 1 -Keep  # Tunnel logs
Receive-Job -Id 2 -Keep  # App logs
Receive-Job -Id 3 -Keep  # Worker logs
```

### Stop Services
```powershell
.\scripts\tunnel-stop.ps1
```

### Restart
```powershell
.\scripts\tunnel-stop.ps1
.\scripts\tunnel-start.ps1 -UseTryCloudflare -EnvFile env\.env.production.local
```

---

## ⚠️ Limitations (trycloudflare)

| Feature | trycloudflare | Custom Domain |
|---------|---------------|---------------|
| Cost | Free | Cloudflare plan required |
| Setup | Instant | DNS configuration |
| URL Stability | Changes on restart | Permanent |
| Custom Domain | No | Yes |
| SSL/TLS | Auto | Auto |
| DDoS Protection | Yes | Yes |
| Max Duration | Temporary | Unlimited |

**Recommendation:** Use trycloudflare for:
- Testing (2 weeks)
- Demos
- Temporary remote access

Use custom domain for:
- Long-term production
- Stable URLs
- Professional deployment

---

## 🐛 Troubleshooting

### Tunnel URL Not Displayed
**Symptom:** `tunnel-start.ps1` doesn't show URL

**Fix:**
```powershell
Get-Job
Receive-Job -Id <TUNNEL_JOB_ID> -Keep
# Look for: "Your tunnel is available at https://..."
```

### Login Redirect Loop
**Cause:** NEXTAUTH_URL mismatch

**Fix:**
1. Verify NEXTAUTH_URL in env matches tunnel URL exactly
2. Verify Discord redirect URI includes `/api/auth/callback/discord`
3. Restart services

### Health Check Fails
**Cause:** App still starting

**Fix:**
```powershell
Receive-Job -Id <APP_JOB_ID> -Keep
# Wait for: "ready - started server on 0.0.0.0:3000"
```

---

## 📚 Related Documentation

- **Full Guide:** [TEMP-TUNNEL-README.md](TEMP-TUNNEL-README.md) - Complete 5-step guide
- **Production Deploy:** [PROD-DEPLOY.md](PROD-DEPLOY.md) - Docker + custom domain setup
- **Auth Config:** [PROD-AUTH-CHECK.md](PROD-AUTH-CHECK.md) - NextAuth troubleshooting
- **Discord Bot:** [PROD-DISCORD-CHECK.md](PROD-DISCORD-CHECK.md) - Permissions & hierarchy
- **Sanctions v2:** [docs/SANCTIONS-V2.md](docs/SANCTIONS-V2.md) - Feature docs

---

## 📈 Next Steps

**After testing (2 weeks):**

If tunnel works well and you want permanent deployment:
1. ✅ Follow [PROD-DEPLOY.md](PROD-DEPLOY.md)
2. ✅ Configure custom Cloudflare domain
3. ✅ Setup DNS records
4. ✅ Use named tunnel (not trycloudflare)
5. ✅ Deploy to VPS/cloud (Docker Compose)

**For continued testing:**
1. ✅ Keep using tunnel as-is
2. ✅ Restart tunnel when needed (URL may change)
3. ✅ Update Discord redirect URI each restart
4. ✅ Monitor logs regularly

---

## ✅ Status Summary

| Component | Status |
|-----------|--------|
| Scripts | ✅ 5 scripts created |
| Environment | ✅ Template created |
| Documentation | ✅ Complete guide |
| Build | ✅ SUCCESS (5.3s) |
| Security | ✅ Local DB only |
| **Ready to Deploy** | ✅ YES |

---

## 🎯 Exact Commands to Run

```powershell
# 1. Install cloudflared
.\scripts\tunnel-install.ps1

# 2. Login to Cloudflare
.\scripts\tunnel-login.ps1

# 3. Edit env file
# Edit: env\.env.production.local
# Fill: NEXTAUTH_SECRET, DISCORD_BOT_TOKEN, etc.

# 4. Start everything
.\scripts\tunnel-start.ps1 -UseTryCloudflare -EnvFile env\.env.production.local

# 5. Copy tunnel URL from output, update:
# - env\.env.production.local (NEXTAUTH_URL)
# - Discord Dev Portal (redirect URI)

# 6. Restart
.\scripts\tunnel-stop.ps1
.\scripts\tunnel-start.ps1 -UseTryCloudflare -EnvFile env\.env.production.local

# 7. Test
# Visit: https://YOUR_TUNNEL_URL
# Login, test sanctions, verify logs
```

**Done! Panel is now accessible via HTTPS tunnel.** 🚀
