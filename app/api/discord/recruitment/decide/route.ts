import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { makeRequestId, logInfo, logWarn, logError } from "@/lib/obs";

const FAMILY_ID = "esperados";
const STAFF_LEVEL = 5; // GRADE_LEVELS.STAFF
const INGEST_SECRET = process.env.INGEST_SECRET;

/**
 * POST /api/discord/recruitment/decide
 * Decide on recruitment from Discord button interaction
 * 
 * Body: { ticketKey, decision, staffDiscordId, staffUsername?, messageId?, channelId? }
 * Auth: x-ingest-secret header (Discord worker machine-to-machine)
 */
export async function POST(req: Request) {
  const requestId = makeRequestId();
  
  // Verify INGEST_SECRET
  const ingestSecret = req.headers.get("x-ingest-secret");
  if (!INGEST_SECRET) {
    logError("recruitment_decide_secret_not_configured", { requestId });
    return NextResponse.json(
      { ok: false, error: "INGEST_SECRET not configured" },
      { status: 503 }
    );
  }
  if (ingestSecret !== INGEST_SECRET) {
    logWarn("recruitment_decide_unauthorized_secret", { requestId });
    return NextResponse.json(
      { ok: false, error: "Unauthorized: Invalid INGEST_SECRET" },
      { status: 401 }
    );
  }
  
  try {
    const body = await req.json();
    const { ticketKey, decision, staffDiscordId, staffUsername, messageId, channelId } = body;
    
    if (!ticketKey || !decision || !staffDiscordId) {
      logWarn("recruitment_decide_missing_params", { requestId, body });
      return NextResponse.json(
        { ok: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }
    
    if (!["APPROVE", "REFUSE"].includes(decision)) {
      logWarn("recruitment_decide_invalid_decision", { requestId, decision });
      return NextResponse.json(
        { ok: false, error: "Invalid decision. Must be APPROVE or REFUSE" },
        { status: 400 }
      );
    }
    
    // Verify staff permissions
    const staffMember = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId: FAMILY_ID, discordId: staffDiscordId } },
      select: { id: true, isActive: true, gradeLevel: true, rpName: true, discordId: true },
    });
    
    if (!staffMember || !staffMember.isActive || (staffMember.gradeLevel ?? 0) < STAFF_LEVEL) {
      logWarn("recruitment_decide_unauthorized", { requestId, staffDiscordId });
      return NextResponse.json(
        { ok: false, error: "Unauthorized: Staff permissions required" },
        { status: 403 }
      );
    }
    
    // Find recruitment by ticketKey
    const recruitment = await prisma.recruitment.findUnique({
      where: { ticketKey },
      select: {
        id: true,
        status: true,
        rpName: true,
        steamId: true,
        discordId: true,
        discordThreadId: true,
      },
    });
    
    if (!recruitment) {
      logWarn("recruitment_decide_not_found", { requestId, ticketKey });
      return NextResponse.json(
        { ok: false, error: "Recruitment not found" },
        { status: 404 }
      );
    }
    
    if (recruitment.status === "ACCEPTED" || recruitment.status === "REJECTED") {
      logWarn("recruitment_decide_already_closed", { requestId, ticketKey, status: recruitment.status });
      return NextResponse.json(
        { ok: false, error: "ALREADY_CLOSED", currentStatus: recruitment.status },
        { status: 409 }
      );
    }
    
    // Update recruitment status
    const newStatus = decision === "APPROVE" ? "ACCEPTED" : "REJECTED";
    
    const updated = await prisma.recruitment.update({
      where: { ticketKey },
      data: {
        status: newStatus,
        closedAt: new Date(),
        closedByDiscordId: staffDiscordId,
        closeReason: decision === "APPROVE" ? "Accepted by staff" : "Refused by staff",
      },
      select: {
        id: true,
        ticketKey: true,
        status: true,
        rpName: true,
        steamId: true,
        discordId: true,
        discordThreadId: true,
        closedAt: true,
      },
    });
    
    logInfo("recruitment_decide_success", {
      requestId,
      ticketKey,
      decision,
      newStatus,
      staffDiscordId,
      staffRpName: staffMember.rpName,
    });
    
    return NextResponse.json({
      ok: true,
      recruitment: {
        id: updated.id,
        ticketKey: updated.ticketKey,
        status: newStatus,
        rpName: updated.rpName,
        steamId: updated.steamId,
        discordId: updated.discordId,
        threadId: updated.discordThreadId,
        closedAt: updated.closedAt?.toISOString(),
      },
      staff: {
        discordId: staffMember.discordId,
        rpName: staffMember.rpName,
      },
    });
    
  } catch (error) {
    logError("recruitment_decide_error", { requestId }, error as Error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
