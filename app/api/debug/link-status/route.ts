/**
 * DEBUG: Link Status Trace
 * Endpoint to diagnose why a member shows as "not linked" despite DB state
 * 
 * Traces the complete resolution path:
 * session.user.id → Account(provider="discord") → Member lookup
 * 
 * Protected: Requires authentication (dev mode), returns debug info
 * 
 * Usage:
 * - GET /api/debug/link-status (trace current session)
 * - GET /api/debug/link-status?discordId=123456789 (check specific discord id)
 */

import { getServerSession } from "next-auth";
import { authOptions } from "@/auth";
import { prisma } from "@/lib/db";
import { type NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

export const dynamic = "force-dynamic";
const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, max-age=0",
};

const FAMILY_ID = "esperados";

type DebugResponse = {
  mode: "session" | "lookup";
  sessionFound: boolean;
  userId: string | null;
  discordId: string | null;
  memberFound: boolean;
  memberDetails: {
    familyId: string | null;
    discordId: string | null;
    id: string | null;
    rpName: string | null;
    steamId: string | null;
    isActive: boolean | null;
  } | null;
  linkedStatus: boolean;
  resolution: {
    step1_session?: string;
    step2_account?: string;
    step3_member: string;
  };
  database: {
    host: string;
    name: string;
  };
  timestamp: string;
  debug: {
    sessionRaw?: any;
    accountRaw?: any;
    note?: string;
  };
};

export async function GET(request: NextRequest): Promise<Response> {
  try {
    // Extract database URL info
    const dbUrl = process.env.DATABASE_URL || "";
    const dbHostMatch = dbUrl.match(/@([^/]+)/);
    const dbNameMatch = dbUrl.match(/\/([^?]+)(\?|$)/);
    const dbHost = dbHostMatch ? dbHostMatch[1] : "unknown";
    const dbName = dbNameMatch ? dbNameMatch[1] : "unknown";

    const { searchParams } = new URL(request.url);
    const queryDiscordId = searchParams.get("discordId");
    
    // Check if running in development or with valid session
    const isDevMode = process.env.NODE_ENV !== "production";
    const session = isDevMode ? await getServerSession(authOptions) : null;
    
    // If production, require authentication
    if (!isDevMode && !session) {
      return NextResponse.json(
        { error: "Unauthorized. This endpoint is only available in development mode." },
        { status: 403, headers: NO_STORE_HEADERS }
      );
    }

    // MODE 1: Query a specific discordId (if provided in URL)
    if (queryDiscordId) {
      const debug: DebugResponse = {
        mode: "lookup",
        sessionFound: false,
        userId: null,
        discordId: queryDiscordId,
        memberFound: false,
        memberDetails: null,
        linkedStatus: false,
        resolution: {
          step3_member: "",
        },
        database: { host: dbHost, name: dbName },
        timestamp: new Date().toISOString(),
        debug: {},
      };

      // Direct lookup by familyId + discordId compound unique constraint
      const member = await prisma.member.findUnique({
        where: {
          familyId_discordId: {
            familyId: FAMILY_ID,
            discordId: queryDiscordId,
          },
        },
        select: {
          id: true,
          familyId: true,
          discordId: true,
          rpName: true,
          steamId: true,
          isActive: true,
        },
      });

      if (!member) {
        debug.resolution.step3_member = `❌ No Member found in familyId="${FAMILY_ID}" with discordId="${queryDiscordId}"`;
        debug.linkedStatus = false;
        return NextResponse.json(debug, { headers: NO_STORE_HEADERS });
      }

      debug.memberFound = true;
      debug.memberDetails = {
        familyId: member.familyId,
        discordId: member.discordId,
        id: member.id,
        rpName: member.rpName,
        steamId: member.steamId || null,
        isActive: member.isActive,
      };
      debug.linkedStatus = true;
      debug.resolution.step3_member = `✅ Member FOUND: id=${member.id}, rpName="${member.rpName}", steamId="${member.steamId}", isActive=${member.isActive}`;

      logger.debug("debug:link-status[lookup]", `discordId=${queryDiscordId}, memberFound=${debug.memberFound}`);
      return NextResponse.json(debug, { headers: NO_STORE_HEADERS });
    }

    // MODE 2: Trace from current session
    const debug: DebugResponse = {
      mode: "session",
      sessionFound: !!session,
      userId: null,
      discordId: null,
      memberFound: false,
      memberDetails: null,
      linkedStatus: false,
      resolution: {
        step1_session: "",
        step2_account: "",
        step3_member: "",
      },
      database: { host: dbHost, name: dbName },
      timestamp: new Date().toISOString(),
      debug: {
        sessionRaw: null,
        accountRaw: null,
      },
    };

    // Require authentication
    if (!session) {
      debug.resolution.step1_session = "❌ No session found. Authenticate first.";
      return NextResponse.json(debug, { status: 401, headers: NO_STORE_HEADERS });
    }

    debug.userId = (session as any).userId || (session.user as any)?.id || null;

    if (!debug.userId) {
      debug.resolution.step1_session = "✅ Session found but userId missing";
      return NextResponse.json(debug, { status: 400, headers: NO_STORE_HEADERS });
    }

    debug.resolution.step1_session = `✅ Session found: userId=${debug.userId}`;
    debug.debug.sessionRaw = {
      userId: debug.userId,
      userEmail: session.user?.email,
      userImage: session.user?.image,
      sessionDiscordId: (session as any).discordId || "(not set in callback)",
    };

    // Fetch Account record (provider="discord")
    const account = await prisma.account.findFirst({
      where: {
        userId: debug.userId,
        provider: "discord",
      },
      select: {
        providerAccountId: true,
        access_token: true,
        refresh_token: true,
        expires_at: true,
      },
    });

    if (!account) {
      debug.resolution.step2_account = `❌ No Discord Account found for userId=${debug.userId}`;
      return NextResponse.json(debug, { status: 400, headers: NO_STORE_HEADERS });
    }

    debug.discordId = account.providerAccountId;
    debug.resolution.step2_account = `✅ Account found: discordId=${debug.discordId}`;
    debug.debug.accountRaw = {
      providerAccountId: account.providerAccountId,
      hasAccessToken: !!account.access_token,
      hasRefreshToken: !!account.refresh_token,
      expiresAt: account.expires_at,
    };

    // ✅ CRITICAL: Query Member by compound unique constraint (familyId + discordId)
    // This is the SAME lookup used in getLinkedMemberBySession()
    const member = await prisma.member.findUnique({
      where: {
        familyId_discordId: {
          familyId: FAMILY_ID,
          discordId: debug.discordId,
        },
      },
      select: {
        id: true,
        familyId: true,
        discordId: true,
        rpName: true,
        steamId: true,
        isActive: true,
      },
    });

    if (!member) {
      debug.resolution.step3_member = `❌ No Member found in familyId="${FAMILY_ID}" with discordId="${debug.discordId}"`;
      debug.linkedStatus = false;
      
      // Also check if member exists with same discordId in OTHER families
      const memberOtherFamily = await prisma.member.findFirst({
        where: {
          discordId: debug.discordId,
        },
        select: {
          id: true,
          familyId: true,
          rpName: true,
        },
      });
      
      if (memberOtherFamily) {
        debug.debug.note = `⚠️  Member exists in familyId="${memberOtherFamily.familyId}" (not "${FAMILY_ID}")`;
      }
      
      return NextResponse.json(debug, { headers: NO_STORE_HEADERS });
    }

    debug.memberFound = true;
    debug.memberDetails = {
      familyId: member.familyId,
      discordId: member.discordId,
      id: member.id,
      rpName: member.rpName,
      steamId: member.steamId || null,
      isActive: member.isActive,
    };
    debug.linkedStatus = true;
    debug.resolution.step3_member = `✅ Member FOUND: id=${member.id}, rpName="${member.rpName}", steamId="${member.steamId}", isActive=${member.isActive}`;

    logger.debug(
      "debug:link-status[session]",
      `userId=${debug.userId}, discordId=${debug.discordId}, memberFound=${debug.memberFound}`
    );

    return NextResponse.json(debug, { headers: NO_STORE_HEADERS });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error("debug:link-status", message);
    return NextResponse.json(
      {
        error: message,
        timestamp: new Date().toISOString(),
      },
      { status: 500, headers: NO_STORE_HEADERS }
    );
  }
}
