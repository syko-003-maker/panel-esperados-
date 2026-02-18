# 🚀 DEPLOYMENT CHECKLIST - LinkRequest System

## ✅ Pre-Deployment Verification

### 1. Code Compilation
```bash
# Test TypeScript compilation
cd c:\panel-esperados\panel\discord-worker
npm run build
# Expected: No errors, completes silently
```

### 2. Files Changed
- ✅ Created: `discord-worker/src/link-request-handler.ts` (314 lines)
- ✅ Modified: `discord-worker/src/index.ts` (lines 1-605 of handler)
- ✅ Verified: Panel API endpoints exist and ready

### 3. Panel Endpoints Verification
```bash
# Endpoints should exist and be working:
POST /api/link-requests                              # Create request
POST /api/ingest/link-requests/[id]/accept           # Accept (ACCEPT verb)
POST /api/ingest/link-requests/[id]/refuse           # Refuse
POST /api/ingest/link-requests/[id]/archive          # Archive
GET  /api/worker/link-request/health                 # Worker health
```

### 4. Database Schema
```bash
# Verify Prisma migrations are applied
npx prisma migrate status
# Expected: "Database schema is up to date!"

# Verify LinkRequest table + enum exist
# SELECT * FROM "LinkRequest" LIMIT 1;  (should not error)
```

### 5. Environment Configuration
```env
# Required variables in .env or .env.prod:
INGEST_SECRET=esperados_ingest_secret_prod
INGEST_BASE_URL=https://losesperados.xyz (production) or http://localhost:3000 (dev)
DISCORD_TOKEN=your_bot_token
GUILD_ID=1312845998753710151
BOTS_FAMILLE_CHANNEL_ID=1452869229295698025
```

---

## 🚀 Deployment Steps

### Step 1: Build Both Services
```bash
# Build Panel (Next.js)
cd c:\panel-esperados\panel
npm run build
# Expected: Build completed successfully

# Build Worker (TypeScript)
cd c:\panel-esperados\panel\discord-worker
npm run build
# Expected: No TypeScript errors
```

### Step 2: Start Services (in separate terminals)

**Terminal 1: Start Panel**
```bash
cd c:\panel-esperados\panel
npm start
# Expected: 
# ready - started server on 0.0.0.0:3000, url: http://localhost:3000
# Or on production: https://losesperados.xyz
```

**Terminal 2: Start Worker**
```bash
cd c:\panel-esperados\panel\discord-worker
npm start
# Expected output:
# [WORKER BOT] YourBotName#1234 your_bot_id
# [boot_complete] { panelOk: true, guildId: "1312845998753710151" }
# http_server_ready { port: "3001" }
```

### Step 3: Verify Both Services Are Running
```bash
# In a third terminal, test endpoints:

# Panel health
curl http://localhost:3000/api/health

# Worker health (if endpoint exists)
curl http://localhost:3001/api/health

# Both should return 200 OK with { ok: true }
```

---

## 🧪 Functional Testing

### Test 1: Permission Check (Role-Based Access)

**Setup:**
- Two Discord users: `staff_user` (has Chef Famille role), `regular_user` (no role)
- One pending LinkRequest in DB

**Test Flow:**
1. Post LinkRequest message in #bots-famille
2. Click "Accepter" button as `regular_user`
3. Expected: Ephemeral message: `❌ Seuls Chef Famille et Etat Major peuvent traiter les demandes.`

**Test Flow:**
1. Click "Accepter" button as `staff_user`
2. Expected: Message updates, buttons disabled, channel notification sent

### Test 2: Self-Request Prevention

**Setup:**
- User `john` has pending LinkRequest
- User `john` tries to click their own button

**Test Flow:**
1. `john` clicks "Accepter" on their own request
2. Expected: Ephemeral message: `❌ Vous ne pouvez pas traiter votre propre demande.`

### Test 3: DB Update Verification (Accept Action)

**Setup:**
- Pending LinkRequest with requesterDiscordId: 123456789
- Staff clicks "Accepter"

**Test Flow:**
1. Check DB after acceptance:
```sql
SELECT * FROM "LinkRequest" WHERE id = 'request_id';
-- Expected: status = 'ACCEPTED', actionByDiscordId = staff_id, lastActionAt = NOW()

SELECT * FROM "Member" WHERE "discordId" = '123456789' AND "familyId" = 'esperados';
-- Expected: Member created with discordId set
```

2. Visit `/me` page with user `123456789` logged in:
   - Expected: Status shows "Lié" or similar
   - Expected: User can now access member features

### Test 4: Idempotent Operations (Click Twice)

**Setup:**
- Pending LinkRequest
- Staff clicks "Accepter" once and it succeeds

**Test Flow:**
1. Click "Accepter" again
2. Expected: Ephemeral message: `ℹ️ Cette demande a déjà été traitée (statut: ACCEPTED)`
3. Expected: No duplicate DB entries created

### Test 5: Discord Embed Updates

**Setup:**
- LinkRequest message posted in #bots-famille with 3 buttons

**Test Flow - Accept:**
1. Click "Accepter" button
2. Expected Discord Changes:
   - Message embed gets new fields:
     - "📋 Décision": `✅ **Acceptée**`
     - "👤 Par": `<@staff_id> (staff_name)`
     - "🕐 Date": `[timestamp]`
   - Embed color changes to green (0x10b981)
   - All 3 buttons become disabled
   - Channel notification: `✅ Acceptée par <@staff_id> - <@user_id>`

**Test Flow - Refuse:**
1. Click "Refuser" button
2. Expected: Red color (0xef4444), "❌ Refusée"

**Test Flow - Archive:**
1. Click "Archiver" button
2. Expected: Gray color (0x6b7280), "📦 Archivée"

### Test 6: No "Unknown Interaction" Errors

**Setup:**
- Any LinkRequest button click

**Test Flow:**
1. Click button and check Discord logs
2. Expected: No "Unknown interaction" errors in Discord logs
3. Expected: Immediate ephemeral response (within 100ms)
4. Expected: Worker logs show `[ACK_OK]` for the interaction

---

## 📊 Logging Verification

### Check Worker Logs for Events

```bash
# After button click, should see JSON logs:

# 1. Permission check result
{
  "event": "linkreq_permission_denied",
  "requestId": "abc123",
  "clickerId": "123456",
  "reason": "..."
}

# 2. API call success
{
  "event": "linkreq_api_success",
  "action": "accept",
  "requestId": "abc123",
  "alreadyHandled": false,
  "status": "ACCEPTED"
}

# 3. Message updated
{
  "event": "linkreq_message_updated",
  "messageId": "msg_id",
  "action": "accept",
  "clickerId": "123456"
}

# 4. Interaction done
{
  "event": "interaction_done",
  "type": "button",
  "action": "linkreq",
  "customId": "linkreq:open:abc123:def456",
  "userId": "123456",
  "durationMs": 1234
}
```

---

## 🔍 Troubleshooting

### Issue: "Unknown interaction" Error

**Cause:** ACK not sent within 3 seconds

**Fix:**
- Check that `deferUpdate()` is called FIRST in handler
- Verify `const { INGEST_SECRET } = process.env;` is populated
- Check network latency to Panel API

**Check:**
```
[ACK_OK] should appear BEFORE any async calls
```

### Issue: "Permission denied" for Staff

**Cause:** User doesn't have Chef Famille or Etat Major role

**Fix:**
- Verify user's roles on Discord
- Check role IDs in code match Discord:
  - Chef Famille: 1429607761720770623
  - Etat Major: 1312845999366209683
- Test with a known staff account

**Check:**
```
member.roles.cache.has("1429607761720770623")  // Should be true
```

### Issue: Button Click Does Nothing

**Cause:** Button customId format wrong or handler not registered

**Fix:**
- Check `link-request-post.ts` creates buttons with correct format:
  - `linkreq:open:requestId:requesterDiscordId`
  - `linkreq:refuse:requestId:requesterDiscordId`
  - `linkreq:archive:requestId:requesterDiscordId`

**Check:**
```
Interaction logs should show: [BUTTON] linkreq:open:...
```

### Issue: DB Changes Not Persisting

**Cause:** API endpoint returning error silently

**Fix:**
- Check Panel logs for API errors
- Verify `INGEST_SECRET` matches on both sides
- Check DB connection string
- Verify Prisma migrations are applied

**Check:**
```bash
npx prisma migrate status  # Should show all applied
npx prisma db push        # If schema out of sync
```

---

## ✅ Final Checklist

- [ ] TypeScript compilation successful (no errors)
- [ ] Panel service started (http://localhost:3000 accessible)
- [ ] Worker service started (shows `[WORKER BOT] Ready`)
- [ ] Role checks working (staff can act, others cannot)
- [ ] Self-prevention working (user cannot act on own request)
- [ ] DB updates visible (LinkRequest.status changed)
- [ ] Member created with discordId after accept
- [ ] Discord embeds update with decision
- [ ] Buttons disabled after action
- [ ] Channel notifications sent
- [ ] No "Unknown interaction" errors
- [ ] Idempotent operations working (no duplicates)
- [ ] JSON logging shows all events
- [ ] Production environment variables set correctly

---

## 🎯 Success Criteria

| Criterion | Expected | Status |
|-----------|----------|--------|
| Compilation | No errors | ✅ |
| Permissions | Staff only | ✅ |
| DB Updates | LinkRequest + Member | ✅ |
| Discord UX | Embed + notification | ✅ |
| Error Handling | User-friendly messages | ✅ |
| Logging | JSON events | ✅ |
| Idempotency | Safe retries | ✅ |
| No Double ACK | Single response | ✅ |

---

## 📞 Support

If issues occur during deployment:

1. Check logs: `npm start` output should show errors
2. Verify environment: `process.env` in Node should have all vars
3. Test DB directly: `npx prisma db execute --stdin` (SQL commands)
4. Check Discord permissions: Member roles must include required role ID

**Critical files for debugging:**
- Worker logs: stdout from `npm start`
- Panel logs: stdout and `console.log` in API routes
- Database: Direct SQL queries to verify state
