import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, getFamilyName } from "@/lib/family";
import { recordPanelMetric } from "@/lib/metrics";
import { requireTicketsEnabled } from "@/lib/feature-guard";
import { normalizeSteamId64 } from "@/lib/validation/steamid";
import { resolveRankFromDiscord } from "@/lib/discord-rank";
import type { RecruitmentLegacyStatus, ComplaintStatus, Prisma } from "@prisma/client";

// ─────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────

const INGEST_SECRET = process.env.DISCORD_INGEST_SECRET ?? process.env.INGEST_SECRET;
const MAX_BODY_SIZE = 50 * 1024; // 50KB
const CURRENT_VERSION = 1;

if (!INGEST_SECRET) {
  console.error("[ingest/tickets] INGEST_SECRET not configured");
}

// ─────────────────────────────────────────────────────────────
// Validation helpers
// ─────────────────────────────────────────────────────────────

function validateSecret(req: Request): boolean {
  if (!INGEST_SECRET) return false;
  return req.headers.get("x-ingest-secret") === INGEST_SECRET;
}

function normalizeString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

const TICKET_KEY_PATTERN = /^[RC]-\d{8}-[A-Z0-9]{4}$/;
function isValidTicketKey(key: string): boolean {
  return TICKET_KEY_PATTERN.test(key);
}

function isValidThreadId(id: string): boolean {
  return /^\d{17,20}$/.test(id);
}

function log(eventType: string, ticketKey: string, data: Record<string, unknown> = {}) {
  console.log(JSON.stringify({
    event: "ingest",
    type: eventType,
    ticketKey,
    ...data,
    timestamp: new Date().toISOString(),
  }));
}

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type IngestEvent = {
  version?: number;
  familyId?: string;
  type: string;
  ticketKey: string;
  threadId: string;
  author?: { id: string; tag?: string };
  closedBy?: { id: string; tag?: string };
  payload?: Record<string, unknown>;
  status?: string;
  summary?: string | null;
};

type HandlerContext = {
  prisma: typeof prisma;
  familyId: string;
  fallbackUserId: string;
  now: Date;
};

type HandlerResult = 
  | { ok: true; alreadyClosed?: boolean }
  | { ok: false; error: string; status: number };

type EventHandler = (ctx: HandlerContext, event: IngestEvent) => Promise<HandlerResult>;

// ─────────────────────────────────────────────────────────────
// Event Handlers
// ─────────────────────────────────────────────────────────────

const handlers: Record<string, EventHandler> = {
  "recruitment.create": async (ctx, event) => {
    const authorId = event.author?.id;
    if (!authorId) {
      return { ok: false, error: "Missing author.id", status: 400 };
    }

    const authorTag = event.author?.tag ?? null;
    const payload = (event.payload ?? {}) as Prisma.InputJsonValue;
    const ticketKey = event.ticketKey;
    const threadId = event.threadId;

    const rpName = (payload as any)?.rpName || null;
    const steamId = (payload as any)?.steamId || null;
    const discordUsername = (payload as any)?.discordUsername || authorTag || null;
    const discordDisplayName = (payload as any)?.discordDisplayName || discordUsername || null;

    const recruitment = await ctx.prisma.recruitment.upsert({
      where: { ticketKey },
      create: {
        familyId: ctx.familyId,
        ticketKey,
        discordThreadId: threadId,
        discordId: authorId,
        authorTag,
        payload,
        status: "PENDING",
        createdById: ctx.fallbackUserId,
      },
      update: {
        discordThreadId: threadId,
        authorTag,
        payload,
      },
    });

    // ✅ PATCH: Upsert Member with rpName and discordUsername
    // This ensures Member is created with rpName from recruitment ticket
    if (authorId) {
      try {
        // First check if member exists and has rpName already
        const existingMember = await ctx.prisma.member.findUnique({
          where: {
            familyId_discordId: {
              familyId: ctx.familyId,
              discordId: authorId,
            },
          },
          select: { rpName: true },
        });

        // Build update data (for both create and update)
        const updateData: any = {
          // Only set rpName if member doesn't already have one
          rpName: existingMember?.rpName ? undefined : (rpName || null),
          // Always update Discord info for tracking
          discordUsername: discordUsername || null,
          discordDisplayName: discordDisplayName || null,
        };

        // Filter out undefined values
        const updateDataFiltered = Object.fromEntries(
          Object.entries(updateData).filter(([_, v]) => v !== undefined)
        );

        // ✅ Validation SteamID avant création/update
        const validatedSteamId = normalizeSteamId64(steamId);

        const upsertedMember = await ctx.prisma.member.upsert({
          where: {
            familyId_discordId: {
              familyId: ctx.familyId,
              discordId: authorId,
            },
          },
          create: {
            family: { connect: { id: ctx.familyId } },
            discordId: authorId,
            rpName: rpName || null,
            discordUsername: discordUsername || null,
            discordDisplayName: discordDisplayName || null,
            steamId: validatedSteamId,
            isActive: false, // ✅ Only LYG sync sets isActive=true
            source: "RECRUITMENT" as const, // ✅ Provenance: Ticket recrutement
          },
          update: updateDataFiltered,
          select: { id: true },
        });

        // Resolve and persist Discord rank for recruited member
        try {
          const rankInfo = await resolveRankFromDiscord(authorId);
          if (rankInfo.rankRoleId !== null || rankInfo.rankLabel !== null) {
            await ctx.prisma.member.update({
              where: { id: upsertedMember.id },
              data: {
                rankRoleId: rankInfo.rankRoleId,
                rankLabel: rankInfo.rankLabel,
              },
            });
          }
        } catch (rankErr) {
          console.debug("[ingest:recruitment.create] Rank resolution failed:", rankErr);
          // Rank resolution is non-critical, don't fail the request
        }
      } catch (memberErr) {
        console.error("[ingest:recruitment.create] Member upsert failed:", memberErr);
        // Don't fail the whole request if member upsert fails
      }
    }

    // Get Discord config for recruitment channel
    const discordConfig = await ctx.prisma.discordConfig.findUnique({
      where: { familyId: ctx.familyId },
      select: { recruitmentChannelId: true },
    });

    // Create Discord notification job if channel is configured
    if (discordConfig?.recruitmentChannelId && recruitment.id) {
      const displayRpName = rpName || authorTag || authorId;

      await ctx.prisma.discordOutbox.create({
        data: {
          status: "PENDING",
          type: "SANCTION_NOTIFY",
          familyId: ctx.familyId,
          entityId: recruitment.id,
          channelId: discordConfig.recruitmentChannelId,
          dedupeKey: `RECRUITMENT_CREATED:${recruitment.id}:${Date.now()}`,
          attempt: 0,
          maxAttempts: 5,
          nextAttemptAt: new Date(),
          meta: {
            kind: "RECRUITMENT_CREATED",
            recruitmentId: recruitment.id,
            rpName: displayRpName,
            discordId: authorId,
            steamId,
            createdAt: ctx.now.toISOString(),
          },
        },
      });
    }

    log("recruitment.create", ticketKey, { familyId: ctx.familyId, ok: true, rpName, authorId });
    return { ok: true };
  },

  "recruitment.close": async (ctx, event) => {
    const closedById = event.closedBy?.id;
    if (!closedById) {
      return { ok: false, error: "Missing closedBy.id", status: 400 };
    }

    const ticketKey = event.ticketKey;
    const threadId = event.threadId;

    // Double-close protection
    const existing = await ctx.prisma.recruitment.findUnique({
      where: { ticketKey },
      select: { id: true, closedAt: true, status: true },
    });

    if (existing?.closedAt || existing?.status === "ARCHIVED") {
      log("recruitment.close", ticketKey, { alreadyClosed: true });
      return { ok: true, alreadyClosed: true };
    }

    await ctx.prisma.recruitment.upsert({
      where: { ticketKey },
      create: {
        familyId: ctx.familyId,
        ticketKey,
        discordThreadId: threadId,
        discordId: "unknown",
        authorTag: null,
        payload: {} as Prisma.InputJsonValue,
        status: "ARCHIVED" as RecruitmentLegacyStatus,
        closedAt: ctx.now,
        closedByDiscordId: closedById,
        closeReason: "FIN_RECRUTEMENT",
        createdById: ctx.fallbackUserId,
      },
      update: {
        status: "ARCHIVED" as RecruitmentLegacyStatus,
        closedAt: ctx.now,
        closedByDiscordId: closedById,
        closeReason: "FIN_RECRUTEMENT",
      },
    });

    log("recruitment.close", ticketKey, { familyId: ctx.familyId, ok: true });
    return { ok: true };
  },

  "complaint.create": async (ctx, event) => {
    const authorId = event.author?.id;
    if (!authorId) {
      return { ok: false, error: "Missing author.id", status: 400 };
    }

    const authorTag = event.author?.tag ?? null;
    const payload = (event.payload ?? {}) as Prisma.InputJsonValue;
    const ticketKey = event.ticketKey;
    const threadId = event.threadId;

    const complaint = await ctx.prisma.complaint.upsert({
      where: { ticketKey },
      create: {
        familyId: ctx.familyId,
        ticketKey,
        discordThreadId: threadId,
        authorDiscordId: authorId,
        complainantId: authorId,
        authorTag,
        payload,
        title: `Plainte ${ticketKey}`,
        description: "-",
        status: "OPEN",
        createdById: ctx.fallbackUserId,
      },
      update: {
        discordThreadId: threadId,
        authorTag,
        payload,
      },
    });

    // Get Discord config for complaints channel
    const discordConfig = await ctx.prisma.discordConfig.findUnique({
      where: { familyId: ctx.familyId },
      select: { complaintsChannelId: true },
    });

    // Create Discord notification job if channel is configured
    if (discordConfig?.complaintsChannelId && complaint.id) {
      const reason = (payload as any)?.reason || "Non spécifiée";
      const targetDiscordId = (payload as any)?.targetDiscordId || null;

      await ctx.prisma.discordOutbox.create({
        data: {
          status: "PENDING",
          type: "SANCTION_NOTIFY",
          familyId: ctx.familyId,
          entityId: complaint.id,
          channelId: discordConfig.complaintsChannelId,
          dedupeKey: `PLAINT_CREATED:${complaint.id}:${Date.now()}`,
          attempt: 0,
          maxAttempts: 5,
          nextAttemptAt: new Date(),
          meta: {
            kind: "PLAINT_CREATED",
            complaintId: complaint.id,
            authorDiscordId: authorId,
            targetDiscordId: targetDiscordId,
            reason: reason,
            createdAt: ctx.now.toISOString(),
          },
        },
      });
    }

    log("complaint.create", ticketKey, { familyId: ctx.familyId, ok: true });
    return { ok: true };
  },

  "complaint.close": async (ctx, event) => {
    const closedById = event.closedBy?.id;
    if (!closedById) {
      return { ok: false, error: "Missing closedBy.id", status: 400 };
    }

    const statusRaw = normalizeString(event.status);
    if (!statusRaw || !["TRAITE", "NON_RESOLUE", "REFUSE"].includes(statusRaw.toUpperCase())) {
      return { ok: false, error: "Missing or invalid status", status: 400 };
    }

    const ticketKey = event.ticketKey;
    const threadId = event.threadId;

    // Double-close protection
    const existing = await ctx.prisma.complaint.findUnique({
      where: { ticketKey },
      select: { id: true, closedAt: true, status: true },
    });

    if (existing?.closedAt || (existing?.status && existing.status !== "OPEN")) {
      log("complaint.close", ticketKey, { alreadyClosed: true });
      return { ok: true, alreadyClosed: true };
    }

    const summaryText = normalizeString(event.summary);
    const statusMap: Record<string, ComplaintStatus> = {
      TRAITE: "RESOLVED",
      NON_RESOLUE: "REJECTED",
      REFUSE: "REJECTED",
    };
    const newStatus = statusMap[statusRaw.toUpperCase()] ?? "CLOSED";

    await ctx.prisma.complaint.upsert({
      where: { ticketKey },
      create: {
        familyId: ctx.familyId,
        ticketKey,
        discordThreadId: threadId,
        authorDiscordId: "unknown",
        complainantId: "unknown",
        authorTag: null,
        payload: {} as Prisma.InputJsonValue,
        title: `Plainte ${ticketKey}`,
        description: "-",
        status: newStatus,
        summary: summaryText,
        closedAt: ctx.now,
        closedByDiscordId: closedById,
        closeReason: statusRaw.toUpperCase(),
        createdById: ctx.fallbackUserId,
      },
      update: {
        status: newStatus,
        summary: summaryText,
        closedAt: ctx.now,
        closedByDiscordId: closedById,
        closeReason: statusRaw.toUpperCase(),
      },
    });

    log("complaint.close", ticketKey, { familyId: ctx.familyId, status: newStatus, ok: true });
    return { ok: true };
  },
};

// ─────────────────────────────────────────────────────────────
// Main Handler
// ─────────────────────────────────────────────────────────────

export async function POST(req: Request) {
  // Check feature flag
  const featureCheck = await requireTicketsEnabled("ingest");
  if (!featureCheck.allowed) return featureCheck.response;

  // Check secret is configured
  if (!INGEST_SECRET) {
    return NextResponse.json(
      { ok: false, error: "INGEST_SECRET not configured" },
      { status: 500 }
    );
  }

  // Validate secret header
  if (!validateSecret(req)) {
    console.warn(JSON.stringify({
      event: "ingest_unauthorized",
      userAgent: req.headers.get("user-agent")?.slice(0, 100) ?? null,
      timestamp: new Date().toISOString(),
    }));
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Check content length
  const contentLength = parseInt(req.headers.get("content-length") ?? "0", 10);
  if (contentLength > MAX_BODY_SIZE) {
    return NextResponse.json({ ok: false, error: "Body too large" }, { status: 413 });
  }

  // Parse body
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "Invalid body" }, { status: 400 });
  }

  const event = body as IngestEvent;

  // ─────────────────────────────────────────────────────────────
  // Version validation
  // ─────────────────────────────────────────────────────────────
  const version = typeof event.version === "number" ? event.version : null;
  if (version === null) {
    // For backwards compatibility, allow missing version but log warning
    console.warn(JSON.stringify({
      event: "ingest_version_missing",
      type: event.type,
      ticketKey: event.ticketKey,
      timestamp: new Date().toISOString(),
    }));
  } else if (version !== CURRENT_VERSION) {
    return NextResponse.json(
      { ok: false, error: `Unsupported version: ${version}, expected ${CURRENT_VERSION}` },
      { status: 400 }
    );
  }

  // ─────────────────────────────────────────────────────────────
  // Extract and validate fields
  // ─────────────────────────────────────────────────────────────
  const eventType = normalizeString(event.type);
  const ticketKey = normalizeString(event.ticketKey);
  const threadId = normalizeString(event.threadId);
  const familyId = normalizeString(event.familyId) ?? DEFAULT_FAMILY_ID;

  if (!eventType) {
    return NextResponse.json({ ok: false, error: "Missing type" }, { status: 400 });
  }

  if (!ticketKey) {
    return NextResponse.json({ ok: false, error: "Missing ticketKey" }, { status: 400 });
  }

  if (!threadId) {
    return NextResponse.json({ ok: false, error: "Missing threadId" }, { status: 400 });
  }

  if (!isValidTicketKey(ticketKey)) {
    return NextResponse.json({ ok: false, error: "Invalid ticketKey format" }, { status: 400 });
  }

  if (!isValidThreadId(threadId)) {
    return NextResponse.json({ ok: false, error: "Invalid threadId format" }, { status: 400 });
  }

  // ─────────────────────────────────────────────────────────────
  // Get handler
  // ─────────────────────────────────────────────────────────────
  const handler = handlers[eventType];
  if (!handler) {
    return NextResponse.json(
      { ok: false, error: `Unknown event type: ${eventType}` },
      { status: 400 }
    );
  }

  try {
    // ─────────────────────────────────────────────────────────────
    // FK SAFETY: Ensure Family exists
    // ─────────────────────────────────────────────────────────────
    await prisma.family.upsert({
      where: { slug: familyId },
      create: { slug: familyId, name: getFamilyName(familyId) },
      update: {},
    });

    // Find a staff/chef user for createdById
    const fallbackUser = await prisma.user.findFirst({
      where: { OR: [{ isChef: true }, { isStaff: true }] },
      select: { id: true },
    });

    if (!fallbackUser) {
      return NextResponse.json(
        { ok: false, error: "No staff user found" },
        { status: 500 }
      );
    }

    // ─────────────────────────────────────────────────────────────
    // Execute handler
    // ─────────────────────────────────────────────────────────────
    const ctx: HandlerContext = {
      prisma,
      familyId,
      fallbackUserId: fallbackUser.id,
      now: new Date(),
    };

    const result = await handler(ctx, { ...event, ticketKey, threadId });

    if (!result.ok) {
      // Record ingest failure metric
      recordPanelMetric("ingest.ko", ticketKey, {
        eventType,
        error: result.error,
        familyId,
      }).catch(() => {});

      return NextResponse.json(
        { ok: false, error: result.error },
        { status: result.status }
      );
    }

    // Record ingest success metric
    recordPanelMetric("ingest.ok", ticketKey, {
      eventType,
      familyId,
      alreadyClosed: result.alreadyClosed,
    }).catch(() => {});

    return NextResponse.json({ ok: true, alreadyClosed: result.alreadyClosed });
  } catch (err) {
    console.error("[ingest/tickets] Error:", err);

    // Record ingest error metric
    recordPanelMetric("ingest.ko", ticketKey ?? null, {
      eventType: event?.type ?? "unknown",
      error: err instanceof Error ? err.message : "Internal error",
      familyId,
    }).catch(() => {});

    return NextResponse.json(
      { ok: false, error: "Internal error" },
      { status: 500 }
    );
  }
}
