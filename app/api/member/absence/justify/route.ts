import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { logger } from "@/lib/logger";
import { NextRequest, NextResponse } from "next/server";
import { getUserRole } from "@/server/auth/rbac";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { postDiscordMessage } from "@/server/worker/post-discord";
import { enforceRateLimit } from "@/server/rate-limit";

const DISCORD_CHANNEL_ID = "1335303582043607222";
const FAMILY_ID = "esperados";

function parseDate(value?: string) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function POST(req: NextRequest) {
  try {
    // Check authentication
    const session = await auth();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const role = await getUserRole(session);
    if (!role) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Check if member is linked
    const linkedMember = await getMemberScopeOrNull(session);
    if (!linkedMember) {
      return NextResponse.json(
        { code: "MEMBER_NOT_LINKED" },
        { status: 403 }
      );
    }

    // Parse body
    const body = await req.json();
    const { reason, from, to } = body ?? {};
    const trimmedReason = typeof reason === "string" ? reason.trim() : "";

    if (!trimmedReason || trimmedReason.length < 10) {
      return NextResponse.json(
        { error: "reason must be at least 10 characters" },
        { status: 400 }
      );
    }

    const fromDate = parseDate(typeof from === "string" ? from : undefined);
    const toDate = parseDate(typeof to === "string" ? to : undefined);

    if ((from && !fromDate) || (to && !toDate)) {
      return NextResponse.json(
        { error: "Invalid date format" },
        { status: 400 }
      );
    }

    const discordId = linkedMember.discordId;

    // Get full member info for message
    const member = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId: FAMILY_ID, discordId: discordId || "" } },
      select: { id: true, rpName: true },
    });

    if (!member) {
      return NextResponse.json(
        { error: "Member not found" },
        { status: 403 }
      );
    }

    // Rate limit (3 per 10 minutes)
    const rate = await enforceRateLimit({
      discordId: discordId || "",
      key: "member:absence-justify",
    });

    if (!rate.ok) {
      const response = NextResponse.json(
        { error: "Too many requests" },
        { status: 429 }
      );
      response.headers.set(
        "Retry-After",
        Math.ceil(rate.retryAfterMs / 1000).toString()
      );
      return response;
    }

    // Build message
    const dateRange =
      fromDate && toDate
        ? `du ${fromDate.toISOString().split("T")[0]} au ${toDate.toISOString().split("T")[0]}`
        : fromDate
          ? `depuis le ${fromDate.toISOString().split("T")[0]}`
          : toDate
            ? `jusqu'au ${toDate.toISOString().split("T")[0]}`
            : "Non précisée";

    const embed = {
      title: "📌 Justification d'absence",
      description: `Demande de justification pour absence`,
      color: 0x3b82f6,
      fields: [
        { name: "Membre", value: member.rpName || "Inconnu", inline: true },
        { name: "Discord ID", value: discordId || "N/A", inline: true },
        { name: "Période", value: dateRange, inline: false },
        { name: "Raison", value: trimmedReason, inline: false },
      ],
      footer: { text: "Panel Los Esperados" },
      timestamp: new Date().toISOString(),
    };

    logger.debug(
      "api:absence",
      `Sending absence justification for ${discordId}`
    );

    // Send to Discord via worker
    const discordResponse = await postDiscordMessage({
      channelId: DISCORD_CHANNEL_ID,
      embeds: [embed],
    });

    if (!discordResponse.ok) {
      logger.warn("api:absence", `Discord worker error: ${discordResponse.error}`);
      return NextResponse.json(
        { error: "Failed to send to Discord" },
        { status: 500 }
      );
    }

    logger.immediate(
      "api:absence",
      `✓ Absence justification sent for ${discordId}`,
      { messageId: discordResponse.messageId }
    );

    return NextResponse.json({ ok: true });
  } catch (error) {
    logger.error("api:absence", `${error}`);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
