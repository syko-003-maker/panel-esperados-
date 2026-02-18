# Phase 4: Discord Diagnostics Complete ✅

## Summary

Phase 4 hardening complete. The member justification → Discord pipeline now has full diagnostic visibility with structured logging, explicit error messages, and a test endpoint to validate the entire flow.

**Build Status**: ✅ exit 0 (5.2s compile, 149 routes prerendered)

## What Changed

### 1. Enhanced Helper: `src/server/worker/post-discord.ts`

Added comprehensive debug logging to track Discord message delivery:

```typescript
// Debug mode based on NODE_ENV or DEBUG_DISCORD_POST env var
const DEBUG = process.env.DEBUG_DISCORD_POST === "true" || process.env.NODE_ENV !== "production";

// Logs request details (URL, channelId, embeds count)
if (DEBUG) {
  console.log("[discord-post] request", {
    url: FULL_URL,
    channelId: payload.channelId,
    hasContent: !!payload.content,
    embeds: payload.embeds?.length ?? 0,
    timeoutMs,
  });
}

// Logs response status and body
if (DEBUG) {
  console.log("[discord-post] response", {
    status: res.status,
    ok: res.ok,
    body: data,
  });
}

// Explicit error message if INGEST_SECRET missing
throw new Error("INGEST_SECRET missing in panel env");
```

**Impact**: Dev logs by default, can force prod logging with `DEBUG_DISCORD_POST=true`.

### 2. Enhanced Worker Endpoint: `discord-worker/src/http-server.ts`

Improved `/internal/discord/postMessage` with structured error handling:

```typescript
// Check WORKER_SECRET existence (not just match)
if (!WORKER_SECRET) {
  logError("post_message_auth_error", "INGEST_SECRET not configured in worker env");
  return res.status(401).json({ ok: false, error: "Server not configured" });
}

// Logs attempt with metadata
log("internal_post_message_attempt", {
  channelId,
  hasContent: !!content,
  embedCount: embeds?.length ?? 0,
});

// Logs success with Discord messageId
log("internal_post_message_success", {
  channelId,
  messageId: message.id,
});
```

**Impact**: Structured logs show what was attempted and if it succeeded, with Discord message ID for audit trail.

### 3. Test Endpoint: `app/api/member/_test-discord/route.ts` (NEW)

Chef-only endpoint to validate the entire pipeline end-to-end:

```bash
# Test absence channel
curl "http://localhost:3000/api/member/_test-discord?channel=absence"

# Test sanction channel
curl "http://localhost:3000/api/member/_test-discord?channel=sanction"
```

**Response (success):**
```json
{
  "ok": true,
  "message": "Test message envoyé avec succès",
  "channel": "absence",
  "messageId": "1234567890123456789",
  "debug": {
    "workerUrl": "http://127.0.0.1:3001",
    "timestamp": "2026-01-31T12:34:56.789Z"
  }
}
```

**Response (failure):**
```json
{
  "ok": false,
  "error": "Unauthorized",
  "debug": {
    "channel": "absence",
    "channelId": "1335303582043607222",
    "workerUrl": "http://127.0.0.1:3001",
    "hasSecret": false
  }
}
```

**Impact**: Single request shows full diagnostic picture. If it fails, debug info tells you exactly what's missing.

### 4. Enhanced Justify Endpoints

Added messageId to success logging in:
- `app/api/member/absence/justify/route.ts`
- `app/api/member/sanction/justify/route.ts`

```typescript
logger.immediate("justification_sent_to_discord", {
  discordId: session.discordId,
  reason,
  messageId: discordResponse.messageId,  // ← NEW: Which Discord message was created
});
```

**Impact**: Operators can correlate member justifications to Discord messages for audit/debugging.

### 5. README Documentation

Added diagnostic troubleshooting section explaining:
- Configuration requirements (INGEST_SECRET, WORKER_INTERNAL_URL)
- How to test the pipeline
- Common error messages and what they mean
- How to enable debug logging
- Discord channel IDs

## Testing the Pipeline

### Quick Test

```bash
# Terminal 1: Start worker
cd discord-worker
npm start

# Terminal 2: Start panel  
cd panel
npm run dev

# Terminal 3: Test the pipeline (as chef user)
curl "http://localhost:3000/api/member/_test-discord?channel=absence" \
  -H "Cookie: sessionToken=..." # Your auth cookie
```

Expected response:
```json
{
  "ok": true,
  "messageId": "1234567890123456789",
  "debug": { "workerUrl": "http://127.0.0.1:3001", "timestamp": "..." }
}
```

### Debug Logs

```bash
# Panel - show [discord-post] logs
DEBUG_DISCORD_POST=true npm run dev

# Worker - show internal_post_message_* logs
npm start

# Look for:
# [discord-post] request { url, channelId, ... }
# [discord-post] response { status, ok, body }
# [discord-post] success { messageId }
# internal_post_message_attempt { channelId, ... }
# internal_post_message_success { channelId, messageId }
```

## Configuration

**Panel (.env.prod):**
```bash
INGEST_SECRET=your_shared_secret
WORKER_INTERNAL_URL=http://127.0.0.1:3001
DEBUG_DISCORD_POST=true  # Optional, force logs in prod
```

**Worker (.env.prod):**
```bash
INGEST_SECRET=your_shared_secret  # Must match panel
```

## Discord Channels

- **Absence**: `1335303582043607222`
- **Sanction**: `1409028569203740792`

## Common Issues

| Issue | Cause | Fix |
|-------|-------|-----|
| "INGEST_SECRET missing in panel env" | Panel .env missing INGEST_SECRET | Add INGEST_SECRET to panel .env |
| "Unauthorized" | Secrets don't match | Ensure panel INGEST_SECRET = worker INGEST_SECRET |
| "http://127.0.0.1:3001: connect ECONNREFUSED" | Worker not running | Start worker: `cd discord-worker && npm start` |
| "Channel not found" | Discord channel ID invalid or bot no access | Check Discord channel ID and bot permissions |

## Rate Limiting

Justifications are rate-limited to **3 per 10 minutes** per user per endpoint (absence/sanction).

Respects the RateLimit DB model with sliding window rate limiting.

## What's Next

- ✅ Phase 4 diagnostic enhancements complete
- ⏳ Production deployment (verify ENVs match on both services)
- ⏳ Monitor logs: `internal_post_message_success` should appear for each member justification

## Files Modified

- `src/server/worker/post-discord.ts` - Enhanced with debug logging
- `discord-worker/src/http-server.ts` - Enhanced with structured error handling
- `app/api/member/absence/justify/route.ts` - Enhanced messageId logging
- `app/api/member/sanction/justify/route.ts` - Enhanced messageId logging
- `app/api/member/_test-discord/route.ts` - NEW test endpoint
- `README.md` - Added diagnostics section

## Build Info

```
✓ Compiled successfully in 5.2s
✓ Finished TypeScript in 9.0s
✓ Collected page data using 15 workers in 1478.6ms
✓ Generated static pages (149/149) in 340.2ms
```

All routes operational. Phase 4 ready for deployment.
