import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveMember, GRADE_LEVELS } from "@/lib/guards";
import { toFamilyCuid } from "@/lib/family";

export async function POST(req: NextRequest) {
  try {
    const user = await requireActiveMember(GRADE_LEVELS.STAFF);
    if (user instanceof Response) return user;

    const body = await req.json().catch(() => ({}));
    const { ticketKind, ticketId, threadId } = body;

    // Validation
    if (!ticketKind || !["COMPLAINT", "RECRUITMENT"].includes(ticketKind)) {
      return NextResponse.json(
        { ok: false, error: "Invalid ticketKind. Must be COMPLAINT or RECRUITMENT" },
        { status: 400 }
      );
    }

    if (!ticketId && !threadId) {
      return NextResponse.json(
        { ok: false, error: "Missing ticketId or threadId" },
        { status: 400 }
      );
    }

    // Récupérer le ticket pour valider et obtenir threadId si besoin
    let resolvedTicketId = ticketId;
    let resolvedThreadId = threadId;

    if (ticketId && !threadId) {
      const ticket =
        ticketKind === "COMPLAINT"
          ? await prisma.complaint.findUnique({
              where: { id: ticketId },
              select: { discordThreadId: true },
            })
          : await prisma.recruitment.findUnique({
              where: { id: ticketId },
              select: { discordThreadId: true },
            });

      if (!ticket) {
        return NextResponse.json(
          { ok: false, error: "Ticket not found" },
          { status: 404 }
        );
      }

      resolvedThreadId = ticket.discordThreadId;
    }

    if (!resolvedThreadId) {
      return NextResponse.json(
        { ok: false, error: "Ticket has no Discord thread" },
        { status: 400 }
      );
    }

    // Créer job outbox pour sync
    await prisma.discordOutbox.create({
      data: {
        familyId: await toFamilyCuid("esperados"),
        type: "SANCTION_NOTIFY", // Réutilise type existant
        entityId: resolvedTicketId || resolvedThreadId,
        status: "PENDING",
        attempt: 0,
        nextAttemptAt: new Date(),
        meta: {
          kind: "TICKET_SYNC",
          ticketKind,
          ticketId: resolvedTicketId,
          threadId: resolvedThreadId,
        },
      },
    });

    console.log(
      `[api/staff/tickets/sync] Created sync job for ${ticketKind} ${resolvedTicketId} thread=${resolvedThreadId}`
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[api/staff/tickets/sync]", err);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
