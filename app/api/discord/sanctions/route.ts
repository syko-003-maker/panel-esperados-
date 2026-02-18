import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

const WORKER_SECRET = process.env.DISCORD_WORKER_SECRET ?? process.env.INGEST_SECRET;

// Valid sanction types
const VALID_TYPES = ["WARNING", "LIGHT", "HEAVY", "TEMP_BAN", "STRIKE", "SUSPENSION"];

/**
 * POST /api/discord/sanctions
 * Worker-only endpoint to create a sanction from Discord command
 */
export async function POST(req: NextRequest) {
  // Validate worker secret
  const authHeader = req.headers.get("authorization");
  const providedSecret = authHeader?.replace("Bearer ", "");

  if (!WORKER_SECRET || providedSecret !== WORKER_SECRET) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = await req.json();
    const {
      discordId,
      type,
      reason,
      durationHours,
      staffDiscordId,
      familyId = DEFAULT_FAMILY_ID,
    } = body;

    // Validation
    if (!discordId) {
      return NextResponse.json({ ok: false, error: "discordId required" }, { status: 400 });
    }

    if (!type || !VALID_TYPES.includes(type.toUpperCase())) {
      return NextResponse.json(
        { ok: false, error: `type must be one of: ${VALID_TYPES.join(", ")}` },
        { status: 400 }
      );
    }

    if (!reason || reason.trim().length < 3) {
      return NextResponse.json({ ok: false, error: "reason required (min 3 chars)" }, { status: 400 });
    }

    // Get member
    const member = await prisma.member.findFirst({
      where: { familyId, discordId },
      select: { id: true, rpName: true },
    });

    if (!member) {
      return NextResponse.json({ ok: false, error: "Member not found" }, { status: 404 });
    }

    // Get staff user via Account (Discord OAuth stores discordId in providerAccountId)
    let staffUser: { id: string; name: string | null } | null = null;
    if (staffDiscordId) {
      const account = await prisma.account.findFirst({
        where: { provider: "discord", providerAccountId: staffDiscordId },
        select: { user: { select: { id: true, name: true } } },
      });
      staffUser = account?.user ?? null;
    }

    // Fallback: get first staff user if no staff user found
    if (!staffUser) {
      staffUser = await prisma.user.findFirst({
        where: { isStaff: true },
        select: { id: true, name: true },
      });
    }

    if (!staffUser) {
      return NextResponse.json(
        { ok: false, error: "No staff user available for creating sanctions" },
        { status: 500 }
      );
    }

    // Calculate end date for timed sanctions
    const now = new Date();
    let endAt: Date | null = null;
    if (durationHours && typeof durationHours === "number" && durationHours > 0) {
      endAt = new Date(now.getTime() + durationHours * 60 * 60 * 1000);
    }

    // Create sanction
    const sanction = await prisma.sanction.create({
      data: {
        familyId,
        discordId,
        memberId: member.id,
        type: type.toUpperCase() as any,
        source: "DISCORD_COMMAND",
        reason: reason.trim(),
        status: "ACTIVE",
        startAt: now,
        endAt,
        createdById: staffUser.id,
      },
    });

    // Audit log
    await prisma.auditLog.create({
      data: {
        familyId,
        actorType: "worker",
        actorId: staffDiscordId ?? null,
        actorName: staffUser.name ?? "Discord Bot",
        action: "CREATED",
        entity: "Sanction",
        entityId: sanction.id,
        entityName: member.rpName ?? null,
        meta: {
          discordId,
          type: sanction.type,
          reason: sanction.reason,
          source: "DISCORD_COMMAND",
          staffDiscordId,
        },
      },
    });

    // Build panel URL
    const panelBaseUrl = process.env.NEXTAUTH_URL ?? process.env.PANEL_BASE_URL ?? "";
    const panelUrl = panelBaseUrl ? `${panelBaseUrl}/staff/sanctions?id=${sanction.id}` : null;

    return NextResponse.json({
      ok: true,
      sanction: {
        id: sanction.id,
        type: sanction.type,
        status: sanction.status,
        reason: sanction.reason,
        memberRpName: member.rpName,
        startAt: sanction.startAt,
        endAt: sanction.endAt,
        createdBy: staffUser?.name ?? "Discord Bot",
        links: {
          panel: panelUrl,
        },
      },
    });
  } catch (error: any) {
    console.error("[/api/discord/sanctions POST]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to create sanction" },
      { status: 500 }
    );
  }
}
