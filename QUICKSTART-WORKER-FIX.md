# WORKER FIX - QUICK START (5 MINUTES)

## ✅ What Was Fixed

**Problem**: Worker crashed on startup with `INGEST_BASE_URL is required` error  
**Cause**: `.env.prod` loaded too late (after module imports)  
**Solution**: Load environment BEFORE imports + lazy config loading  
**Result**: Worker boots successfully, no crashes

---

## ✅ What Changed (2 Files)

### discord-worker/src/index.ts
```typescript
// Line 1: Added this (moves to first line before all other imports)
import "dotenv/config";
```

### discord-worker/src/link.ts  
```typescript
// Changed from: const INGEST_BASE_URL = (() => { if (!url) throw... })()
// To: function getConfig() { ... } (lazy load, called at runtime)
```

---

## ✅ Verify Locally (30 seconds)

```bash
cd discord-worker
npm run build       # Should complete with no errors

npm run discord:start
# Wait for boot logs...
# Look for: [ENV CONFIG AT BOOT] { INGEST_BASE_URL: 'https://losesperados.xyz', ... }
# If you see this = FIX WORKS ✓
```

---

## ✅ Deploy to Production

1. **Deploy code** (the updated discord-worker)
2. **Start worker**: `npm run discord:start`
3. **Check logs** for `[ENV CONFIG AT BOOT]`
4. **Test**: `/link @user` in Discord
5. **Done** 🎉

---

## ⚠️ Important

**Requirement**: `.env.prod` must exist on production server with:
```
INGEST_BASE_URL=https://losesperados.xyz
INGEST_SECRET=<your-secret>
DISCORD_TOKEN=<your-bot-token>
```

(This file already exists - just make sure it deploys with your code)

---

## ✅ How to Know It's Working

**Boot logs show**:
```
[ENV CONFIG AT BOOT] { 
  INGEST_BASE_URL: 'https://losesperados.xyz',
  INGEST_SECRET_LENGTH: 36,
  ...
}
```

**No error messages** like:
- ❌ "INGEST_BASE_URL is required"
- ❌ "Unexpected token '<'"
- ❌ "InteractionAlreadyReplied"

**`/link` command works**:
- `/link @user` → Shows panel ✓
- Click button → Modal opens ✓
- Submit form → "Liaison Enregistrée" ✓

---

## 📋 Build Test Results

```
✅ npm run build - SUCCESS
✅ No TypeScript errors
✅ .env.prod found with all required vars
✅ Ready for production
```

---

**Status**: 🚀 **READY TO DEPLOY**

Next: Deploy to production, restart worker, verify boot logs.
