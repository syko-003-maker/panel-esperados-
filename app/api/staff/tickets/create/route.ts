import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireActiveMember, GRADE_LEVELS } from "@/lib/guards";

export async function POST(req: NextRequest) {
  try {
    const user = await requireActiveMember(GRADE_LEVELS.STAFF);

    const body = await req.json().catch(() => ({}));
    const { ticketKind, ticketId, title, description, rpName, discordId, steamId, age, authorDiscordId, targetName, authorRpName } = body;

    // Validation
    if (!ticketKind || !["COMPLAINT", "RECRUITMENT"].includes(ticketKind)) {
      return NextResponse.json(
        { ok: false, error: "Invalid ticketKind" },
        { status: 400 }
      );
    }

    if (!ticketId) {
      return NextResponse.json(
        { ok: false, error: "Missing ticketId" },
        { status: 400 }
      );
    }

    // Créer job outbox pour créer le ticket Discord
    await prisma.discordOutbox.create({
      data: {
        familyId: "esperados",
        type: "SANCTION_NOTIFY", // Réutilise type existant
        entityId: ticketId,
        status: "PENDING",
        attempt: 0,
        nextAttemptAt: new Date(),
        meta: {
          kind: "TICKET_CREATE",
          ticketKind,
          ticketId,
          title,
          description,
          rpName,
          discordId,
          steamId,
          age,
          authorDiscordId,
          targetName,
          authorRpName,
          createdAt: new Date().toISOString(),
        },
      },
    });

    console.log(
      `[api/staff/tickets/create] Created ticket job for ${ticketKind} ${ticketId}`
    );

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    console.error("[api/staff/tickets/create]", err);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
