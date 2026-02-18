import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";
import type { ComplaintStatus } from "@prisma/client";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ ticketKey: string }> }
) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { ticketKey } = await params;

  const complaint = await prisma.complaint.findUnique({
    where: { ticketKey },
  });

  if (!complaint) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, complaint });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ ticketKey: string }> }
) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const staffDiscordId = (session as any)?.discordId ?? (session?.user as any)?.discordId ?? null;

  const { ticketKey } = await params;
  const body = await req.json().catch(() => ({}));
  const { status, summary } = body;

  const validStatuses: ComplaintStatus[] = ["OPEN", "RESOLVED", "REJECTED", "CLOSED"];
  if (!status || !validStatuses.includes(status)) {
    return NextResponse.json(
      { ok: false, error: "Invalid status" },
      { status: 400 }
    );
  }

  const existing = await prisma.complaint.findUnique({
    where: { ticketKey },
  });

  if (!existing) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const updateData: any = { status };

  if (summary !== undefined) {
    updateData.summary = summary;
  }

  if (status !== "OPEN") {
    updateData.closedAt = new Date();
    updateData.closedByDiscordId = staffDiscordId;
    updateData.closeReason = status;
  } else {
    updateData.closedAt = null;
    updateData.closedByDiscordId = null;
    updateData.closeReason = null;
  }

  await prisma.complaint.update({
    where: { ticketKey },
    data: updateData,
  });

  return NextResponse.json({ ok: true });
}
