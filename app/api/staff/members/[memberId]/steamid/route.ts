import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor, requireFullWriter } from "@/lib/guards";
import { createAuditLog } from "@/lib/audit";
import { debug, error as logError } from "@/lib/logger";
import { findBlockingSteamLink } from "@/lib/link-conflicts";

/**
 * ✅ PATCH /api/staff/members/[memberId]/steamid
 * Permite staff editar/override steamId de um member
 *
 * Body: { steamId: string | null }
 * - steamId: null to clear
 * - steamId: "..." to set (17 digits)
 *
 * Response:
 * - 200: Updated
 * - 400: Invalid steamId format
 * - 409: SteamId already used by another member
 * - 403: Insufficient permissions
 * - 404: Member not found
 */

// Valider SteamID64 (17 chiffres)
function validateSteamId(steamId: string | null): boolean {
  if (steamId === null) return true; // Clearing is ok
  return /^[0-9]{17}$/.test(steamId);
}

async function handleUpdate(
  req: NextRequest,
  params: Promise<{ memberId: string }>
) {
  try {
    // ✅ Check permissions (staff only)
    const guard = await requireFullWriter();
    if (guard instanceof Response) {
      return guard;
    }

    const { memberId } = await params;
    const body = await req.json().catch(() => ({}));
    const { steamId } = body;

    // Validate steamId format
    if (!validateSteamId(steamId)) {
      return NextResponse.json(
        {
          ok: false,
          error: `Invalid SteamID64 format. Must be exactly 17 digits or null. Got: ${steamId}`,
        },
        { status: 400 }
      );
    }

    // Get member
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: {
        id: true,
        familyId: true,
        discordId: true,
        steamId: true,
        rpName: true,
      },
    });

    if (!member) {
      return NextResponse.json(
        { ok: false, error: "Member not found" },
        { status: 404 }
      );
    }

    // If setting new steamId, check uniqueness
    if (steamId && steamId !== member.steamId) {
      const existingMember = await findBlockingSteamLink(prisma, {
        familyId: member.familyId,
        steamId,
        excludeMemberId: memberId,
        excludeDiscordId: member.discordId,
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

    // Update member
    const updated = await prisma.member.update({
      where: { id: memberId },
      data: { steamId: steamId },
      select: {
        id: true,
        discordId: true,
        steamId: true,
        rpName: true,
        discordUsername: true,
      },
    });

    debug("[staff:member:steamid] Updated", {
      memberId,
      oldSteamId: member.steamId,
      newSteamId: updated.steamId,
    });

    void createAuditLog({
      actorType: "staff",
      actorId: (guard.session as any)?.user?.id ?? (guard.session as any)?.userId ?? null,
      actorName: (guard.session as any)?.user?.name ?? null,
      action: "UPDATED",
      entity: "Member",
      entityId: memberId,
      entityName: updated.rpName ?? updated.discordId ?? null,
      meta: {
        field: "steamId",
        oldValue: member.steamId ?? null,
        newValue: updated.steamId ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      member: updated,
    });
  } catch (error) {
    logError("[staff:member:steamid] Error:", error);
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Internal error",
      },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  return handleUpdate(req, params);
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ memberId: string }> }
) {
  return handleUpdate(req, params);
}
