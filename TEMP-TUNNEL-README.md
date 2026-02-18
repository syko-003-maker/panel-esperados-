# Cloudflare Tunnel - Temporary Deployment (2 Weeks)

## Overview

This guide helps you expose your local panel to HTTPS public access via Cloudflare Tunnel, **without opening any ports** on your router or firewall.

**Use Case:** Temporary production testing (2 weeks), secure remote access, demo to team

**Security:** Only port 3000 (web app) is exposed via tunnel. Database (5432) and worker remain local-only.

---

## 🚀 Quick Start (5 Steps)

### Step 1: Install Cloudflare Tunnel

```powershell
.\scripts\tunnel-install.ps1
```

**What it does:**
- Downloads `cloudflared.exe` (official Cloudflare binary)
- Places it in `bin/cloudflared.exe`
- Verifies installation

**Expected output:**
```
[OK] cloudflared.exe installed
[OK] cloudflared is working!
```

---

### Step 2: Login to Cloudflare

```powershell
.\scripts\tunnel-login.ps1
```

**What it does:**
- Opens browser to Cloudflare login
- Authenticates your account
- Stores credentials locally

**What you do:**
1. Log in to your Cloudflare account (or create free account)
2. Select domain (or skip for temporary URL)
3. Authorize cloudflared

---

### Step 3: Setup Environment

**Edit:** `env\.env.production.local`

**Fill in these values:**

```env
# 1. Copy from your .env.local (or generate new)
NEXTAUTH_SECRET=your_existing_secret_32_chars

# 2. Copy from your .env.local
DISCORD_BOT_TOKEN=your_bot_token
DISCORD_CLIENT_ID=your_client_id
DISCORD_CLIENT_SECRET=your_client_secret

# 3. Leave blank for now (will be filled after Step 4)
NEXTAUTH_URL=__FILL_ME__
SITE_BASE_URL=__FILL_ME__
DISCORD_API_BASE_URL=__FILL_ME__
```

---

### Step 4: Start Tunnel + App + Worker

```powershell
.\scripts\tunnel-start.ps1 -UseTryCloudflare
```

**What it does:**
1. Starts Cloudflare Tunnel (generates temporary HTTPS URL)
2. Builds & starts Next.js app (`npm run build` + `npm start`)
3. Starts Discord worker (`npm run discord:worker`)
4. Displays tunnel URL

**Expected output:**
```
[OK] Tunnel started
[OK] App started
[OK] Worker started

Tunnel URL: https://abc-def-ghi.trycloudflare.com

IMPORTANT: Update Discord OAuth Redirect URI:
  https://abc-def-ghi.trycloudflare.com/api/auth/callback/discord
```

**Copy the tunnel URL** (you'll need it for next steps)

---

### Step 5: Configure Discord OAuth

**Go to:** https://discord.com/developers/applications

1. Select your application
2. Go to **OAuth2** → **General** → **Redirects**
3. Click **Add Redirect**
4. Paste: `https://YOUR_TUNNEL_URL/api/auth/callback/discord`
   - Example: `https://abc-def-ghi.trycloudflare.com/api/auth/callback/discord`
5. Click **Save Changes**

**Then update your env file:**

Edit `env\.env.production.local`:
```env
NEXTAUTH_URL=https://abc-def-ghi.trycloudflare.com
SITE_BASE_URL=https://abc-def-ghi.trycloudflare.com
DISCORD_API_BASE_URL=https://abc-def-ghi.trycloudflare.com
```

**Restart services:**
```powershell
.\scripts\tunnel-stop.ps1
.\scripts\tunnel-start.ps1 -UseTryCloudflare -EnvFile env\.env.production.local
```

---

## ✅ Testing

### 1. Verify Health Check

```powershell
# PowerShell
Invoke-WebRequest -Uri "https://YOUR_TUNNEL_URL/api/health"

# Expected: StatusCode 200
```

### 2. Test Login

1. Open browser: `https://YOUR_TUNNEL_URL`
2. Click **Login with Discord**
3. Should redirect to Discord
4. After auth, should return to panel
5. Visit `/me` - should show your profile

### 3. Test Sanction System

**Create Sanction:**
1. Go to `/staff/sanctions/new`
2. Create test `AVERT_LEGER` sanction
3. Check Discord member - should have role
4. Check Discord channel (SANCTION_LOG_CHANNEL_ID) - should see embed

**Verify Timeline:**
1. Go to `/staff/members/{discordId}/sanctions`
2. Should see sanction history

---

## 🛠 Management Commands

### View Logs

```powershell
# Get all running job IDs
Get-Job

# View specific job logs
Receive-Job -Id <JOB_ID> -Keep

# Example:
Receive-Job -Id 1 -Keep  # Tunnel logs
Receive-Job -Id 2 -Keep  # App logs
Receive-Job -Id 3 -Keep  # Worker logs
```

### Stop All Services

```powershell
.\scripts\tunnel-stop.ps1
```

### Restart Services

```powershell
.\scripts\tunnel-stop.ps1
.\scripts\tunnel-start.ps1 -UseTryCloudflare -EnvFile env\.env.production.local
```

---

## 🔒 Security Notes

### What's Exposed

- ✅ Port 3000 (Next.js app) via HTTPS tunnel
- ❌ Port 5432 (PostgreSQL) - LOCAL ONLY
- ❌ Discord worker - LOCAL ONLY

### Tunnel URL Limitations

**trycloudflare.com URLs:**
- ✅ Free, no account required
- ✅ Instant setup
- ❌ URL changes on every restart
- ❌ Temporary (not for long-term production)

**For stable URL:**
Use Cloudflare domain + DNS setup (not covered here, see PROD-DEPLOY.md)

### Best Practices

- [ ] Never commit `.env.production.local` with secrets to git
- [ ] Keep tunnel running only when needed (stop when done)
- [ ] Monitor Discord logs for suspicious activity
- [ ] Use strong NEXTAUTH_SECRET (32+ random chars)
- [ ] Keep Discord bot token secure
- [ ] For long-term production, use proper domain + DNS

---

## 🐛 Troubleshooting

### Tunnel URL Not Displayed

**Symptom:** `tunnel-start.ps1` doesn't show URL

**Fix:**
```powershell
# Get job logs manually
Get-Job
Receive-Job -Id <TUNNEL_JOB_ID> -Keep

# Look for line like:
# "Your tunnel is available at https://..."
```

### Login Redirect Loop

**Symptom:** Login redirects to Discord but never comes back

**Cause:** NEXTAUTH_URL mismatch or Discord redirect URI not set

**Fix:**
1. Verify NEXTAUTH_URL in `env\.env.production.local` matches tunnel URL exactly
2. Verify Discord redirect URI includes `/api/auth/callback/discord`
3. Restart services after changes

### Health Check Fails

**Symptom:** GET /api/health returns error or timeout

**Cause:** App not started or still building

**Fix:**
```powershell
# Check app job logs
Get-Job
Receive-Job -Id <APP_JOB_ID> -Keep

# Look for "ready - started server on 0.0.0.0:3000"
# If not ready, wait 10-30 seconds and retry
```

### Discord Bot Can't Assign Roles

**Symptom:** Sanction created but role not applied

**Cause:** Bot permissions or role hierarchy

**Fix:** See [PROD-DISCORD-CHECK.md](PROD-DISCORD-CHECK.md)
- Bot must have "Manage Roles" permission
- Bot role must be **above** sanction roles in hierarchy

---

## 📊 Architecture

```
┌─────────────────────────────────────┐
│   YOUR PC (localhost)               │
│                                     │
│  ┌──────────────┐                  │
│  │  PostgreSQL  │                  │
│  │  :5432       │ ← LOCAL ONLY     │
│  └──────────────┘                  │
│         ↑                           │
│  ┌──────────────┐                  │
│  │  Next.js     │                  │
│  │  :3000       │ ← Tunnel points  │
│  └──────────────┘    here          │
│         ↑                           │
│  ┌──────────────┐                  │
│  │  Worker      │ ← LOCAL ONLY     │
│  │  (Discord)   │                  │
│  └──────────────┘                  │
│         ↑                           │
│  ┌──────────────┐                  │
│  │ cloudflared  │                  │
│  │  .exe        │                  │
│  └──────────────┘                  │
└─────────────────┼───────────────────┘
                  │
                  │ Encrypted HTTPS
                  │ (Cloudflare network)
                  ↓
          ┌────────────────┐
          │  Cloudflare    │
          │  Edge Network  │
          └────────────────┘
                  ↓
          Public Internet
   https://abc-def.trycloudflare.com
```

---

## 📚 Related Documentation

- **Production Deploy:** [PROD-DEPLOY.md](PROD-DEPLOY.md) - Full production setup with Docker
- **Auth Setup:** [PROD-AUTH-CHECK.md](PROD-AUTH-CHECK.md) - NextAuth configuration
- **Discord Bot:** [PROD-DISCORD-CHECK.md](PROD-DISCORD-CHECK.md) - Bot permissions & roles
- **Sanctions v2:** [docs/SANCTIONS-V2.md](docs/SANCTIONS-V2.md) - Feature documentation

---

## ⏱ Temporary Deployment Notes

**Duration:** Recommended max 2 weeks

**Limitations:**
- trycloudflare URL changes on restart (not stable)
- No custom domain (unless you configure DNS)
- Not suitable for long-term production

**For permanent deployment:**
Use full production setup (see PROD-DEPLOY.md) with:
- Cloudflare domain + DNS
- Docker containers
- Persistent tunnel configuration
- Load balancing / high availability

---

## 🆘 Support

**Issues with tunnel?**
- Check logs: `Receive-Job -Id <JOB_ID> -Keep`
- Verify cloudflared version: `.\bin\cloudflared.exe --version`
- Cloudflare docs: https://developers.cloudflare.com/cloudflare-one/connections/connect-apps/

**Issues with app/auth?**
- See [PROD-AUTH-CHECK.md](PROD-AUTH-CHECK.md)
- Check NEXTAUTH_URL matches tunnel URL exactly
- Verify Discord redirect URI configured

**Issues with sanctions?**
- See [docs/SANCTIONS-V2.md](docs/SANCTIONS-V2.md)
- Check bot role hierarchy
- Verify SANCTION_LOG_CHANNEL_ID accessible
