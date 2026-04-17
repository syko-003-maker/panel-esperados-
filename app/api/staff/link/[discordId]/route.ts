import { NextResponse, NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { Prisma } from "@prisma/client";
import { DEFAULT_FAMILY_ID, getFamilyName } from "@/lib/family";
import { makeRequestId, logInfo, logError } from "@/lib/obs";
import { normalizeSteamId64 } from "@/lib/validation/steamid";
import { resolveRankFromDiscord } from "@/lib/discord-rank";
import { findBlockingSteamLink } from "@/lib/link-conflicts";
const INGEST_SECRET = process.env.INGEST_SECRET ?? "";

type Context = {
  params: Promise<{
    discordId: string;
  }>;
};

class LinkConflictError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

/**
 * ✅ SECURITY: GET /api/staff/link/{discordId}
 * 
 * Authorization (either):
 * - NextAuth session with Chef/État-Major role (staff web UI)
 * - x-ingest-secret header (Discord worker machine-to-machine)
 * 
 * Returns:
 * - 401: Not authenticated
 * - 403: Not authorized
 * - 404: Member link not found
 * - 200: Success with member link data (JSON only)
 */
export async function GET(
  req: NextRequest,
  context: Context
) {
  const startTime = Date.now();
  const requestId = req.headers.get("x-request-id") || makeRequestId();
  const { discordId } = await context.params;

  logInfo("api_link_get_start", {
    requestId,
    discordId,
  });

  if (!discordId) {
    return NextResponse.json(
      { error: "MISSING_DISCORD_ID", ok: false },
      { status: 400 }
    );
  }

  // ✅ SECURITY: Check ingest secret first (worker auth)
  const ingestSecret = req.headers.get("x-ingest-secret");
  if (ingestSecret) {
    if (!INGEST_SECRET) {
      return NextResponse.json(
        { error: "INGEST_SECRET_NOT_CONFIGURED", ok: false },
        { status: 503 }
      );
    }
    if (ingestSecret !== INGEST_SECRET) {
      return NextResponse.json(
        { error: "INVALID_INGEST_SECRET", ok: false },
        { status: 401 }
      );
    }
    // ✅ Worker authenticated via secret - allow access
  } else {
    // Fall back to NextAuth session guard for staff users
    const { requireLinkAccess } = await import("@/lib/guards");
    
    const guard = await requireLinkAccess();
    if (guard instanceof Response) {
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN" },
        { status: 403 }
      );
    }
    // ✅ Staff user authenticated via NextAuth
  }

  if (!DEFAULT_FAMILY_ID) {
    return NextResponse.json(
      { ok: false, error: "MISSING_FAMILY_ID" },
      { status: 500 }
    );
  }

  // Get Family.id by slug
  const family = await prisma.family.findUnique({
    where: { slug: DEFAULT_FAMILY_ID },
    select: { id: true },
  });

  if (!family) {
    console.error("[link:GET:discordId] Family not found:", DEFAULT_FAMILY_ID);
    return NextResponse.json(
      { ok: false, error: "FAMILY_NOT_FOUND" },
      { status: 500 }
    );
  }

  const familyDbId = family.id;

  const link = await prisma.member.findUnique({
    where: { familyId_discordId: { familyId: familyDbId, discordId } },
    select: {
      id: true,
      discordId: true,
      steamId: true,
      rpName: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!link) {
    logError("api_link_get_not_found", {
      requestId,
      discordId,
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: "NOT_FOUND", ok: false },
      { status: 404 }
    );
  }

  logInfo("api_link_get_success", {
    requestId,
    discordId,
    durationMs: Date.now() - startTime,
  });

  return NextResponse.json({
    ok: true,
    ...link,
  });
}

/**
 * ✅ SECURITY: POST /api/staff/link/{discordId}
 * 
 * Authorization (either):
 * - NextAuth session with Chef/État-Major role (staff web UI)
 * - x-ingest-secret header (Discord worker machine-to-machine)
 * 
 * Creates or updates a member link with explicit discordId in URL.
 * 
 * Returns:
 * - 401: Not authenticated
 * - 403: Not authorized
 * - 400: Missing/invalid data
 * - 200: Success (JSON only)
 */
// curl.exe -X POST "https://losesperados.fr/api/staff/link/123456789" -H "x-ingest-secret: <secret>" -H "Content-Type: application/json" -d "{\"steamId64\":\"76561198012345678\",\"rpName\":\"Jean Dupont\"}"
export async function POST(
  req: NextRequest,
  context: Context
) {
  const startTime = Date.now();
  const requestId = req.headers.get("x-request-id") || makeRequestId();
  const { discordId } = await context.params;

  logInfo("api_link_post_start", {
    requestId,
    discordId,
  });

  if (!discordId) {
    return NextResponse.json(
      { error: "MISSING_DISCORD_ID", ok: false },
      { status: 400 }
    );
  }

  // ✅ SECURITY: Check ingest secret first (worker auth)
  const ingestSecret = req.headers.get("x-ingest-secret");
  if (ingestSecret) {
    if (!INGEST_SECRET) {
      return NextResponse.json(
        { error: "INGEST_SECRET_NOT_CONFIGURED", ok: false },
        { status: 503 }
      );
    }
    if (ingestSecret !== INGEST_SECRET) {
      return NextResponse.json(
        { error: "INVALID_INGEST_SECRET", ok: false },
        { status: 401 }
      );
    }
    // ✅ Worker authenticated via secret - allow access
  } else {
    // Fall back to NextAuth session guard for staff users
    const { requireLinkAccess } = await import("@/lib/guards");
    
    const guard = await requireLinkAccess();
    if (guard instanceof Response) {
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN" },
        { status: 403 }
      );
    }
    // ✅ Staff user authenticated via NextAuth
  }

  // Parse request body
  const contentType = req.headers.get("content-type") ?? "";
  let data: Record<string, any> = {};

  if (contentType.includes("application/json")) {
    const json = await req.json().catch(() => ({}));
    data = json && typeof json === "object" ? (json as any) : {};
  } else {
    const formData = await req.formData();
    data = Object.fromEntries(formData.entries());
  }

  const steamId = String(data.steamId ?? data.steamId64 ?? "").trim();
  const rpNameRaw = String(data.rpName ?? "").trim();
  const ageRaw = String(data.age ?? "").trim();

  // Validate body
  const steamIdValid = /^\d{17}$/.test(steamId);
  const rpNameValid = !rpNameRaw || (rpNameRaw.length >= 2 && rpNameRaw.length <= 64);

  if (!steamId || !steamIdValid || !rpNameValid) {
    return NextResponse.json(
      { ok: false, error: "INVALID_BODY" },
      { status: 400 }
    );
  }

  if (!DEFAULT_FAMILY_ID) {
    return NextResponse.json(
      { ok: false, error: "MISSING_FAMILY_ID" },
      { status: 500 }
    );
  }

  const family = await prisma.family.upsert({
    where: { slug: DEFAULT_FAMILY_ID },
    update: { name: getFamilyName(DEFAULT_FAMILY_ID) },
    create: { slug: DEFAULT_FAMILY_ID, name: getFamilyName(DEFAULT_FAMILY_ID) },
  });
  const familyDbId = family.id;

  // Validate data
  let age: number | null = null;
  if (ageRaw) {
    const parsed = Number(ageRaw);
    if (!Number.isInteger(parsed)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_BODY" },
        { status: 400 }
      );
    }
    age = parsed;
  }

  const rpName = rpNameRaw ? rpNameRaw : null;

  logInfo("link_bind_start", {
    requestId,
    discordId,
    steamId,
    steamIdLength: steamId.length,
    steamIdValid: /^\d{17}$/.test(steamId),
    rpName,
  });

  try {
    const result = await prisma.$transaction(async (tx) => {
      const byDiscord = await tx.member.findUnique({
        where: { familyId_discordId: { familyId: familyDbId, discordId } },
        select: { id: true, discordId: true, steamId: true },
      });

      const bySteam = steamId
        ? await tx.member.findUnique({
            where: { familyId_steamId: { familyId: familyDbId, steamId } },
            select: { id: true, discordId: true, steamId: true },
          })
        : null;

      const transferableBySteam = !byDiscord && bySteam ? bySteam : null;

      const steamConflict = await findBlockingSteamLink(tx, {
        familyId: familyDbId,
        steamId,
        excludeDiscordId: discordId,
        excludeMemberId: transferableBySteam?.id ?? byDiscord?.id ?? null,
      });

      if (steamConflict) {
        throw new LinkConflictError(
          "STEAM_ALREADY_LINKED",
          "Ce SteamID est déjà lié à un autre Discord."
        );
      }

      if (byDiscord) {
        const member = await tx.member.update({
          where: { familyId_discordId: { familyId: familyDbId, discordId } },
          data: { steamId, rpName, age },
          select: {
            id: true,
            discordId: true,
            steamId: true,
            rpName: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        
        logInfo("link_member_updated_by_discord", {
          requestId,
          memberId: member.id,
          discordId: member.discordId,
          steamId: member.steamId,
          rpName: member.rpName,
        });
        
        return { member, mode: "update_by_discord" } as const;
      }

      if (bySteam) {
        const member = await tx.member.update({
          where: { familyId_steamId: { familyId: familyDbId, steamId } },
          data: { discordId, rpName, age },
          select: {
            id: true,
            discordId: true,
            steamId: true,
            rpName: true,
            createdAt: true,
            updatedAt: true,
          },
        });
        
        logInfo("link_member_updated_by_steam", {
          requestId,
          memberId: member.id,
          discordId: member.discordId,
          steamId: member.steamId,
          rpName: member.rpName,
        });
        
        return { member, mode: "update_by_steam" } as const;
      }

      // ✅ Validation SteamID avant création
      const validatedSteamId = normalizeSteamId64(steamId);
      if (!validatedSteamId && steamId) {
        throw new Error(`Invalid SteamID64 format: ${steamId}`);
      }

      const member = await tx.member.create({
        data: {
          familyId: familyDbId,
          discordId,
          steamId: validatedSteamId,
          rpName,
          age,
          source: "LINK" as const, // ✅ Provenance: Link system
        },
        select: {
          id: true,
          discordId: true,
          steamId: true,
          rpName: true,
          createdAt: true,
          updatedAt: true,
        },
      });
      
      logInfo("link_member_created", {
        requestId,
        memberId: member.id,
        discordId: member.discordId,
        steamId: member.steamId,
        rpName: member.rpName,
      });

      return { member, mode: "create" } as const;
    });

    const member = result.member;

    // Resolve Discord rank and persist to member
    const rankInfo = await resolveRankFromDiscord(discordId);
    let rankRoleId: string | null = rankInfo.rankRoleId;
    let rankLabel: string | null = rankInfo.rankLabel;

    if (rankRoleId !== null || rankLabel !== null) {
      try {
        const updatedMember = await prisma.member.update({
          where: { id: member.id },
          data: {
            rankRoleId,
            rankLabel,
          },
          select: {
            id: true,
            discordId: true,
            steamId: true,
            rpName: true,
            rankRoleId: true,
            rankLabel: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        logInfo("link_rank_resolved", {
          requestId,
          memberId: member.id,
          rankRoleId,
          rankLabel,
        });

        Object.assign(member, updatedMember);
      } catch (err) {
        logError("link_rank_persist_error", {
          requestId,
          memberId: member.id,
          error: err instanceof Error ? err.message : String(err),
        });
        // Don't fail the endpoint - rank is non-critical
      }
    }

    logInfo("api_link_post_success", {
      requestId,
      discordId,
      durationMs: Date.now() - startTime,
      memberId: member.id,
      mode: result.mode,
      rankRoleId,
      rankLabel,
    });

    const response = NextResponse.json({
      ok: true,
      member: {
        id: member.id,
        discordId: member.discordId,
        steamId: member.steamId,
        rpName: member.rpName,
        rankRoleId: rankRoleId,
        rankLabel: rankLabel,
        createdAt: member.createdAt,
        updatedAt: member.updatedAt,
      },
      // Flat format for backward compatibility
      id: member.id,
      discordId: member.discordId,
      steamId: member.steamId,
      rpName: member.rpName,
      rankRoleId: rankRoleId,
      rankLabel: rankLabel,
      mode: result.mode,
      memberId: member.id,  // Legacy field name
      createdAt: member.createdAt,
      updatedAt: member.updatedAt,
    });
    
    return response;
  } catch (error: any) {
    if (error instanceof LinkConflictError) {
      logError("api_link_post_conflict", {
        requestId,
        discordId,
        durationMs: Date.now() - startTime,
        errorCode: error.code,
      });

      return NextResponse.json(
        {
          ok: false,
          error: {
            code: error.code,
            message: error.message,
            requestId,
          },
        },
        { status: 409 }
      );
    }

    logError("api_link_post_error", {
      requestId,
      discordId,
      durationMs: Date.now() - startTime,
      errorCode: error?.code,
    }, error);

    // Handle Prisma-specific errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2002") {
        return NextResponse.json(
          { 
            ok: false, 
            error: { 
              code: "CONSTRAINT_VIOLATION", 
              message: "Duplicate key constraint",
              requestId,
            } 
          },
          { status: 409 }
        );
      }

      if (error.code === "P2003") {
        return NextResponse.json(
          { 
            ok: false, 
            error: { 
              code: "FK_CONSTRAINT_FAILED", 
              message: `Family not found: ${DEFAULT_FAMILY_ID}`,
              requestId,
            } 
          },
          { status: 500 }
        );
      }

      if (error.code === "P2025") {
        return NextResponse.json(
          { 
            ok: false, 
            error: { 
              code: "RECORD_NOT_FOUND",
              message: "Record not found",
              requestId,
            } 
          },
          { status: 404 }
        );
      }

      return NextResponse.json(
        { 
          ok: false, 
          error: { 
            code: error.code ?? "DB_ERROR",
            message: "Database error",
            requestId,
          } 
        },
        { status: 500 }
      );
    }

    // Generic error
    return NextResponse.json(
      { 
        ok: false, 
        error: { 
          code: "INTERNAL_ERROR",
          message: error?.message ?? "Internal server error",
          requestId,
        } 
      },
      { status: 500 }
    );
  }
}

/**
 * ✅ SECURITY: DELETE /api/staff/link/{discordId}
 * 
 * Authorization (either):
 * - NextAuth session with Chef/État-Major role (staff web UI)
 * - x-ingest-secret header (Discord worker machine-to-machine)
 * 
 * Returns:
 * - 401: Not authenticated
 * - 403: Not authorized
 * - 404: Member link not found
 * - 200: Success (JSON only)
 */
export async function DELETE(
  req: NextRequest,
  context: Context
) {
  const startTime = Date.now();
  const requestId = req.headers.get("x-request-id") || makeRequestId();
  const { discordId } = await context.params;

  logInfo("api_link_delete_start", {
    requestId,
    discordId,
  });

  if (!discordId) {
    return NextResponse.json(
      { error: "MISSING_DISCORD_ID", ok: false },
      { status: 400 }
    );
  }

  // ✅ SECURITY: Check ingest secret first (worker auth)
  const ingestSecret = req.headers.get("x-ingest-secret");
  if (ingestSecret) {
    if (!INGEST_SECRET) {
      return NextResponse.json(
        { error: "INGEST_SECRET_NOT_CONFIGURED", ok: false },
        { status: 503 }
      );
    }
    if (ingestSecret !== INGEST_SECRET) {
      return NextResponse.json(
        { error: "INVALID_INGEST_SECRET", ok: false },
        { status: 401 }
      );
    }
    // ✅ Worker authenticated via secret - allow access
  } else {
    // Fall back to NextAuth session guard for staff users
    const { requireLinkAccess } = await import("@/lib/guards");
    
    const guard = await requireLinkAccess();
    if (guard instanceof Response) {
      return NextResponse.json(
        { ok: false, error: "FORBIDDEN" },
        { status: 403 }
      );
    }
    // ✅ Staff user authenticated via NextAuth
  }

  if (!DEFAULT_FAMILY_ID) {
    return NextResponse.json(
      { ok: false, error: "MISSING_FAMILY_ID" },
      { status: 500 }
    );
  }

  const family = await prisma.family.findUnique({
    where: { slug: DEFAULT_FAMILY_ID },
    select: { id: true },
  });

  if (!family) {
    console.error("[link:DELETE:discordId] Family not found:", DEFAULT_FAMILY_ID);
    return NextResponse.json(
      { ok: false, error: "FAMILY_NOT_FOUND" },
      { status: 500 }
    );
  }

  const familyDbId = family.id;

  // Delete the member link
  const member = await prisma.member.delete({
    where: { familyId_discordId: { familyId: familyDbId, discordId } },
    select: {
      id: true,
      discordId: true,
      steamId: true,
    },
  }).catch(() => null);

  if (!member) {
    logError("api_link_delete_not_found", {
      requestId,
      discordId,
      durationMs: Date.now() - startTime,
    });
    return NextResponse.json(
      { error: "NOT_FOUND", ok: false },
      { status: 404 }
    );
  }

  logInfo("api_link_delete_success", {
    requestId,
    discordId,
    durationMs: Date.now() - startTime,
    memberId: member.id,
  });

  return NextResponse.json({
    ok: true,
    message: "Link deleted successfully",
    discordId: member.discordId,
  });
}
