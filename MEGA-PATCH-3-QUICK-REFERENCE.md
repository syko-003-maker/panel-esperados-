# MEGA PATCH #3 - QUICK REFERENCE

## ⚡ What Changed?

### New Member Routes
```
/dashboard                    - Member dashboard
/banque                      - Bank UI
/justificatifs/absence       - Absence form → Discord
/justificatifs/sanction      - Sanction form → Discord
/access-denied              - Access denied page
```

### New APIs
```
POST /api/member/absence/justify
POST /api/member/sanction/justify
```

### New RBAC System
```
src/server/auth/rbac.ts
- getUserRole(session) → "member" | "staff" | "chef"
- Uses ENV: STAFF_DISCORD_IDS, CHEF_DISCORD_IDS
```

---

## 🔑 Key Features

| Feature | Before | After |
|---------|--------|-------|
| Member routing | Mixed with staff | Isolated in `(member)` group |
| Staff access guard | Redirects to /staff/link | Shows "Accès refusé" page |
| Member sidebar | Not implemented | ✅ Implemented with 4 features |
| Absence reporting | Manual only | Form → Discord automated |
| Sanction reporting | Manual only | Form → Discord automated |
| Role system | Ad-hoc | RBAC with hierarchy |

---

## 🚀 Quick Setup

### 1. Environment Variables
```bash
STAFF_DISCORD_IDS="123456789,987654321"
CHEF_DISCORD_IDS="111111111"
WORKER_INTERNAL_URL="http://127.0.0.1:3001"
INGEST_SECRET="your-secret"
```

### 2. Build & Deploy
```bash
npm run build    # Should exit 0
npm start
```

### 3. Start Worker (separate server)
```bash
# Ensure worker endpoint is running:
# POST /internal/discord/postMessage
# Auth: X-Ingest-Secret header
```

---

## 🧪 Quick Test

### Member Flow
1. Log in with non-staff Discord account
2. Redirects to `/dashboard` ✓
3. Click "Justifier une Absence" ✓
4. Fill form → "Envoyé avec succès" ✓
5. Check Discord channel `1335303582043607222` for message ✓

### Staff Flow
1. Log in with staff Discord account (in STAFF_DISCORD_IDS)
2. Redirects to `/staff/dashboard` ✓
3. All staff routes work ✓

### Access Denied
1. Member tries `/staff/dashboard`
2. Gets "Accès refusé" page ✓
3. Clicks back → `/dashboard` ✓

---

## 📁 Files Reference

**RBAC**
- `src/server/auth/rbac.ts` - Role system

**Member UI**
- `app/(member)/layout.tsx` - Gate + redirect
- `app/(member)/components/member-sidebar.tsx` - Navigation
- `app/(member)/dashboard/page.tsx` - Dashboard
- `app/(member)/banque/page.tsx` - Bank
- `app/(member)/justificatifs/absence/page.tsx` - Absence form
- `app/(member)/justificatifs/sanction/page.tsx` - Sanction form

**APIs**
- `app/api/member/absence/justify/route.ts`
- `app/api/member/sanction/justify/route.ts`

**Access Control**
- `app/staff/layout.tsx` - Guard (updated)
- `app/access-denied/page.tsx` - Access denied page

**Updated**
- `app/page.tsx` - Root redirect (updated)

---

## 🔗 Discord Channels

**Absence Justifications**
```
Channel ID: 1335303582043607222
Message format: **Justification d'Absence**
                👤 Membre: rpName (discordId)
                📅 Période: dates
                💬 Raison: reason
```

**Sanction Justifications**
```
Channel ID: 1409028569203740792
Message format: **Justification de Sanction**
                👤 Membre: rpName (discordId)
                🏷️ Sanction ID: id
                📝 Contexte: context
                💬 Justification: reason
```

---

## ⚙️ RBAC Configuration

### How It Works

1. **User logs in** with Discord OAuth
2. **Session callback** queries `Account.providerAccountId`
3. **getUserRole()** checks against ENV allowlists
4. **Route/Layout** enforces role requirements

### Role Hierarchy
```
Chef (highest)
  ↓
Staff
  ↓
Member (lowest)
```

### Configuration
```bash
# Staff (can access /staff/*)
STAFF_DISCORD_IDS="123456789,987654321,111111111"

# Chefs (can access /staff/* + chef-only features)
CHEF_DISCORD_IDS="999999999"
```

---

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| Member stuck on login | Check Discord OAuth config |
| Member not redirecting | Check ENV: STAFF_DISCORD_IDS format |
| API returns 401 | Verify session is valid |
| API returns "Discord not linked" | Account table missing Discord provider |
| Discord message not sent | Check worker is running + INGEST_SECRET |
| "Accès refusé" shows for staff | Check STAFF_DISCORD_IDS includes user's ID |

---

## 📊 Build Status

```
✅ Build: exit 0
✅ TypeScript: Clean
✅ Routes: 140+
✅ Production Ready
```

---

## 📚 Documentation

- `MEGA-PATCH-3-RBAC-MEMBER-STAFF.md` - Full implementation guide
- `WORKER-INTEGRATION-GUIDE.md` - Worker endpoint spec
- `MEGA-PATCH-3-GIT-COMMIT.md` - Git summary
- `MEGA-PATCH-3-DELIVERY-SUMMARY.md` - This delivery summary

---

## ✅ Checklist

- [x] RBAC system implemented
- [x] Member routes isolated
- [x] Staff access guard added
- [x] Member UI created (4 features)
- [x] APIs for absence/sanction
- [x] Discord integration ready
- [x] Worker endpoint documented
- [x] Build verified (exit 0)
- [x] Zero breaking changes
- [x] Documentation complete

---

**Status**: ✅ PRODUCTION READY

**Build**: exit 0, 0 TypeScript errors

**Ready to Deploy**: YES
