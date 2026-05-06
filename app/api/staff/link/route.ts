import { NextResponse, NextRequest } from "next/server";
import { getSession } from "@/auth";
import { requirePermission } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import { getDiscordIdFromSessionOrAccount } from "@/lib/me";
import { Prisma } from "@prisma/client";
import { resolveFamilyId } from "@/lib/family";

const INGEST_SECRET = process.env.INGEST_SECRET ?? "";

/**
 * POST /api/staff/link
 * 
 * Authorization (either):
 * - NextAuth session with LINK_MANAGE permission (staff web UI)
 * - x-ingest-secret header (Discord worker machine-to-machine)
 * 
 * For workers calling this endpoint:
 * - Must use discordId in request body (not targetDiscordId) 
 * - discordId is the member to link
 * - steamId and rpName are required
 * 
 * Returns:
 * - 401: Not authenticated
 * - 403: Not authorized
 * - 400: Missing/invalid data
 * - 200: Success (JSON only)
 */
export async function POST(req: NextRequest) {
  // Check ingest secret first (worker auth)
  const ingestSecret = req.headers.get("x-ingest-secret");
  let verifiedDiscordId: string | null = null;
  let isWorker = false;

  if (ingestSecret) {
    // Worker authentication
    if (!INGEST_SECRET) {
      return NextResponse.json(
        { ok: false, error: "INGEST_SECRET_NOT_CONFIGURED" },
        { status: 503 }
      );
    }
    if (ingestSecret !== INGEST_SECRET) {
      return NextResponse.json(
        { ok: false, error: "INVALID_INGEST_SECRET" },
        { status: 401 }
      );
    }
    isWorker = true;
    // For worker: discordId is in request body and is the target to link
  } else {
    // Staff authentication via NextAuth session
    const guard = await requirePermission("LINK_MANAGE");
    
    if (guard instanceof Response) {
      return guard;
    }

    const session = (guard as any).session;
    const sessionDiscordId = session?.discordId;
    const userId = session?.userId ?? session?.user?.id;

    if (!sessionDiscordId || !userId) {
      return NextResponse.json(
        { ok: false, error: "MISSING_AUTH_DATA" },
        { status: 401 }
      );
    }

    // Get verified Discord ID from session
    verifiedDiscordId = await getDiscordIdFromSessionOrAccount(session);

    if (!verifiedDiscordId) {
      console.error("[link:POST] Failed to verify Discord account for userId:", userId);
      return NextResponse.json(
        { ok: false, error: "NO_DISCORD_ACCOUNT" },
        { status: 403 }
      );
    }
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

  // Accept discordId from multiple sources (query string, body with multiple field names)
  const { searchParams } = new URL(req.url);
  const queryDiscordId = searchParams.get("discordId") || searchParams.get("targetDiscordId") || "";
  const bodyDiscordId = String(
    data.targetDiscordId ?? data.discordId ?? data.targetId ?? ""
  ).trim();
  
  const targetDiscordId = bodyDiscordId || queryDiscordId;
  const steamId = String(data.steamId ?? "").trim();
  const rpNameRaw = String(data.rpName ?? "").trim();
  const ageRaw = String(data.age ?? "").trim();
  const redirectTo = String(data.redirectTo ?? "").trim();

  // Determine actual target Discord ID
  let actualTargetDiscordId = targetDiscordId;
  
  if (!actualTargetDiscordId && verifiedDiscordId) {
    // For staff: default to self-linking
    actualTargetDiscordId = verifiedDiscordId;
  }

  if (!actualTargetDiscordId) {
    // ✅ Return debug info to help troubleshoot
    const receivedKeys = Object.keys(data);
    const hasQueryDiscordId = !!queryDiscordId;
    
    console.error("[link:POST] MISSING_DISCORD_ID debug:", {
      isWorker,
      contentType,
      receivedKeys,
      hasQueryDiscordId,
      bodyDiscordId,
      queryDiscordId,
    });
    
    return NextResponse.json(
      { 
        ok: false, 
        error: "MISSING_DISCORD_ID",
        hint: "Send discordId in URL /api/staff/link/:discordId OR query ?discordId=... OR body {discordId}",
        receivedKeys,
        hasQueryDiscordId,
      },
      { status: 400 }
    );
  }

  if (!steamId) {
    return NextResponse.json(
      { ok: false, error: "MISSING_STEAM_ID" },
      { status: 400 }
    );
  }

  // ✅ Validate steamId format
  const steamIdValid = /^\d{17}$/.test(steamId);
  if (!steamIdValid) {
    console.error("[link:POST] Invalid SteamID64 format:", {
      steamId,
      length: steamId.length,
      isNumeric: /^\d+$/.test(steamId),
    });
    return NextResponse.json(
      { ok: false, error: "INVALID_STEAM_ID_FORMAT", hint: "Must be exactly 17 digits" },
      { status: 400 }
    );
  }

  const familyId = await resolveFamilyId("esperados");
  const existingMember = await prisma.member.findUnique({
    where: { familyId_discordId: { familyId, discordId: actualTargetDiscordId } },
    select: { id: true, steamId: true, discordId: true },
  });

  const existingBySteam = await prisma.member.findFirst({
    where: { familyId, steamId },
    select: { id: true, steamId: true, discordId: true, rpName: true },
  });

  if (existingMember && existingMember.steamId) {
    if (existingMember.steamId === steamId) {
      return NextResponse.json({
        ok: true,
        member: { id: existingMember.id, discordId: existingMember.discordId, steamId: existingMember.steamId },
      });
    }

    return NextResponse.json(
      { ok: false, error: "TARGET_ALREADY_LINKED" },
      { status: 403 }
    );
  }

  // Validate data
  let age: number | null = null;
  if (ageRaw) {
    const parsed = Number(ageRaw);
    if (!Number.isInteger(parsed)) {
      return NextResponse.json(
        { ok: false, error: "INVALID_AGE" },
        { status: 400 }
      );
    }
    age = parsed;
  }

  const rpName = rpNameRaw ? rpNameRaw : null;

  // ⚠️ VERIF: If discordId looks like a SteamID
  if (actualTargetDiscordId.match(/^7656119\d{10}$/)) {
    console.warn(
      "[link:POST] WARNING: targetDiscordId looks like a SteamID!",
      "targetDiscordId:",
      actualTargetDiscordId,
      "steamId:",
      steamId
    );
  }

  // Ensure Family exists before upserting Member (FK constraint)
  try {
    await prisma.family.upsert({
      where: { slug: familyId },
      create: { slug: familyId, name: familyId },
      update: {},
    });

    let member: Awaited<ReturnType<typeof prisma.member.update>> | Awaited<ReturnType<typeof prisma.member.upsert>> | null = null;

    if (existingBySteam) {
      if (existingMember && existingMember.id !== existingBySteam.id) {
        await prisma.$transaction(async (tx) => {
          await tx.member.update({
            where: { id: existingMember.id },
            data: {
              debugPrevDiscordId: actualTargetDiscordId,
              discordId: null,
            },
          });

          member = await tx.member.update({
            where: { id: existingBySteam.id },
            data: {
              discordId: actualTargetDiscordId,
              steamId,
              rpName,
              age,
            },
          });
        });
      } else {
        member = await prisma.member.update({
          where: { id: existingBySteam.id },
          data: {
            discordId: actualTargetDiscordId,
            steamId,
            rpName,
            age,
          },
        });
      }
    } else {
      // ✅ Upsert with targetDiscordId as key
      member = await prisma.member.upsert({
        where: { familyId_discordId: { familyId, discordId: actualTargetDiscordId } },
        create: { familyId, discordId: actualTargetDiscordId, steamId, rpName, age, isActive: false }, // ✅ Only LYG sync sets isActive=true
        update: { steamId, rpName, age, discordId: actualTargetDiscordId }, // ⚠️ Do NOT update isActive
      });
    }

    if (!member) {
      return NextResponse.json(
        { ok: false, error: "LINK_FAILED" },
        { status: 500 }
      );
    }

    console.log("[link:POST] Member upserted", {
      memberId: member.id,
      discordId: member.discordId,
      steamId: member.steamId,
      steamIdProvided: steamId,
      steamIdWritten: !!member.steamId,
      steamIdMatches: member.steamId === steamId,
      rpName: member.rpName,
      isWorker,
    });

    if (process.env.DEBUG_AUTH === "1") {
      console.log(
        "[link:POST] Successfully linked memberId:",
        member.id,
        "discordId:",
        member.discordId,
        "steamId:",
        member.steamId,
        "by:",
        isWorker ? "WORKER" : verifiedDiscordId
      );
    }

    // Workers always get JSON, never redirects
    if (isWorker) {
      return NextResponse.json({
        ok: true,
        discordId: member.discordId,
        steamId: member.steamId,
        rpName: member.rpName,
        memberId: member.id,
      });
    }

    // Check if staff request wants HTML redirect
    const acceptHeader = req.headers.get("accept") ?? "";
    const wantHtml = acceptHeader.includes("text/html");

    if (wantHtml) {
      // Anti open-redirect : on n'accepte que des destinations same-origin
      // commençant par "/" et sans "//" (évite "//evil.com" qui devient absolu).
      const safeDestination =
        typeof redirectTo === "string" &&
        redirectTo.startsWith("/") &&
        !redirectTo.startsWith("//")
          ? redirectTo
          : "/staff/dashboard";
      return NextResponse.redirect(new URL(safeDestination, req.url));
    }

    return NextResponse.json({
      ok: true,
      member: { id: member.id, discordId: member.discordId, steamId: member.steamId },
    });
  } catch (error: any) {
    // Handle Prisma-specific errors
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      console.error("[link:POST] Prisma error:", error.code, error.message);
      
      if (error.code === "P2002") {
        // Unique constraint violation
        return NextResponse.json(
          { ok: false, error: "CONSTRAINT_VIOLATION", details: error.message },
          { status: 409 }
        );
      }
      
      if (error.code === "P2025") {
        // Record not found (shouldn't happen with upsert, but handle it)
        return NextResponse.json(
          { ok: false, error: "RECORD_NOT_FOUND", details: error.message },
          { status: 404 }
        );
      }

      // Generic Prisma error
      return NextResponse.json(
        { ok: false, error: "DATABASE_ERROR", details: error.message },
        { status: 500 }
      );
    }

    // Handle other unexpected errors
    console.error("[link:POST] Unexpected error:", error);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_SERVER_ERROR", details: error?.message || "Unknown error" },
      { status: 500 }
    );
  }
}
