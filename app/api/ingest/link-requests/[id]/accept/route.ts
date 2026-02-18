import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { postDiscordRename } from "@/server/worker/post-discord";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { ensureFamilyExists } from "@/lib/family-ensure";

const INGEST_SECRET = process.env.INGEST_SECRET || "";
const FAMILY_ID = DEFAULT_FAMILY_ID;

// Valider SteamID64 (17 chiffres)
function validateSteamId(steamId: string): boolean {
  return /^[0-9]{17}$/.test(steamId);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Log INGEST_SECRET configuration status (not the value)
  const hasIngestSecret = !!INGEST_SECRET && INGEST_SECRET.length > 0;
  if (!hasIngestSecret) {
    console.warn("[link-request:accept] WARNING: INGEST_SECRET not configured in environment");
  }

  try {
    // Verify secret
    const secret = req.headers.get("x-ingest-secret");
    if (!secret || secret !== INGEST_SECRET) {
      return NextResponse.json(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { clickerId, clickerName, steamId, overrideSteamId } = body;

    if (!FAMILY_ID) {
      return NextResponse.json(
        { ok: false, error: "FAMILY_ID not configured" },
        { status: 500 }
      );
    }

    console.log("[link-request:accept]", {
      id,
      clickerId,
      clickerName,
      familyId: FAMILY_ID,
      overrideSteamId: overrideSteamId ? "***provided***" : "not_provided",
      timestamp: new Date().toISOString(),
    });

    // Get LinkRequest
    const linkRequest = await prisma.linkRequest.findUnique({
      where: { id },
    });

    if (!linkRequest) {
      return NextResponse.json(
        { ok: false, error: "LinkRequest not found" },
        { status: 404 }
      );
    }

    // Check if already handled
    if (linkRequest.status !== "PENDING" && linkRequest.status !== "OPENED") {
      console.log("[link-request:accept] Already handled", {
        id,
        status: linkRequest.status,
      });
      return NextResponse.json({
        ok: true,
        alreadyHandled: true,
        status: linkRequest.status,
      });
    }

    // Determine final steamId: valid override > valid linkRequest > null
    const overrideCandidate = typeof overrideSteamId === "string"
      ? overrideSteamId.trim()
      : typeof steamId === "string"
        ? steamId.trim()
        : "";
    const hasValidOverride = overrideCandidate ? validateSteamId(overrideCandidate) : false;
    const requestCandidate = typeof linkRequest.steamId === "string" ? linkRequest.steamId.trim() : "";
    const hasValidRequestSteamId = requestCandidate ? validateSteamId(requestCandidate) : false;
    const finalSteamId = hasValidOverride
      ? overrideCandidate
      : hasValidRequestSteamId
        ? requestCandidate
        : null;

    console.log("[link-request:accept] SteamID resolution", {
      overrideProvided: !!overrideSteamId,
      overrideCandidate,
      hasValidOverride,
      requestCandidate,
      hasValidRequestSteamId,
      finalSteamId,
      willWriteToMember: !!finalSteamId,
    });

    // Check if steamId already used by another member
    if (finalSteamId) {
      const existingMember = await prisma.member.findFirst({
        where: {
          familyId: FAMILY_ID,
          steamId: finalSteamId,
          discordId: { not: linkRequest.requesterDiscordId }, // Different member
        },
      });

      if (existingMember) {
        return NextResponse.json(
          {
            ok: false,
            error: `SteamID64 already linked to another member (${existingMember.rpName || existingMember.discordId})`,
            conflictMemberId: existingMember.id,
          },
          { status: 409 }
        );
      }
    }

    // Update LinkRequest to ACCEPTED
    const updatedRequest = await prisma.linkRequest.update({
      where: { id },
      data: {
        status: "ACCEPTED",
        actionByDiscordId: clickerId,
        actionByName: clickerName,
        lastActionAt: new Date(),
        // If override provided, update LinkRequest.steamId for audit trail
        ...(hasValidOverride && { steamId: overrideCandidate }),
      },
    });

    // ✅ Ensure Family exists before creating Member (prevent P2003 foreign key error)
    let familyIdToUse = FAMILY_ID;
    try {
      const ensured = await ensureFamilyExists();
      familyIdToUse = ensured.familyId;
      console.log("[link-request:accept] Family ensured", { familyId: familyIdToUse });
    } catch (err) {
      console.error("[link-request:accept] Failed to ensure family exists", {
        familyId: FAMILY_ID,
        error: err instanceof Error ? err.message : "Unknown error",
      });
      return NextResponse.json(
        { ok: false, error: err instanceof Error ? err.message : "Family ensure failed" },
        { status: 500 }
      );
    }

    // Upsert Member
    let member = await prisma.member.findFirst({
      where: {
        familyId: familyIdToUse,
        discordId: linkRequest.requesterDiscordId,
      },
    });

    if (!member) {
      // Create new member
      // Try to find associated recruitment for rpName
      const recruitment = await prisma.recruitment.findFirst({
        where: {
          discordId: linkRequest.requesterDiscordId,
          rpName: { not: null },
        },
        orderBy: { createdAt: "desc" },
        select: { rpName: true },
      });

      member = await prisma.member.create({
        data: {
          familyId: familyIdToUse,
          discordId: linkRequest.requesterDiscordId,
          steamId: finalSteamId,
          // Priority: recruitment rpName > LinkRequest requesterName > null
          rpName: recruitment?.rpName || linkRequest.requesterName || null,
          discordUsername: linkRequest.requesterName || null,
          isActive: false, // ✅ Only LYG sync sets isActive=true
        },
      });
      console.log("[link-request:accept] Created new member", {
        memberId: member.id,
        discordId: member.discordId,
        steamId: member.steamId,
        steamIdWritten: !!member.steamId,
        rpName: member.rpName,
      });
    } else {
      // Update existing member
      // Important: NE PAS écraser rpName si déjà défini
      const updateData: any = {
        discordId: linkRequest.requesterDiscordId,
        isActive: true,
      };

      // Set steamId if provided
      if (finalSteamId) {
        updateData.steamId = finalSteamId;
      }

      // Only set rpName if member doesn't already have one
      if (!member.rpName) {
        // Try to find associated recruitment for rpName
        const recruitment = await prisma.recruitment.findFirst({
          where: {
            discordId: linkRequest.requesterDiscordId,
            rpName: { not: null },
          },
          orderBy: { createdAt: "desc" },
          select: { rpName: true },
        });
        updateData.rpName = recruitment?.rpName || linkRequest.requesterName || null;
      }

      // Always update discordUsername (for tracking)
      updateData.discordUsername = linkRequest.requesterName || null;

      member = await prisma.member.update({
        where: { id: member.id },
        data: updateData,
      });
      console.log("[link-request:accept] Updated existing member", {
        memberId: member.id,
        discordId: member.discordId,
        steamId: member.steamId,
        steamIdWritten: !!member.steamId,
        rpName: member.rpName,
        updatedFields: Object.keys(updateData),
        steamIdInUpdateData: 'steamId' in updateData,
        steamIdValue: updateData.steamId,
      });
    }

    // ✅ Comprehensive diagnostic for link success
    console.log("[link-request:accept] Link complete - diagnostics", {
      linkRequestId: id,
      requesterDiscordId: linkRequest.requesterDiscordId,
      memberIdCreatedOrUpdated: member.id,
      memberDiscordIdInDb: member.discordId,
      memberSteamIdInDb: member.steamId,
      linkVerified: member.discordId === linkRequest.requesterDiscordId,
      timestamp: new Date().toISOString(),
    });

    // Trigger Discord rename if member has rpName and discordId
    if (member.rpName && member.discordId) {
      const renameResult = await postDiscordRename({
        discordId: member.discordId,
        rpName: member.rpName,
        reason: "Auto-rename from panel (link accepted)",
      });

      console.log("[link-request:accept] Rename result", {
        memberId: member.id,
        discordId: member.discordId,
        rpName: member.rpName,
        steamId: member.steamId,
        renameOk: renameResult.ok,
        renameError: renameResult.ok ? null : renameResult.error,
        renameSkipped: renameResult.ok ? null : renameResult.skipped,
      });
    } else if (member.rpName && !member.discordId) {
      console.warn("[link-request:accept] Skip rename: missing discordId", {
        memberId: member.id,
        rpName: member.rpName,
      });
    }

    console.log("[link-request:accept] Success", {
      id,
      familyId: familyIdToUse,
      status: updatedRequest.status,
      memberId: member.id,
      steamIdSet: !!member.steamId,
    });

    return NextResponse.json({
      ok: true,
      status: updatedRequest.status,
      memberId: member.id,
      steamId: member.steamId,
      alreadyHandled: false,
    });
  } catch (error) {
    console.error("[link-request:accept] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Internal error",
      },
      { status: 500 }
    );
  }
}
