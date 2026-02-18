import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged, requireActiveMember, GRADE_LEVELS } from "@/lib/guards";
import { getSession } from "@/auth";

const STATUSES = ["OPEN", "TREATED", "UNTREATED", "CLOSED"] as const;

type TicketStatus = (typeof STATUSES)[number];

function isValidStatus(value: string) {
  return STATUSES.includes(value as TicketStatus);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const ticket = await prisma.complaintTicket.findUnique({ where: { id } });
  if (!ticket) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const [messagesCount, lastMessage] = await Promise.all([
    prisma.complaintMessage.count({ where: { ticketId: ticket.id } }),
    prisma.complaintMessage.findFirst({
      where: { ticketId: ticket.id },
      orderBy: { createdAtDiscord: "desc" },
      select: {
        content: true,
        authorNameSnapshot: true,
        createdAtDiscord: true,
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    ticket,
    messagesCount,
    lastMessagePreview: lastMessage
      ? {
          content: lastMessage.content,
          authorNameSnapshot: lastMessage.authorNameSnapshot,
          createdAtDiscord: lastMessage.createdAtDiscord,
        }
      : null,
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const existing = await prisma.complaintTicket.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  // Handle decision action
  if ("action" in body && body.action === "decision") {
    return handleComplaintDecision(id, body, existing);
  }

  const updateData: Record<string, unknown> = {};

  if ("status" in body) {
    const value = String(body.status ?? "").trim();
    if (!isValidStatus(value)) {
      return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
    }
    updateData.status = value;
    updateData.closedAtDiscord = value === "CLOSED" ? new Date() : null;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ ok: false, error: "NO_FIELDS" }, { status: 400 });
  }

  const updated = await prisma.complaintTicket.update({
    where: { id },
    data: updateData,
  });

  return NextResponse.json({ ok: true, ticket: updated });
}

async function handleComplaintDecision(
  complaintId: string,
  body: any,
  existing: any
): Promise<Response> {
  try {
    // Validate staff authorization
    const guardResult = await requireActiveMember(GRADE_LEVELS.STAFF);
    if (guardResult instanceof Response) return guardResult;

    const session = await getSession();
    if (!session) {
      return NextResponse.json({ ok: false, error: "NOT_AUTHENTICATED" }, { status: 401 });
    }

    const decision = String(body.decision ?? "").trim().toUpperCase();
    if (!["TRAITE", "NON_RESOLU", "REFUSE"].includes(decision)) {
      return NextResponse.json({ ok: false, error: "INVALID_DECISION" }, { status: 400 });
    }

    const note = body.note ? String(body.note).trim() : null;

    // Get complaint from new Complaint table (not ComplaintTicket)
    const complaint = await prisma.complaint.findUnique({
      where: { id: complaintId },
      select: { 
        id: true, 
        title: true,
        discordThreadId: true, 
        ticketKey: true,
        status: true,
        authorRpName: true,
        targetName: true 
      },
    });

    if (!complaint) {
      return NextResponse.json({ ok: false, error: "COMPLAINT_NOT_FOUND" }, { status: 404 });
    }

    // Get staff member info
    const staffMember = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId: "esperados", discordId: session.user!.id! } },
      select: { rpName: true, discordId: true },
    });

    if (!staffMember) {
      return NextResponse.json({ ok: false, error: "STAFF_NOT_FOUND" }, { status: 404 });
    }

    // Map decision to ComplaintStatus enum
    let newStatus: string = "OPEN";
    if (decision === "TRAITE") {
      newStatus = "RESOLVED";
    } else if (decision === "NON_RESOLU") {
      newStatus = "IN_REVIEW";
    } else if (decision === "REFUSE") {
      newStatus = "REJECTED";
    }

    const updatedComplaint = await prisma.complaint.update({
      where: { id: complaintId },
      data: {
        status: newStatus as any,
        closedAt: (decision === "TRAITE" || decision === "REFUSE") ? new Date() : null,
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
        entityId: complaintId,
        attempt: 0,
        maxAttempts: 5,
        nextAttemptAt: new Date(),
        meta: {
          kind: "TICKET_DECISION",
          ticketKind: "COMPLAINT",
          ticketKey: complaint.ticketKey || complaint.discordThreadId,
          decision: decision,
          note: note,
          staffName: staffMember.rpName ?? "Unknown",
          staffDiscordId: staffMember.discordId,
          complaintTitle: complaint.title,
          authorName: complaint.authorRpName,
          targetName: complaint.targetName,
        },
      },
    });

    console.log(`[complaints] Decision recorded: complaintId=${complaintId} decision=${decision} staff=${staffMember.discordId} threadId=${complaint.ticketKey || complaint.discordThreadId}`);

    return NextResponse.json({ ok: true, complaint: updatedComplaint });
  } catch (err: any) {
    console.error("[complaints] Decision error:", err);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
