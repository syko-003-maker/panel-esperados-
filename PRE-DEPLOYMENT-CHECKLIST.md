# ✅ DEPLOYMENT CHECKLIST — Los Esperados

**Date:** January 31, 2026  
**Status:** Ready for Production

---

## Pre-Deployment (System)

### Node.js & npm
- [ ] Node.js v18+ installed (`node --version`)
- [ ] npm v9+ installed (`npm --version`)
- [ ] Global npm cache clean (`npm cache clean --force`)

### PostgreSQL
- [ ] PostgreSQL 16+ running
- [ ] Accessible on `127.0.0.1:5434`
- [ ] Database `postgres` exists
- [ ] User `postgres` with password `postgres`
- [ ] Test connection: `psql -h 127.0.0.1 -p 5434 -U postgres -c "SELECT 1"`

### Cloudflare
- [ ] cloudflared CLI installed (`cloudflared --version`)
- [ ] Logged in with `cloudflared tunnel login`
- [ ] Credentials file exists: `~/.cloudflared/cd2a0e2d-f3c1-4866-ae84-8115817b154a.json`
- [ ] Tunnel exists: `cloudflared tunnel list | grep los-esperados`

### Network
- [ ] Internet connectivity confirmed
- [ ] No firewall blocking port 3000
- [ ] No VPN preventing Cloudflare connection
- [ ] DNS configured (losesperados.xyz pointing to Cloudflare)

---

## Configuration Files

### Project Files
- [ ] `.env.prod` exists in project root
- [ ] `.env.prod` contains all required variables:
  - [ ] `NEXTAUTH_URL=https://losesperados.xyz`
  - [ ] `NEXTAUTH_SECRET` set
  - [ ] `DISCORD_CLIENT_ID` set
  - [ ] `DISCORD_CLIENT_SECRET` set
  - [ ] `DISCORD_BOT_TOKEN` set
  - [ ] `DATABASE_URL` set
- [ ] `.cloudflared-config.yml` exists in project root
- [ ] `start-prod.ps1` exists (Windows)
- [ ] `start-prod.sh` exists (Linux/macOS)

### Cloudflare Tunnel Config
- [ ] `~/.cloudflared/config.yml` copied or setup complete
- [ ] Contains tunnel ID: `cd2a0e2d-f3c1-4866-ae84-8115817b154a`
- [ ] Routes configured:
  - [ ] `losesperados.xyz`
  - [ ] `www.losesperados.xyz`
  - [ ] Fallback 404 rule

---

## Code Readiness

### Build
- [ ] `npm run build` succeeds (5-6 seconds)
- [ ] No TypeScript errors
- [ ] No ESLint warnings
- [ ] `.next/` directory created with optimized bundle

### Dependencies
- [ ] `npm install` completed in main project
- [ ] `npm install` completed in `discord-worker/`
- [ ] All dependencies installed (no ERR messages)
- [ ] `concurrently` in devDependencies

### Package.json
- [ ] `npm run start:prod` script defined
- [ ] Points to: `concurrently --names ... "npm run start" "npm run discord:start" "cloudflared tunnel run los-esperados"`
- [ ] All existing scripts still present (dev, build, start, etc.)

---

## Environment & Security

### Secrets
- [ ] `NEXTAUTH_SECRET` is strong (min 32 chars)
- [ ] `NEXTAUTH_SECRET` ≠ `DATABASE_PASSWORD`
- [ ] No secrets hardcoded in code
- [ ] `.env.prod` added to `.gitignore`
- [ ] No `.env.prod` in git history

### Authentication
- [ ] Discord OAuth app exists
- [ ] `DISCORD_CLIENT_ID` matches app ID
- [ ] `DISCORD_CLIENT_SECRET` matches app secret
- [ ] OAuth redirect URI registered: `https://losesperados.xyz/api/auth/callback/discord`
- [ ] Bot token is valid and recent

### Database
- [ ] `DATABASE_URL` points to correct PostgreSQL instance
- [ ] Schema exists and is up-to-date
- [ ] Migrations applied successfully
- [ ] Test query succeeds: `SELECT COUNT(*) FROM "User"`

---

## Infrastructure

### Tunnel
- [ ] Tunnel name: `los-esperados`
- [ ] Tunnel ID: `cd2a0e2d-f3c1-4866-ae84-8115817b154a`
- [ ] Status: Active (test with `cloudflared tunnel info los-esperados`)
- [ ] No competing tunnels or routes
- [ ] Config file has correct indentation (YAML)

### Domain
- [ ] `losesperados.xyz` DNS records point to Cloudflare
- [ ] Nameservers updated to Cloudflare
- [ ] CNAME for `www.losesperados.xyz` → `losesperados.xyz`
- [ ] SSL/TLS enabled (Full or Full Strict)
- [ ] Page rules configured (if needed)

### Networking
- [ ] Port 3000 not used by other services
- [ ] Ports 8000, 8001 available (if tunnel debug needed)
- [ ] Firewall allows outbound HTTPS (port 443)
- [ ] No proxy/VPN blocking Cloudflare tunnel

---

## Discord Bot

### Bot Configuration
- [ ] Bot token is valid and recent
- [ ] Guild ID matches: `1312845998753710151`
- [ ] Bot in guild with required permissions:
  - [ ] View Channels
  - [ ] Send Messages
  - [ ] Manage Messages
  - [ ] React to Messages
  - [ ] Read Message History
- [ ] Bot role is higher than target roles

### Worker Code
- [ ] `discord-worker/src/index.ts` exists and compiles
- [ ] `npm run discord:build` succeeds
- [ ] `npm run discord:start` works in isolation
- [ ] No hardcoded localhost URLs
- [ ] Uses environment variables for config

### Roles & Permissions
- [ ] Chef Famille role ID configured: `408937062838829056`
- [ ] Owner ID configured: `408937062838829056`
- [ ] Roles exist in Discord server
- [ ] Bot can see and check member roles

---

## Testing Pre-Deployment

### Local Build Test
- [ ] `npm run build` — ✅ Succeeds in 5-6 seconds
- [ ] No errors in output
- [ ] No warnings (except expected ones)
- [ ] `.next/` folder created with optimized output

### Local Dev Test
- [ ] `npm run dev` — ✅ Starts on :3000
- [ ] Page loads at `http://localhost:3000`
- [ ] Sign-in works with Discord
- [ ] Dashboard accessible after auth
- [ ] Stop with Ctrl+C — ✅ Clean shutdown

### Database Test
```bash
psql -h 127.0.0.1 -p 5434 -U postgres -d postgres -c \
  "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public'"
# Expected: Some number > 0 (tables exist)
```

### Cloudflare Test
```bash
cloudflared tunnel info los-esperados
# Expected: Shows tunnel ID, account, routes
```

---

## Deployment Day

### Morning Briefing
- [ ] All team members informed
- [ ] Maintenance window scheduled (if needed)
- [ ] Rollback plan reviewed
- [ ] Communication channel open

### Final Checks (30 min before)
- [ ] All checklist items above: ✅ Complete
- [ ] Build successful: `npm run build` ✅
- [ ] PostgreSQL running: `psql ... SELECT 1` ✅
- [ ] cloudflared version checked: `cloudflared --version` ✅
- [ ] Tunnel credentials verified: `ls ~/.cloudflared/...` ✅

### Deployment (T-0)
```bash
cd /path/to/panel-esperados/panel

# Run deployment
npm run start:prod

# Wait for all 3 services to start (10-15 seconds)
# Check for errors in console output
```

### Validation (T+1 min)
- [ ] Console shows no ERROR messages
- [ ] `[next]` service running
- [ ] `[worker]` service running
- [ ] `[tunnel]` service shows "Route 1" and "Route 2"
- [ ] Can access `https://losesperados.xyz` in browser
- [ ] Page loads without errors
- [ ] Sign-in button visible

### Smoke Tests (T+2-3 min)
- [ ] Navigate to `https://losesperados.xyz`
- [ ] Click "Sign in" → Discord OAuth flow
- [ ] Authorize Discord app
- [ ] Redirects back to dashboard
- [ ] Can see user info and role
- [ ] Try Discord command in server (if bot has commands)
- [ ] Bot responds without errors

### Health Checks (T+5 min)
- [ ] No errors in console
- [ ] Database queries working (check logs)
- [ ] Bot handling events (check Discord)
- [ ] Cloudflare showing traffic in dashboard
- [ ] HTTPS certificate valid (no browser warnings)

### Production Verification (T+10 min)
- [ ] All 3 services still running
- [ ] No memory leaks (RAM stable)
- [ ] CPU usage normal (< 50%)
- [ ] Network traffic as expected
- [ ] All users can access
- [ ] OAuth flow works for multiple users
- [ ] Bot responds to commands consistently

---

## Post-Deployment

### Monitoring (First Hour)
- [ ] Watch console for errors
- [ ] Monitor Discord bot status
- [ ] Check Cloudflare dashboard
- [ ] Test critical workflows
- [ ] Have team ready to rollback if needed

### Monitoring (First Day)
- [ ] Review logs for any issues
- [ ] Monitor database size growth
- [ ] Check tunnel stability
- [ ] Get user feedback
- [ ] Monitor system resources

### Follow-up (Day 2-7)
- [ ] Performance metrics stable
- [ ] No critical bugs reported
- [ ] Documentation updated
- [ ] Team trained on new commands
- [ ] Monitoring alerts configured

---

## Rollback Plan

**If critical failure detected:**

```bash
# Stop all services
Ctrl+C  # In terminal running npm run start:prod

# Option 1: Restart with previous build
git checkout main  # Or previous working commit
npm run build
npm run start:prod

# Option 2: Quick rollback
git revert <problematic-commit>
npm run build
npm run start:prod

# Option 3: Disable service (if needed)
# Edit .env.prod, change critical service port, restart
```

---

## Success Criteria

✅ **Deployment is successful when:**
1. All 3 services start without errors
2. No ERROR messages in console
3. https://losesperados.xyz loads in browser
4. Discord OAuth sign-in works
5. Dashboard shows user info correctly
6. Discord bot is online and responds
7. Database queries execute successfully
8. Cloudflare tunnel shows traffic
9. HTTPS certificate valid
10. All team members can access

---

## Sign-Off

| Role | Name | Status | Date | Time |
|------|------|--------|------|------|
| Engineering | — | [ ] Ready | — | — |
| Security | — | [ ] Approved | — | — |
| Operations | — | [ ] Deployed | — | — |

---

## Contact & Escalation

### During Deployment
- **Lead:** [Name/Contact]
- **Backup:** [Name/Contact]
- **Escalation:** [Manager/Team Lead]

### If Issues
- **Discord:** [Channel link]
- **Email:** [Team email]
- **On-call:** [Phone/Pager]

---

**Checklist Version:** 1.0  
**Last Updated:** January 31, 2026  
**Status:** ✅ READY FOR DEPLOYMENT

---

**Before running `npm run start:prod`, ensure ALL items above are checked ✅**
