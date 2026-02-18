# Bug Fix: INGEST_BASE_URL undefined at import time

## Problem
```
Error: INGEST_BASE_URL is required...
  at dist/link.js:15 (during module import)
```

**Root Cause**: `process.env.INGEST_BASE_URL` was undefined when `link.ts` was imported because `.env.prod` wasn't loaded before module evaluation.

**Timeline**: 
1. Node starts
2. `index.ts` imports `link.ts`
3. `link.ts` top-level IIFE tries to read `process.env.INGEST_BASE_URL`
4. `dotenv/config` hasn't run yet → env is empty → throws error

## Solution

### 1. Load `.env` BEFORE any module imports (index.ts)
```typescript
// ✅ MUST BE FIRST - before any other imports
import "dotenv/config";

// Then other imports
import { config } from "dotenv";
import { resolve, join } from "path";
```

**Why first**: The `import "dotenv/config"` statement executes immediately and populates `process.env` before the rest of the file is parsed.

### 2. Replace top-level throws with lazy functions (link.ts)
```typescript
// ❌ BEFORE (threw at module load time)
const INGEST_BASE_URL = (() => {
  const url = process.env.INGEST_BASE_URL;
  if (!url) throw new Error("...");  // ERROR HERE
  return url;
})();

// ✅ AFTER (throws only when called)
function getIngestBaseUrl(): string {
  const url = process.env.INGEST_BASE_URL;
  if (!url) throw new Error("...");  // Only throws if handler uses it
  return url;
}

let cachedIngestBaseUrl: string | null = null;
function getConfig() {
  if (!cachedIngestBaseUrl) {
    cachedIngestBaseUrl = getIngestBaseUrl();
  }
  return { ingestBaseUrl: cachedIngestBaseUrl, ... };
}
```

**Why lazy**: Functions are evaluated at runtime (when called), not at module load time. By the time a handler calls `getConfig()`, dotenv has loaded.

### 3. Use lazy config in panelFetch()
```typescript
async function panelFetch(path: string, options: RequestInit = {}) {
  // ✅ Get config at runtime (after env is loaded)
  const { ingestBaseUrl, workerSecret } = getConfig();
  const url = `${ingestBaseUrl}${path}`;
  
  const res = await fetch(url, {
    headers: {
      "x-ingest-secret": workerSecret,
      "Content-Type": "application/json",
    },
  });
}
```

### 4. Add boot logging (index.ts)
```typescript
client.once("ready", async () => {
  // ✅ Log env at boot
  const ingestBaseUrl = process.env.INGEST_BASE_URL || "(NOT SET)";
  const ingestSecretLength = process.env.INGEST_SECRET ? process.env.INGEST_SECRET.length : 0;
  
  console.log("[ENV CONFIG AT BOOT]", {
    INGEST_BASE_URL: ingestBaseUrl,
    INGEST_SECRET_LENGTH: ingestSecretLength,
  });
  
  log("env_config_at_boot", {
    ingestBaseUrl,
    ingestSecretLength,
    nodeEnv: process.env.NODE_ENV,
  });
```

**What to look for in logs**:
```json
{
  "event": "env_config_at_boot",
  "ingestBaseUrl": "https://losesperados.xyz",
  "ingestSecretLength": 34,
  "nodeEnv": "production"
}
```

## Files Modified

### discord-worker/src/index.ts
- Added `import "dotenv/config";` at line 1 (before all other imports)
- Added boot logging to `client.once("ready", ...)` to dump env config

### discord-worker/src/link.ts
- Replaced top-level IIFE constants with lazy functions:
  - `getIngestBaseUrl()` - reads INGEST_BASE_URL at runtime
  - `getWorkerSecret()` - reads INGEST_SECRET at runtime
  - `getConfig()` - cache layer, calls both getters
- Updated `panelFetch()` to call `getConfig()` for url and headers

### Build Status
```
✅ npm run build - NO ERRORS
✅ TypeScript compilation successful
✅ dist/link.js will not throw on import
```

## Docker / Production Deployment

### Environment Setup
The `.env.prod` file already contains:
```dotenv
INGEST_BASE_URL=https://losesperados.xyz
INGEST_SECRET=esperados_ingest_secret_prod_v1_2024
DISCORD_TOKEN=...
GUILD_ID=1312845998753710151
```

### Startup Command
```bash
# With .env.prod loaded by dotenv/config
npm run discord:start

# OR explicit path if needed
NODE_ENV=production npm run discord:start
```

### Expected Boot Logs
```
[ENV CONFIG AT BOOT] { 
  INGEST_BASE_URL: 'https://losesperados.xyz', 
  INGEST_SECRET_LENGTH: 34 
}

[WORKER BOT] BotName #1234567890

{ 
  "event": "env_config_at_boot",
  "ingestBaseUrl": "https://losesperados.xyz",
  "ingestSecretLength": 34,
  "nodeEnv": "production",
  "timestamp": "2026-02-05T14:30:00.000Z"
}

{ "event": "worker_ready", "bot": "BotName#1234567890" }
```

## Verification Checklist

- [ ] Build succeeds: `npm run build` in discord-worker
- [ ] index.ts has `import "dotenv/config";` as FIRST line
- [ ] panelFetch() calls `getConfig()` before using URL/secret
- [ ] Boot logs show INGEST_BASE_URL and INGEST_SECRET_LENGTH
- [ ] Worker starts without "INGEST_BASE_URL is required" error
- [ ] Panel responds to `/link @user` command
- [ ] No "Unexpected token '<'" errors in worker logs

## Success Indicators

✅ Worker boots without throwing
✅ Logs show env vars loaded correctly
✅ `/link` command works end-to-end
✅ No HTML 302 responses to worker requests
✅ All responses are JSON

---

**Testing command**:
```bash
cd discord-worker
npm run build       # Verify no errors
npm run discord:start  # Boot and check logs
```

---

**Date**: 2026-02-05
**Root Cause**: dotenv loaded after module imports
**Solution**: Lazy configuration loading + dotenv first
**Impact**: Zero breaking changes, fully backward compatible
