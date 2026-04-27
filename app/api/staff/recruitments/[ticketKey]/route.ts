import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { requireRecruiterOrAbove } from "@/lib/guards";
import { prisma } from "@/lib/db";

const FAMILY_ID = process.env.FAMILY_ID ?? "esperados";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticketKey: string }> }
) {
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) return guard;

  const { ticketKey } = await params;

  const recruitment = await prisma.recruitment.findUnique({
    where: { ticketKey },
  });

  if (!recruitment) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, recruitment });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ ticketKey: string }> }
) {
  try {
    const guard = await requireRecruiterOrAbove();
    if (guard instanceof Response) return guard;

    const session = await getSession();
    const { ticketKey } = await params;
    const body = await req.json().catch(() => ({}));

    // Handle decision action
    if ("action" in body && body.action === "decision") {
      return handleRecruitmentDecision(ticketKey, body, session);
    }

    // Legacy status update
    const staffDiscordId = (session as any)?.discordId ?? (session?.user as any)?.discordId ?? null;
    const { status } = body;

    if (!status || !["PENDING", "ARCHIVED"].includes(status)) {
      return NextResponse.json(
        { ok: false, error: "Invalid status (PENDING or ARCHIVED)" },
        { status: 400 }
      );
    }

    const existing = await prisma.recruitment.findUnique({
      where: { ticketKey },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
    }

    const updateData: any = { status };

    if (status === "ARCHIVED") {
      updateData.closedAt = new Date();
      updateData.closedByDiscordId = staffDiscordId;
      updateData.closeReason = "PANEL_CLOSED";
    } else if (status === "PENDING") {
      updateData.closedAt = null;
      updateData.closedByDiscordId = null;
      updateData.closeReason = null;
    }

    await prisma.recruitment.update({
      where: { ticketKey },
      data: updateData,
    });

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[recruitments] PATCH error:", err);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}

async function handleRecruitmentDecision(
  ticketKey: string,
  body: any,
  session: any
): Promise<Response> {
  try {
    // Validate staff authorization
    const { requireActiveMember, GRADE_LEVELS } = await import("@/lib/guards");
    const guardResult = await requireActiveMember(GRADE_LEVELS.STAFF);
    if (guardResult instanceof Response) return guardResult;

    if (!session) {
      return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
    }

    const decision = String(body.decision ?? "").trim().toUpperCase();
    if (!["VALID", "REFUSE"].includes(decision)) {
      return NextResponse.json({ ok: false, error: "INVALID_DECISION" }, { status: 400 });
    }

    const note = body.note ? String(body.note).trim() : null;

    // Get recruitment
    const recruitment = await prisma.recruitment.findUnique({
      where: { ticketKey },
      select: { 
        id: true,
        rpName: true,
        discordId: true,
        steamId: true,
        discordThreadId: true, 
        ticketKey: true,
        status: true 
      },
    });

    if (!recruitment) {
      return NextResponse.json({ ok: false, error: "RECRUITMENT_NOT_FOUND" }, { status: 404 });
    }

    // ✅ MEGA PATCH: Get staff member info using correct discordId
    const { getDiscordIdForSession } = await import("@/lib/auth/discord-id");
    const staffDiscordId = await getDiscordIdForSession(session);
    
    if (!staffDiscordId) {
      return NextResponse.json({ ok: false, error: "STAFF_DISCORD_ID_NOT_FOUND" }, { status: 403 });
    }

    const staffMember = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId: "esperados", discordId: staffDiscordId } },
      select: { rpName: true, discordId: true },
    });

    if (!staffMember) {
      return NextResponse.json({ ok: false, error: "STAFF_NOT_FOUND" }, { status: 404 });
    }

    // Map decision to RecruitmentLegacyStatus enum
    let newStatus: string = "PENDING";
    if (decision === "VALID") {
      newStatus = "ACCEPTED";
    } else if (decision === "REFUSE") {
      newStatus = "REJECTED";
    }

    const updatedRecruitment = await prisma.recruitment.update({
      where: { ticketKey },
      data: {
        status: newStatus as any,
        closedAt: new Date(),
        closeReason: note || `Décision: ${decision}`,
        closedByDiscordId: staffMember.discordId,
      },
    });

    // Enqueue Discord outbox job for TICKET_DECISION
    await prisma.discordOutbox.create({
      data: {
        status: "PENDING",
        type: "SANCTION_NOTIFY",
        familyId: "esperados",
        entityId: recruitment.id,
        attempt: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        meta: {
          kind: "TICKET_DECISION",
          ticketKind: "RECRUITMENT",
          ticketKey: recruitment.ticketKey || recruitment.discordThreadId,
          decision: decision,
          note: note,
          staffName: staffMember.rpName ?? "Unknown",
          staffDiscordId: staffMember.discordId,
          candidateName: recruitment.rpName,
          candidateDiscordId: recruitment.discordId,
          candidateSteamId: recruitment.steamId,
        },
      },
    });


    return NextResponse.json({ ok: true, recruitment: updatedRecruitment });
  } catch (err: any) {
    console.error("[recruitments] Decision error:", err);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
