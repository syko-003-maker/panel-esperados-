# 🚀 Quick Summary: Internal Base URL Fix

**Problem**: `[lyg-banklogs] fetch failed` on prod-local with tunnel + cloudflared  
**Cause**: Server Node tries to fetch via public URL (https://losesperados.xyz) which can fail  
**Solution**: Use loopback address (http://127.0.0.1:3000) for internal proxy calls  

---

## What Changed

### 1 New Function (23 lines)
```typescript
function getInternalPanelBase(): string {
  // Returns: http://127.0.0.1:{PORT}
  // Or uses: PANEL_INTERNAL_BASE_URL (if set)
}
```

### 1 Function Modified (1 line)
```typescript
// Before:
const publicPanelBase = NEXTAUTH_URL || ... || "https://losesperados.xyz"

// After:
const internalPanelBase = getInternalPanelBase()
```

---

## Result

✅ Legacy proxy now uses loopback: `http://127.0.0.1:3000/api/lygbanklogs`  
✅ No more tunnel/TLS/DNS issues  
✅ Sync works perfectly in prod-local  
✅ Build passes: exit code 0  

---

## How to Use

### No Configuration Needed
```bash
npm run start:prod
# Automatically uses: http://127.0.0.1:3000
```

### Optional: Explicit Config
```env
PANEL_INTERNAL_BASE_URL=http://127.0.0.1:3000
```

---

## Testing

```bash
# 1. Start server
npm run start:prod

# 2. Click "Sync now" in browser

# 3. Check logs
# ✓ [lyg-banklogs] using INTERNAL base (loopback): http://127.0.0.1:3000
# ✓ [lyg-banklogs] ✓ Success on Legacy proxy /api/lygbanklogs
# ✗ NO MORE: [lyg-banklogs] fetch failed
```

---

**Status**: ✅ Complete | **Build**: ✅ Passing | **Deploy**: ✅ Ready
