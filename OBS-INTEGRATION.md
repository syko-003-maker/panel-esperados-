/**
 * OBS-INTEGRATION.md
 * 
 * Production-ready observability guidance for panel + worker
 * 
 * ═══════════════════════════════════════════════════════════
 * 
 * OVERVIEW
 * ─────────
 * 
 * Three modules provide structured JSON logging, request ID tracking,
 * and HTTP resilience for production environments:
 * 
 * 1. src/lib/obs.ts (Panel) / discord-worker/src/lib/worker-obs.ts
 *    - makeRequestId() / makeJobId()
 *    - logInfo(event, data?)
 *    - logWarn(event, data?)
 *    - logError(event, data?, err?)
 * 
 * 2. src/lib/http.ts (Panel)
 *    - fetchWithTimeout(url, init?)
 *    - fetchWithRetry(url, init?, retryOpts?)
 * 
 * 3. discord-worker/src/lib/worker-http.ts
 *    - fetchWithRetry(url, init?, retryOpts?)
 * 
 * 4. proxy.ts (Panel middleware)
 *    - Generates requestId per request
 *    - Attaches to response headers
 *    - Logs http_request events
 * 
 * ═══════════════════════════════════════════════════════════
 * 
 * QUICK START
 * ───────────
 * 
 * In any API route:
 * 
 *   import { makeRequestId, logInfo, logError } from "@/lib/obs";
 *   
 *   export async function POST(req, context) {
 *     const startTime = Date.now();
 *     const requestId = req.headers.get("x-request-id") || makeRequestId();
 *     
 *     logInfo("api_myfeature_start", { requestId, userId });
 *     
 *     try {
 *       const result = await prisma.myTable.create({...});
 *       
 *       logInfo("api_myfeature_success", {
 *         requestId,
 *         durationMs: Date.now() - startTime,
 *       });
 *       
 *       return NextResponse.json({ ok: true, ...result });
 *     } catch (err) {
 *       logError("api_myfeature_error", {
 *         requestId,
 *         durationMs: Date.now() - startTime,
 *       }, err);
 *       
 *       return NextResponse.json(
 *         { ok: false, error: { code: "ERROR_CODE", requestId } },
 *         { status: 500 }
 *       );
 *     }
 *   }
 * 
 * ═══════════════════════════════════════════════════════════
 * 
 * LOG FORMAT
 * ──────────
 * 
 * All logs are one-line JSON:
 * 
 *   {
 *     "timestamp": "2025-02-05T12:34:56.789Z",
 *     "level": "info|warn|error",
 *     "event": "api_myroute_success",
 *     "requestId": "550e8400-e29b-41d4-a716-446655440000",
 *     "durationMs": 42,
 *     ...otherFields,
 *     "error": {  // only if logError() called with err param
 *       "name": "PrismaClientKnownRequestError",
 *       "message": "Unique constraint violated",
 *       "stack": "..."
 *     }
 *   }
 * 
 * ═══════════════════════════════════════════════════════════
 * 
 * HTTP RETRY PATTERNS
 * ───────────────────
 * 
 * In client code fetching panel APIs:
 * 
 *   import { fetchWithRetry } from "@/lib/http";
 *   
 *   const response = await fetchWithRetry(
 *     "https://api.example.com/endpoint",
 *     { 
 *       method: "POST",
 *       headers: { "Content-Type": "application/json" },
 *       body: JSON.stringify(payload),
 *       requestId,  // Optional: attach request ID to headers
 *     },
 *     { retries: 3, minDelayMs: 300, maxDelayMs: 3000 }
 *   );
 * 
 * For Worker Discord:
 * 
 *   import { fetchWithRetry } from "@/lib/worker-http";
 *   import { makeJobId, logInfo } from "@/lib/worker-obs";
 *   
 *   const jobId = makeJobId();
 *   logInfo("job_fetch_start", { jobId, targetUrl });
 *   
 *   try {
 *     const res = await fetchWithRetry(url, {
 *       method: "POST",
 *       headers: { "x-ingest-secret": secret },
 *       jobId,  // Attached as x-job-id header
 *     });
 *     const json = await res.json();
 *     logInfo("job_fetch_success", { jobId, status: res.status });
 *   } catch (err) {
 *     logError("job_fetch_failed", { jobId }, err);
 *   }
 * 
 * ═══════════════════════════════════════════════════════════
 * 
 * RETRY BEHAVIOR
 * ──────────────
 * 
 * fetchWithRetry automatically retries on:
 * - Network errors (connection reset, timeout, abort)
 * - 408 Request Timeout
 * - 429 Too Many Requests
 * - 5xx Server Errors (500-599)
 * 
 * Does NOT retry on:
 * - 4xx errors (except 408, 429)
 * - 2xx/3xx success responses
 * 
 * Backoff formula: min(maxDelay, minDelay * 2^attempt + random(0, maxDelay))
 * 
 * Default: 3 retries, 300-3000ms backoff
 * 
 * ═══════════════════════════════════════════════════════════
 * 
 * INTEGRATION POINTS (TODO)
 * ─────────────────────────
 * 
 * Routes that should have observability added:
 * 
 * HIGH PRIORITY (critical path):
 * - [ ] /api/discord/interactions (modal submissions)
 * - [ ] /api/staff/sanctions (judgment operations)
 * - [ ] /api/staff/recruitment (recruitment decisions)
 * - [ ] /api/ingest/tickets (ticket sync)
 * 
 * MEDIUM PRIORITY (user-facing):
 * - [ ] /api/staff/members (member operations)
 * - [ ] /api/contact/link-request (link requests)
 * - [ ] /api/staff/absences (absence tracking)
 * 
 * LOWER PRIORITY (diagnostic):
 * - [ ] /api/debug/* (debug endpoints - minimal logging)
 * - [ ] /api/admin/* (admin operations)
 * 
 * ═══════════════════════════════════════════════════════════
 * 
 * WORKER INTEGRATION EXAMPLE
 * ──────────────────────────
 * 
 * In discord-worker/src/your-handler.ts:
 * 
 *   import { makeJobId, logInfo, logError } from "@/lib/worker-obs";
 *   import { fetchWithRetry } from "@/lib/worker-http";
 *   
 *   async function processInteractionJob(job) {
 *     const jobId = makeJobId();
 *     const startTime = Date.now();
 *     
 *     logInfo("job_interaction_start", {
 *       jobId,
 *       interactionId: job.id,
 *       type: job.type,
 *     });
 *     
 *     try {
 *       // Call panel API with retry
 *       const res = await fetchWithRetry(
 *         `${PANEL_URL}/api/staff/link/${job.discordId}`,
 *         { method: "POST", body: JSON.stringify(job), jobId }
 *       );
 *       
 *       if (!res.ok) {
 *         logWarn("job_api_error", {
 *           jobId,
 *           status: res.status,
 *         });
 *         // Handle error...
 *       }
 *       
 *       logInfo("job_interaction_success", {
 *         jobId,
 *         durationMs: Date.now() - startTime,
 *       });
 *     } catch (err) {
 *       logError("job_interaction_failed", {
 *         jobId,
 *         durationMs: Date.now() - startTime,
 *       }, err);
 *     }
 *   }
 * 
 * ═══════════════════════════════════════════════════════════
 * 
 * ERROR RESPONSE FORMAT
 * ─────────────────────
 * 
 * Consistent error response structure:
 * 
 *   {
 *     "ok": false,
 *     "error": {
 *       "code": "FK_CONSTRAINT_FAILED",
 *       "message": "Family not found: esperados",
 *       "requestId": "550e8400-e29b-41d4-a716-446655440000",
 *       // Additional context fields as needed
 *     }
 *   }
 * 
 * Always include requestId in error responses for tracing.
 * 
 * ═══════════════════════════════════════════════════════════
 * 
 * MONITORING & ALERTING
 * ─────────────────────
 * 
 * Recommended alert triggers:
 * 
 * 1. Parse JSON logs from stdout/stderr
 * 2. Group by event name and level
 * 3. Alert on:
 *    - Any error-level events in production
 *    - api_* events with durationMs > 5000 (slow requests)
 *    - job_* events with retries > 2 (excessive retries)
 *    - RequestId not found in error responses
 * 
 * Example CloudWatch Insights query:
 * 
 *   fields @timestamp, level, event, requestId, durationMs
 *   | filter level = "error" or durationMs > 5000
 *   | stats count() as ErrorCount by event
 * 
 * ═══════════════════════════════════════════════════════════
 */

export const OBS_INTEGRATION_COMPLETE = true;
