import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRecruiterOrAbove } from "@/lib/guards";

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: recruitmentId } = await params;
    const guard = await requireRecruiterOrAbove();
    if (guard instanceof Response) return guard;
    const session = (guard as any).session ?? {};

    const { decision, note } = await req.json();

    // Decisions attendues côté site
    if (!["ACCEPTED", "REJECTED"].includes(decision)) {
      return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
    }

    const recruitment = await prisma.recruitment.findUnique({
      where: { id: recruitmentId },
      select: {
        id: true,
        rpName: true,
        discordId: true,
        payload: true,
        ticketChannelId: true,
      },
    });

    if (!recruitment) {
      return NextResponse.json(
        { error: "Recruitment not found" },
        { status: 404 }
      );
    }

    if (!recruitment.ticketChannelId) {
      return NextResponse.json(
        { error: "ticketChannelId missing on recruitment" },
        { status: 400 }
      );
    }

    // Update recrutement
    await prisma.recruitment.update({
      where: { id: recruitmentId },
      data: {
        status: decision === "ACCEPTED" ? "ACCEPTED" : "REJECTED",
        closedAt: new Date(),
      },
    });

    const steamId = (recruitment.payload as any)?.steamId || "N/A";

    // Notif dans le salon du ticket (le même que le recrutement)
    await prisma.discordOutbox.create({
      data: {
        familyId: "esperados",
        type: "SANCTION_NOTIFY",
        status: "PENDING",
        attempt: 0,
        maxAttempts: 10,
        channelId: recruitment.ticketChannelId,
        entityId: recruitmentId,
        nextAttemptAt: new Date(),
        meta: {
          kind: "TICKET_DECISION",
          ticketKind: "RECRUITMENT",
          ticketId: recruitmentId,
          decision: decision === "ACCEPTED" ? "VALID" : "REFUSE",
          note: note ?? null,
          staffName: session.user.name || "Staff",
        },
      },
    });

    // Whitelist UNIQUEMENT si accepté
    if (decision === "ACCEPTED") {
      const whitelistChannelId = process.env.DISCORD_WHITELIST_CHANNEL_ID;

      if (!whitelistChannelId) {
        console.warn(
          "[recruitment/decision] DISCORD_WHITELIST_CHANNEL_ID missing, skipping whitelist post"
        );
      } else {
        await prisma.discordOutbox.create({
          data: {
            familyId: "esperados",
            type: "SANCTION_NOTIFY",
            status: "PENDING",
            attempt: 0,
            maxAttempts: 10,
            channelId: whitelistChannelId,
            entityId: recruitmentId,
            nextAttemptAt: new Date(),
            meta: {
              kind: "WHITELIST_POST",
              rpName: recruitment.rpName,
              steamId,
              discordId: recruitment.discordId,
              ticketId: recruitmentId,
              staffName: session.user.name || "Staff",
            },
          },
        });

        console.log("[api/staff/recruitments/by-id/[id]/decision] whitelist queued", {
          recruitmentId,
          rpName: recruitment.rpName,
        });
      }
    }

    return NextResponse.json({
      ok: true,
      decision,
      whitelistQueued: decision === "ACCEPTED",
    });
  } catch (err: any) {
    console.error("[api/staff/recruitments/by-id/[id]/decision] error:", err);
    return NextResponse.json({ error: "internal_error" }, { status: 500 });
  }
}
