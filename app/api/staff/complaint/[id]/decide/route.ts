import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { getSession } from "@/auth";
import { enqueueComplaintDecision } from "@/lib/discord/discord";

const DECISIONS = ["APPROVED", "REJECTED", "DISMISSED"] as const;
const FAMILY_ID = process.env.FAMILY_ID ?? "esperados";

type Decision = (typeof DECISIONS)[number];

function isValidDecision(value: string): value is Decision {
  return DECISIONS.includes(value as Decision);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  // CRITICAL RULE: Require Chef or EtatMajor for complaint decisions
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const userId = session?.user?.id ?? (session as any)?.userId;
  if (!userId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const decisionRaw = String((body as any).decision ?? "").trim().toUpperCase();
  if (!isValidDecision(decisionRaw)) {
    return NextResponse.json(
      { ok: false, error: "INVALID_DECISION", message: `Must be one of: ${DECISIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const complaint = await prisma.complaint.findUnique({
    where: { id },
    select: {
      id: true,
      ticketKey: true,
      status: true,
      title: true,
      description: true,
      authorDiscordId: true,
      targetName: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!complaint) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  if (complaint.status === "CLOSED") {
    return NextResponse.json({ ok: false, error: "ALREADY_CLOSED" }, { status: 409 });
  }

  // Update status to CLOSED
  const updated = await prisma.complaint.update({
    where: { id },
    data: {
      status: "CLOSED",
      closedAt: new Date(),
      closedByDiscordId: userId,
      closeReason: `Decision: ${decisionRaw}`,
    },
    select: {
      id: true,
      ticketKey: true,
      status: true,
      title: true,
      authorDiscordId: true,
      targetName: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  // Enqueue Discord notification
  await enqueueComplaintDecision({
    familyId: FAMILY_ID,
    complaintId: updated.id,
    decision: decisionRaw,
    complaintTitle: updated.title ?? "Unnamed complaint",
    authorDiscordId: updated.authorDiscordId ?? undefined,
    targetDiscordId: updated.targetName ?? undefined,
    decidedByUserId: userId,
  });

  return NextResponse.json({
    ok: true,
    complaint: {
      id: updated.id,
      ticketKey: updated.ticketKey,
      status: "CLOSED",
      title: updated.title,
      authorDiscordId: updated.authorDiscordId,
      resolution: decisionRaw,
      resolvedAt: new Date().toISOString(),
      createdAt: updated.createdAt.toISOString(),
    },
  });
}
