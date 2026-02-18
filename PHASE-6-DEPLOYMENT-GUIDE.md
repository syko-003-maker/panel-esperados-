# Phase 6 Deployment & Testing Guide

## Pre-Deployment Checklist

### Code Quality
- [x] Build passes: `npm run build` ✅ exit 0 (4.9s)
- [x] All 149 routes prerendered
- [x] No TypeScript errors
- [x] All endpoints tested locally

### Configuration
- [ ] INGEST_SECRET set in panel .env.prod (64+ random chars)
- [ ] INGEST_SECRET set in worker .env.prod (must match panel)
- [ ] WORKER_INTERNAL_URL set in panel .env.prod (or default 127.0.0.1:3001)
- [ ] WORKER_HTTP_PORT set in worker .env.prod (or default 3001)

### Infrastructure
- [ ] Worker HTTP server can start on port 3001
- [ ] Panel can reach 127.0.0.1:3001 (localhost or same machine)
- [ ] Discord bot has permission to send messages in #absence and #sanction
- [ ] Both channels exist with correct IDs (absence: 1335303582043607222, sanction: 1409028569203740792)

## Deployment Steps

### 1. Update Environment Variables

**Panel (.env.prod)**:
```bash
# Generate 64-char random secret
INGEST_SECRET=aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ

# Ensure worker URL is correct
WORKER_INTERNAL_URL=http://127.0.0.1:3001
```

**Worker (.env.prod)**:
```bash
# MUST match panel's INGEST_SECRET
INGEST_SECRET=aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ

# HTTP server port
WORKER_HTTP_PORT=3001
```

### 2. Deploy Panel

```bash
cd panel
git pull origin main
npm install  # if needed
npm run build
npm run start  # or restart via systemd
```

### 3. Deploy Worker

```bash
cd discord-worker
git pull origin main
npm install  # if needed
npm start  # or restart via systemd
```

### 4. Verify Deployment

#### Check Panel Build
```bash
# In panel directory
npm run build 2>&1 | grep -i "successfully"
# Should see: ✓ Compiled successfully in ~5s
```

#### Check Worker HTTP Server
```bash
# Test health endpoint
curl http://localhost:3001/api/health
# Should return: {"ok":true,"service":"discord-worker"}
```

#### Check Panel Can Reach Worker
```bash
# From panel server, test connection to worker
curl -X POST http://127.0.0.1:3001/internal/discord/postMessage \
  -H "Content-Type: application/json" \
  -H "x-ingest-secret: WRONG_SECRET" \
  -d '{"channelId":"123"}'
# Should return: 401 Unauthorized (because secret is wrong)
```

## Testing Workflow

### Test 1: Basic Connectivity (5 min)

```bash
# 1. Start with fresh .env
export INGEST_SECRET="test-secret-12345678901234567890"

# 2. Ensure worker is running
curl http://localhost:3001/api/health
# Expected: {"ok":true,"service":"discord-worker"}

# 3. Test secret validation
curl -X POST http://127.0.0.1:3001/internal/discord/postMessage \
  -H "Content-Type: application/json" \
  -H "x-ingest-secret: $INGEST_SECRET" \
  -d '{"channelId":"invalid-channel-id","embeds":[]}'
# Expected: 404 (channel not found is OK - means auth worked)
```

### Test 2: Chef Test Endpoint (2 min)

```bash
# 1. Sign in as chef on panel
# 2. Visit: http://localhost:3000/api/member/_test-discord?channel=absence
# Expected: {"ok": true, "messageId": "...", ...}
# Check Discord: Message should appear in #absence

# 3. Try sanction channel
# 4. Visit: http://localhost:3000/api/member/_test-discord?channel=sanction
# Expected: {"ok": true, "messageId": "...", ...}
# Check Discord: Message should appear in #sanction
```

### Test 3: Member Justification Flow (5 min)

```bash
# 1. Sign in as linked member on panel
# 2. Navigate to: http://localhost:3000/justificatifs/absence
# 3. Fill form:
#    Raison: "This is a test absence justification for more than 10 characters"
#    From: 2026-01-31
#    To: 2026-02-02
# 4. Click: "Envoyer la Justification"
# 5. Expected result:
#    - Green success message appears
#    - Discord message appears in #absence within 5 seconds
#    - Browser console shows: "✓ Absence justification sent for <discordId>"

# 6. Repeat for sanction:
#    URL: http://localhost:3000/justificatifs/sanction
#    Raison: "Test sanction justification with 10+ characters here"
#    Sanction ID: "TEST-001" (optional)
#    Contexte: "Optional context" (optional)
```

### Test 4: Rate Limiting (3 min)

```bash
# 1. As same member, submit 3 justifications quickly
# 2. 4th request should return: 429 Too Many Requests
# 3. Wait 10 minutes or clear RateLimit table
# 4. Should be able to submit again
```

### Test 5: Validation (2 min)

```bash
# Test reason too short
# Reason: "short" (less than 10 chars)
# Expected: 400 Error "reason must be at least 10 characters"

# Test invalid dates
# From: "not-a-date"
# Expected: 400 Error "Invalid date format"

# Test non-linked member
# As user with no Member record in DB
# Expected: 403 "MEMBER_NOT_LINKED"

# Test rate limit
# Submit same request 4 times in 1 minute
# Expected: 429 "Too many requests" on 4th request
```

## Monitoring After Deployment

### Day 1 - Smoke Test

```bash
# Check for errors in logs
grep -E "error|ERROR|failed|FAILED" panel.log
grep -E "error|ERROR|failed|FAILED" worker.log

# Should see NO errors related to:
# - discord-post
# - internal_post_message
# - Channel not found
```

### Week 1 - Metrics

```bash
# Count successful justifications
grep "internal_post_message_success" worker.log | wc -l

# Count failures
grep "internal_post_message_error\|post_message_auth_error" worker.log

# Check for timeouts
grep "Failed to fetch\|ECONNREFUSED\|ETIMEDOUT" panel.log
```

### Ongoing - Alerts

```bash
# Alert if:
# - Channel fetch fails (bot no permission)
# - INGEST_SECRET mismatches
# - Worker unreachable (connection refused)
# - Message send timeout (>5s)
# - Embed size too large (2000 char limit)
```

## Troubleshooting

### "INGEST_SECRET missing in panel env"

**Cause**: INGEST_SECRET not set in panel .env.prod

**Fix**:
```bash
# Add to panel .env.prod
INGEST_SECRET=<64-char-random-string>

# Restart panel
npm run start
```

### "Unauthorized" on /internal/discord/postMessage

**Cause**: Secret mismatch between panel and worker

**Fix**:
```bash
# Verify both have same INGEST_SECRET
cat panel/.env.prod | grep INGEST_SECRET
cat discord-worker/.env.prod | grep INGEST_SECRET

# Should be identical
# Restart both if changed
```

### "Channel not found or not text-based"

**Cause**: Discord channel ID wrong or bot has no access

**Fix**:
1. Verify channel IDs:
   - Absence: 1335303582043607222
   - Sanction: 1409028569203740792

2. Check bot permissions:
   - Bot role has "Send Messages" permission
   - Channel allows bot to post

3. Test in worker logs:
   ```bash
   grep "post_message_channel_error" worker.log
   ```

### "Failed to fetch" / Connection timeout

**Cause**: Panel can't reach worker on 127.0.0.1:3001

**Fix**:
1. Check worker is running:
   ```bash
   curl http://127.0.0.1:3001/api/health
   ```

2. Check port is correct:
   ```bash
   netstat -an | grep 3001
   # Should show LISTEN on 127.0.0.1:3001
   ```

3. Update panel .env.prod:
   ```bash
   WORKER_INTERNAL_URL=http://127.0.0.1:3001
   ```

4. Restart panel if changed

### "Too many requests" (429)

**Normal behavior**: Rate limit is 3 per 10 minutes

**Resolution**:
- Wait 10 minutes
- OR clear RateLimit table:
  ```bash
  # In prisma shell
  npx prisma studio
  # Delete RateLimit entries for user
  ```

## Rollback Plan

If issues occur, rollback is clean:

```bash
# Rollback panel
cd panel
git revert <commit-hash>
npm run build
npm run start

# Rollback worker
cd discord-worker
git revert <commit-hash>
npm start
```

**Note**: Old version doesn't send Discord messages, but all other functionality works.

## Success Criteria

✅ **After deployment, verify:**
- [ ] Member can submit absence justification
- [ ] Message appears in Discord #absence within 5 seconds
- [ ] Member can submit sanction justification
- [ ] Message appears in Discord #sanction within 5 seconds
- [ ] Rate limit works (4th request returns 429)
- [ ] Chef test endpoint works
- [ ] No errors in logs
- [ ] Non-linked members get 403
- [ ] Dates validate correctly

## Emergency Contacts

If issues:
1. Check logs for specific error
2. Verify INGEST_SECRET matches
3. Verify worker is running
4. Check Discord bot permissions
5. See Troubleshooting section above

## Estimated Deployment Time

- **Planning**: 5 min (read this guide)
- **Setup ENVs**: 5 min
- **Deploy panel**: 5 min (build + restart)
- **Deploy worker**: 2 min (restart)
- **Testing**: 10 min (run all test cases)
- **Total**: ~30 minutes

---

**Deployment Date**: _______
**Deployed By**: _______
**Build Commit**: _______
**Incidents**: _______
**Status**: _______
