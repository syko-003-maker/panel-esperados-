/**
 * OBSERVABILITY-INTEGRATION-EXAMPLE.ts
 * 
 * Template showing how to integrate observability into existing routes
 * This example demonstrates the pattern for a ticket sync endpoint.
 * 
 * Apply this pattern to any critical route in the panel.
 */

// ============================================================
// EXAMPLE 1: Modal Submission Handler
// Location: app/api/discord/interactions/route.ts (TODO)
// ============================================================

/*
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { 
  makeRequestId, 
  logInfo, 
  logError, 
  logWarn 
} from "@/lib/obs";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = req.headers.get("x-request-id") || makeRequestId();
  
  logInfo("api_discord_interactions_start", {
    requestId,
  });

  try {
    const body = await req.json();
    const { type, data } = body;

    logInfo("api_discord_interactions_received", {
      requestId,
      type,
      dataKeys: Object.keys(data),
    });

    // Process interaction...
    const result = await handleInteraction(type, data, {
      requestId,
    });

    logInfo("api_discord_interactions_success", {
      requestId,
      durationMs: Date.now() - startTime,
      type,
    });

    return NextResponse.json({ ok: true, result });
  } catch (err) {
    logError("api_discord_interactions_error", {
      requestId,
      durationMs: Date.now() - startTime,
    }, err);

    return NextResponse.json({
      ok: false,
      error: {
        code: "INTERACTION_FAILED",
        requestId,
      },
    }, { status: 500 });
  }
}
*/

// ============================================================
// EXAMPLE 2: Ticket Sync Handler with Retry
// Location: app/api/ingest/tickets/route.ts (TODO)
// ============================================================

/*
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchWithRetry } from "@/lib/http";
import { 
  makeRequestId, 
  logInfo, 
  logError, 
  logWarn 
} from "@/lib/obs";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = req.headers.get("x-request-id") || makeRequestId();
  const ingestSecret = req.headers.get("x-ingest-secret");

  logInfo("api_ingest_tickets_start", {
    requestId,
    hasSecret: !!ingestSecret,
  });

  // Validate ingest secret (example)
  if (!ingestSecret || ingestSecret !== process.env.INGEST_SECRET) {
    logWarn("api_ingest_tickets_unauthorized", {
      requestId,
    });
    return NextResponse.json(
      { ok: false, error: "Unauthorized" },
      { status: 401 }
    );
  }

  try {
    const tickets = await req.json();

    logInfo("api_ingest_tickets_parsing", {
      requestId,
      count: tickets.length,
    });

    // Fetch external data with retry
    let externalData;
    try {
      const res = await fetchWithRetry(
        "https://external-system.example.com/api/ticket-metadata",
        {
          method: "GET",
          headers: { "Authorization": `Bearer ${process.env.EXTERNAL_API_KEY}` },
          requestId,
          timeoutMs: 5000,
        },
        { retries: 2, minDelayMs: 500, maxDelayMs: 2000 }
      );
      externalData = await res.json();
    } catch (fetchErr) {
      logWarn("api_ingest_tickets_external_fetch_failed", {
        requestId,
        reason: fetchErr instanceof Error ? fetchErr.message : "Unknown",
      });
      // Continue with local data only
      externalData = {};
    }

    // Process and store
    const stored = [];
    for (const ticket of tickets) {
      const meta = externalData[ticket.id] || {};
      const result = await prisma.ticket.upsert({
        where: { externalId: ticket.id },
        update: { ...ticket, metadata: meta },
        create: { ...ticket, metadata: meta },
      });
      stored.push(result);
    }

    logInfo("api_ingest_tickets_success", {
      requestId,
      durationMs: Date.now() - startTime,
      storedCount: stored.length,
    });

    return NextResponse.json({ ok: true, stored });
  } catch (err) {
    logError("api_ingest_tickets_error", {
      requestId,
      durationMs: Date.now() - startTime,
    }, err);

    return NextResponse.json({
      ok: false,
      error: {
        code: "TICKETS_SYNC_FAILED",
        requestId,
      },
    }, { status: 500 });
  }
}
*/

// ============================================================
// EXAMPLE 3: Database Bulk Operation with Observability
// Location: app/api/staff/sanctions/route.ts (TODO)
// ============================================================

/*
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { 
  makeRequestId, 
  logInfo, 
  logError, 
  logWarn 
} from "@/lib/obs";
import { Prisma } from "@prisma/client";

export async function POST(req: NextRequest) {
  const startTime = Date.now();
  const requestId = req.headers.get("x-request-id") || makeRequestId();

  logInfo("api_sanctions_create_start", {
    requestId,
  });

  try {
    const payload = await req.json();
    const { 
      memberId, 
      reason, 
      severity, 
      expiresAt,
    } = payload;

    // Validate
    if (!memberId || !reason || !severity) {
      logWarn("api_sanctions_create_invalid_body", {
        requestId,
        providedFields: Object.keys(payload),
      });
      return NextResponse.json({
        ok: false,
        error: {
          code: "INVALID_BODY",
          message: "Missing required fields",
          requestId,
        },
      }, { status: 400 });
    }

    // Create sanction
    const sanction = await prisma.sanction.create({
      data: {
        memberId,
        reason,
        severity,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: "system", // In real code, get from auth
      },
      include: {
        member: {
          select: { discordId: true, steamId: true },
        },
      },
    });

    // Log successful creation
    logInfo("api_sanctions_create_success", {
      requestId,
      durationMs: Date.now() - startTime,
      sanctionId: sanction.id,
      memberId: sanction.member?.discordId,
    });

    return NextResponse.json({
      ok: true,
      sanction,
    });
  } catch (err) {
    const durationMs = Date.now() - startTime;

    // Handle specific Prisma errors
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      const errorCode = {
        P2002: "DUPLICATE_SANCTION",
        P2025: "MEMBER_NOT_FOUND",
      }[err.code] || "DB_ERROR";

      logError("api_sanctions_create_prisma_error", {
        requestId,
        durationMs,
        prismaCode: err.code,
      }, err);

      return NextResponse.json({
        ok: false,
        error: {
          code: errorCode,
          message: `Database error: ${err.code}`,
          requestId,
        },
      }, { status: 400 });
    }

    // Generic error handling
    logError("api_sanctions_create_error", {
      requestId,
      durationMs,
      errorType: err instanceof Error ? err.constructor.name : "Unknown",
    }, err);

    return NextResponse.json({
      ok: false,
      error: {
        code: "SANCTION_CREATION_FAILED",
        message: "Unable to create sanction",
        requestId,
      },
    }, { status: 500 });
  }
}
*/

// ============================================================
// PATTERN SUMMARY
// ============================================================

/**
 * Integration Pattern:
 * 
 * 1. Import observability utilities
 * 2. At handler start:
 *    - Record startTime = Date.now()
 *    - Extract or create requestId from header
 *    - logInfo("api_*_start", { requestId, ...context })
 * 
 * 3. Validation/authorization:
 *    - If invalid: logWarn("api_*_invalid_*", ...) + return 4xx
 *    - If unauthorized: logWarn("api_*_unauthorized", ...) + return 401/403
 * 
 * 4. Main operation in try/catch:
 *    - logInfo("api_*_processing", { requestId, ...details })
 *    - Do work
 *    - Log milestones with logInfo()
 * 
 * 5. On success:
 *    - logInfo("api_*_success", {
 *        requestId,
 *        durationMs: Date.now() - startTime,
 *        ...outcomes
 *      })
 *    - Return { ok: true, data }
 * 
 * 6. On error:
 *    - Handle specific errors (Prisma, validation, etc.)
 *    - logError("api_*_error_type", { 
 *        requestId, 
 *        durationMs, 
 *        ...context 
 *      }, err)
 *    - Return { ok: false, error: { code, message, requestId } }
 * 
 * KEY PRINCIPLES:
 * ✓ Every response includes requestId in error object
 * ✓ Every handler logs start and end
 * ✓ Duration is always recorded
 * ✓ Errors include full exception in logError() call
 * ✓ Use logWarn() for expected errors (validation)
 * ✓ Use logError() for unexpected errors (bugs, DB failures)
 * ✓ requestId flows through entire request lifecycle
 * ✓ No plain console.log - always use logInfo/logWarn/logError
 */

export const PATTERN_COMPLETE = true;
