import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { makeRequestId, logInfo, logWarn, logError } from "@/lib/obs";

const FAMILY_ID = "esperados";
const STAFF_LEVEL = 5; // GRADE_LEVELS.STAFF
const INGEST_SECRET = process.env.INGEST_SECRET;

/**
 * POST /api/discord/complaint/decide
 * Decide on complaint from Discord button interaction
 * 
 * Body: { ticketKey, decision, staffDiscordId, staffUsername?, messageId?, channelId? }
 * Auth: x-ingest-secret header (Discord worker machine-to-machine)
 */
export async function POST(req: Request) {
  const requestId = makeRequestId();
  
  // Verify INGEST_SECRET
  const ingestSecret = req.headers.get("x-ingest-secret");
  if (!INGEST_SECRET) {
    logError("complaint_decide_secret_not_configured", { requestId });
    return NextResponse.json(
      { ok: false, error: "INGEST_SECRET not configured" },
      { status: 503 }
    );
  }
  if (ingestSecret !== INGEST_SECRET) {
    logWarn("complaint_decide_unauthorized_secret", { requestId });
    return NextResponse.json(
      { ok: false, error: "Unauthorized: Invalid INGEST_SECRET" },
      { status: 401 }
    );
  }
  
  try {
    const body = await req.json();
    const { ticketKey, decision, staffDiscordId, staffUsername, messageId, channelId } = body;
    
    if (!ticketKey || !decision || !staffDiscordId) {
      logWarn("complaint_decide_missing_params", { requestId, body });
      return NextResponse.json(
        { ok: false, error: "Missing required parameters" },
        { status: 400 }
      );
    }
    
    if (!["TRAITE", "NON_RESOLU", "REFUSE"].includes(decision)) {
      logWarn("complaint_decide_invalid_decision", { requestId, decision });
      return NextResponse.json(
        { ok: false, error: "Invalid decision. Must be TRAITE, NON_RESOLU, or REFUSE" },
        { status: 400 }
      );
    }
    
    // Verify staff permissions
    const staffMember = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId: FAMILY_ID, discordId: staffDiscordId } },
      select: { id: true, isActive: true, gradeLevel: true, rpName: true, discordId: true },
    });
    
    if (!staffMember || !staffMember.isActive || (staffMember.gradeLevel ?? 0) < STAFF_LEVEL) {
      logWarn("complaint_decide_unauthorized", { requestId, staffDiscordId });
      return NextResponse.json(
        { ok: false, error: "Unauthorized: Staff permissions required" },
        { status: 403 }
      );
    }
    
    // Find complaint by ticketKey
    const complaint = await prisma.complaint.findUnique({
      where: { ticketKey },
      select: {
        id: true,
        status: true,
        title: true,
        description: true,
        authorDiscordId: true,
        targetName: true,
        discordThreadId: true,
      },
    });
    
    if (!complaint) {
      logWarn("complaint_decide_not_found", { requestId, ticketKey });
      return NextResponse.json(
        { ok: false, error: "Complaint not found" },
        { status: 404 }
      );
    }
    
    if (complaint.status === "CLOSED") {
      logWarn("complaint_decide_already_closed", { requestId, ticketKey, status: complaint.status });
      return NextResponse.json(
        { ok: false, error: "ALREADY_CLOSED", currentStatus: complaint.status },
        { status: 409 }
      );
    }
    
    // Map decision to status
    const statusMap: Record<string, string> = {
      TRAITE: "RESOLVED",
      NON_RESOLU: "CLOSED",
      REFUSE: "REJECTED",
    };
    
    const newStatus = statusMap[decision] || "CLOSED";
    
    const updated = await prisma.complaint.update({
      where: { ticketKey },
      data: {
        status: newStatus as any,
        closedAt: new Date(),
        closedByDiscordId: staffDiscordId,
        closeReason: `Decision: ${decision}`,
      },
      select: {
        id: true,
        ticketKey: true,
        status: true,
        title: true,
        authorDiscordId: true,
        targetName: true,
        discordThreadId: true,
        closedAt: true,
      },
    });
    
    logInfo("complaint_decide_success", {
      requestId,
      ticketKey,
      decision,
      newStatus,
      staffDiscordId,
      staffRpName: staffMember.rpName,
    });
    
    return NextResponse.json({
      ok: true,
      complaint: {
        id: updated.id,
        ticketKey: updated.ticketKey,
        status: newStatus,
        title: updated.title,
        authorDiscordId: updated.authorDiscordId,
        targetName: updated.targetName,
        threadId: updated.discordThreadId,
        closedAt: updated.closedAt?.toISOString(),
      },
      staff: {
        discordId: staffMember.discordId,
        rpName: staffMember.rpName,
      },
    });
    
  } catch (error) {
    logError("complaint_decide_error", { requestId }, error as Error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
