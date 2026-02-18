# ⚡ QUICK START - LinkRequest System

## ✅ What Changed

| Before | After |
|--------|-------|
| ❌ Buttons don't work | ✅ Buttons make DB changes |
| ❌ "Unknown interaction" error | ✅ Instant confirmation |
| ❌ No permission checks | ✅ Staff only (role-based) |
| ❌ Manual DB updates | ✅ Automatic updates |

---

## 🚀 Deploy in 3 Steps

### 1. Build
```bash
cd c:\panel-esperados\panel\discord-worker
npm run build
```
**Expected:** No errors

### 2. Start Panel (Terminal 1)
```bash
cd c:\panel-esperados\panel
npm start
```
**Expected:** `ready - started server on 0.0.0.0:3000`

### 3. Start Worker (Terminal 2)
```bash
cd c:\panel-esperados\panel\discord-worker
npm start
```
**Expected:** 
```
[WORKER BOT] YourBotName#1234 your_bot_id
[boot_complete] { panelOk: true }
http_server_ready { port: "3001" }
```

---

## 🧪 Quick Test

### Create a Link Request
1. Visit: `http://localhost:3000/me`
2. Click: "Demander liaison"
3. Check: Message in #bots-famille with 3 buttons

### Test Accept Button
1. Click: "✅ Accepter"
2. Expect: Green embed update + buttons disabled
3. Check: User status changed in `/me`

### Test Permissions
1. Regular member clicks button
2. Expect: "❌ Permission denied"
3. Staff clicks button
4. Expect: "✅ Liaison acceptée"

---

## 📋 Files Modified

```
✅ discord-worker/src/link-request-handler.ts (NEW - 314 lines)
✅ discord-worker/src/index.ts (MODIFIED - 150 lines)
✅ Compilation: PASS (0 errors)
```

---

## 🔐 Security

✅ Only Chef Famille & Etat Major can act
✅ User cannot act on own request
✅ No double-click possible
✅ Idempotent operations

---

## 📊 Database

✅ LinkRequest status updated
✅ Member created/updated with discordId
✅ Metadata tracked (who, when)
✅ No data loss

---

## 📝 Logging

All events logged as JSON:
```json
{
  "event": "linkreq_action_success",
  "action": "accept",
  "requestId": "abc123",
  "timestamp": "2026-01-31T15:30:00.000Z"
}
```

---

## ✨ Next

1. ✅ Verify build passes
2. ✅ Start services
3. ✅ Test button clicks
4. ✅ Check Discord updates
5. ✅ Monitor logs

---

## 🆘 Troubleshooting

### No response on button click
- Check worker logs for `[ACK_OK]`
- Check panel is running on :3000

### Permission denied
- Check user has role (1429607761720770623 or 1312845999366209683)
- Check guild ID matches (1312845998753710151)

### DB not updating
- Check panel logs for `/api/ingest/link-requests/` calls
- Check x-ingest-secret matches environment

---

## 📚 Full Documentation

- [LINKREQ-SYSTEM-IMPLEMENTATION.md](LINKREQ-SYSTEM-IMPLEMENTATION.md)
- [LINKREQ-DEPLOYMENT-CHECKLIST.md](LINKREQ-DEPLOYMENT-CHECKLIST.md)
- [LINKREQ-USER-GUIDE.md](LINKREQ-USER-GUIDE.md)
- [LINKREQ-FINAL-SUMMARY.md](LINKREQ-FINAL-SUMMARY.md)

---

**Status: READY TO DEPLOY** 🚀
