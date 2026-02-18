# 🎮 Los Esperados — Panel Staff

> Production-ready Next.js staff management panel with Discord OAuth, real-time bot integration, and secure deployment.

---

## Quick Start (Production)

```bash
# 1. Setup Cloudflare tunnel config
./setup-tunnel-config.ps1  # Windows
# or
bash setup-tunnel-config.sh  # Linux/macOS

# 2. Login to Cloudflare
cloudflared tunnel login

# 3. Build and deploy
npm run build
npm run start:prod
```

**Access:** https://losesperados.xyz

---

## Quick Start (Development)

```bash
# Install dependencies
npm install
cd discord-worker && npm install && cd ..

# Run development server
npm run dev

# In another terminal, run Discord worker
npm run discord:dev
```

**Access:** http://localhost:3000

---

## Architecture

```
┌─────────────────────────────────────────────┐
│   Cloudflare Tunnel (los-esperados)         │
│   losesperados.xyz → localhost:3000         │
└────────────────┬──────────────────────────┘
                 │
         ┌───────┴────────────┐
         │                    │
    ┌────▼────┐          ┌────▼─────┐
    │ Next.js │          │ Discord  │
    │ Panel   │          │  Worker  │
    │ :3000   │          │  (async) │
    └────┬────┘          └────┬─────┘
         │                    │
    ┌────▼────────────────────▼────┐
    │   PostgreSQL Database         │
    │   127.0.0.1:5434            │
    └──────────────────────────────┘
```

---

## Features

✅ **Staff Panel**
- Dashboard with KPIs
- Member management
- Sanctions tracking
- Recruitment system
- Audit logging
- Secure access control

✅ **Discord Integration**
- OAuth sign-in
- Real-time bot status
- Command handling
- Event processing
- Role-based access

✅ **Security**
- NextAuth with Discord provider
- Role-based access control (RBAC)
- Audit trail
- CSRF protection
- SQL injection prevention

✅ **Deployment**
- Single command deployment
- Cloudflare Tunnel integration
- Production-ready configuration
- Zero-downtime updates

---

## Project Structure

```
.
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── staff/             # Staff panel pages
│   ├── me/                # User profile
│   └── layout.tsx         # Root layout
├── src/
│   ├── components/        # React components
│   ├── lib/              # Utilities & guards
│   └── middleware.ts     # NextAuth middleware
├── discord-worker/        # Discord.js bot
├── prisma/               # Database schema
├── public/               # Static files
├── scripts/              # Utility scripts
├── .env.prod             # Production env vars
├── .cloudflared-config.yml # Tunnel config
├── start-prod.ps1        # Windows launcher
├── start-prod.sh         # Unix launcher
└── package.json          # npm scripts
```

---

## Configuration Files

### `.env.prod` (Production)
```env
NEXTAUTH_URL=https://losesperados.xyz
DISCORD_CLIENT_ID=...
DISCORD_BOT_TOKEN=...
DATABASE_URL=postgresql://...
```

### `.cloudflared-config.yml` (Tunnel)
```yaml
tunnel: cd2a0e2d-f3c1-4866-ae84-8115817b154a
ingress:
  - hostname: losesperados.xyz
    service: http://localhost:3000
```

---

## Commands

### Development
```bash
npm run dev              # Start dev server
npm run discord:dev     # Start Discord worker (dev)
npm run lint            # Run ESLint
```

### Production
```bash
npm run build           # Build Next.js
npm run start           # Start production server
npm run start:prod      # Start all services (recommended)
npm run discord:start   # Start Discord worker
```

### Utilities
```bash
npm run dev:promote-staff   # Promote user to staff (dev)
npm run dev:promote-chef    # Promote user to chef (dev)
npm run discord:seedjob     # Seed Discord jobs
```

---

## Deployment

### Prerequisites
- Node.js 18+
- PostgreSQL 16+ on `127.0.0.1:5434`
- cloudflared CLI
- Cloudflare account

### Steps

1. **Setup tunnel config**
   ```bash
   ./setup-tunnel-config.ps1    # Windows
   bash setup-tunnel-config.sh  # Linux/macOS
   ```

2. **Authenticate**
   ```bash
   cloudflared tunnel login
   ```

3. **Build & Deploy**
   ```bash
   npm run build
   npm run start:prod
   ```

4. **Verify**
   ```bash
   # Browser: https://losesperados.xyz
   # Console: Should show all 3 services running
   ```

**See [FINAL-INFRA-DEPLOYMENT.md](FINAL-INFRA-DEPLOYMENT.md) for detailed guide.**

---

## Environment Variables

### Required
```env
# NextAuth
NEXTAUTH_URL=https://losesperados.xyz
NEXTAUTH_SECRET=<strong-secret>
AUTH_TRUST_HOST=true

# Discord OAuth
DISCORD_CLIENT_ID=<discord-app-id>
DISCORD_CLIENT_SECRET=<discord-app-secret>

# Discord Bot
DISCORD_BOT_TOKEN=<bot-token>
DISCORD_GUILD_ID=<guild-id>

# Database
DATABASE_URL=postgresql://user:pass@localhost:5434/dbname
```

### Optional
```env
# Role IDs (for access control)
CHEF_FAMILLE_ROLE_ID=<role-id>
OWNER_DISCORD_ID=<owner-id>

# Features
DEBUG_AUTH=0|1
```

---

## Security

- ✅ NextAuth with Discord OAuth
- ✅ Role-based access control (RBAC)
- ✅ Server-side authorization checks
- ✅ Audit logging for all actions
- ✅ HTTPS only (NEXTAUTH_URL)
- ✅ CSRF protection via NextAuth
- ✅ SQL injection prevention (Prisma ORM)

See [SECURITY-LINK-LOCKDOWN.md](SECURITY-LINK-LOCKDOWN.md) for detailed security info.

---

## Database

**Engine:** PostgreSQL 16+  
**ORM:** Prisma  
**Migrations:** Automatic (prisma migrate)

### Setup
```bash
# Create database (if needed)
createdb -h 127.0.0.1 -p 5434 -U postgres postgres

# Run migrations
npx prisma migrate deploy

# Seed initial data (optional)
npx prisma db seed
```

---

## Monitoring & Logs

### Development
- All logs to console
- No file logging

### Production
- All logs to console
- Prefixed output: `[next] [worker] [tunnel]`
- Use external log aggregation for persistence

### Key Metrics
- Next.js startup time
- Worker connection status
- Tunnel traffic/errors
- Database query performance

---

## Troubleshooting

### Port 3000 already in use
```bash
# Windows
Stop-Process -Id (Get-NetTCPConnection -LocalPort 3000).OwningProcess -Force

# Linux/macOS
kill -9 $(lsof -t -i :3000)
```

### PostgreSQL connection failed
```bash
# Check if running
psql -h 127.0.0.1 -p 5434 -U postgres -c "SELECT 1"

# Start if stopped
net start PostgreSQL-x64-16  # Windows
brew services start postgresql@16  # macOS
sudo systemctl start postgresql  # Linux
```

### Cloudflare tunnel credentials missing
```bash
cloudflared tunnel login
# Then run setup:
./setup-tunnel-config.ps1  # Windows
bash setup-tunnel-config.sh  # Linux/macOS
```

**See [FINAL-INFRA-DEPLOYMENT.md](FINAL-INFRA-DEPLOYMENT.md#troubleshooting) for more help.**

---

## API Documentation

### Authentication
- **OAuth Provider:** Discord
- **Session Strategy:** Database
- **Callback URL:** `https://losesperados.xyz/api/auth/callback/discord`

### Key Endpoints
- `GET /api/auth/signin` — Sign in page
- `POST /api/auth/callback/discord` — OAuth callback
- `GET /api/auth/signout` — Sign out
- `GET /api/me` — Current user info

See [API.md](docs/api.md) for full API reference (if available).

---

## Contributing

1. Create feature branch: `git checkout -b feature/your-feature`
2. Commit changes: `git commit -m "feat: description"`
3. Push to origin: `git push origin feature/your-feature`
4. Create pull request

### Code Standards
- TypeScript strict mode
- ESLint configuration
- Prettier formatting
- Commit message convention

---

## Support

### Documentation
- [Infrastructure Deployment](FINAL-INFRA-DEPLOYMENT.md)
- [Security Lockdown](SECURITY-LINK-LOCKDOWN.md)
- [Deployment Complete](DEPLOYMENT-COMPLETE.md)

### Issues
- GitHub Issues (if applicable)
- Internal team chat

### Monitoring
- Production console logs
- PostgreSQL logs
- Cloudflare dashboard

---

## License

Proprietary — Los Esperados

---

## Team

- **Engineering:** DevOps & Full Stack
- **Maintainers:** Security Team
- **Support:** Operations Team

---

## Version

- **Current:** 0.1.0
- **Build:** 5.8s (TypeScript 0 errors)
- **Status:** Production Ready

---

**Last Updated:** January 31, 2026

For detailed deployment instructions, see [FINAL-INFRA-DEPLOYMENT.md](FINAL-INFRA-DEPLOYMENT.md).
