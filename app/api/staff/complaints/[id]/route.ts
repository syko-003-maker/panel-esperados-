import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { getSession } from "@/auth";

const FAMILY_ID = process.env.FAMILY_ID ?? "esperados";

const STATUS_MAP: Record<string, string> = {
  TRAITE: "RESOLVED",
  NON_RESOLUE: "REJECTED",
  REFUSE: "REJECTED",
  IN_REVIEW: "IN_REVIEW",
  CLOSED: "CLOSED",
};

function pickDisplayName(values: Array<string | null | undefined>) {
  for (const value of values) {
    const normalized = value?.trim();
    if (normalized) return normalized;
  }
  return null;
}

async function resolveClosedByDisplayName(discordId: string | null, familySlug: string) {
  if (!discordId) return null;

  const [member, staffUser] = await Promise.all([
    prisma.member.findFirst({
      where: {
        discordId,
        family: { slug: familySlug },
      },
      select: {
        rpName: true,
        discordDisplayName: true,
        discordUsername: true,
      },
    }),
    prisma.staffUser.findFirst({
      where: {
        discordId,
        family: { slug: familySlug },
      },
      select: {
        user: {
          select: {
            name: true,
          },
        },
      },
    }),
  ]);

  return pickDisplayName([
    member?.rpName,
    member?.discordDisplayName,
    member?.discordUsername,
    staffUser?.user?.name,
    discordId,
  ]);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const complaint = await prisma.complaint.findFirst({
    where: { id, familyId: FAMILY_ID },
  });
  if (!complaint) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const payload = (complaint.payload as Record<string, unknown>) ?? {};
  const closedByDisplayName = await resolveClosedByDisplayName(complaint.closedByDiscordId ?? null, FAMILY_ID);

  return NextResponse.json({
    ok: true,
    complaint: {
      id: complaint.id,
      ticketKey: complaint.ticketKey ?? null,
      title: complaint.title,
      description: complaint.description,
      status: complaint.status,
      authorDiscordId: complaint.authorDiscordId ?? null,
      authorTag: complaint.authorTag ?? null,
      authorRpName: complaint.authorRpName ?? null,
      targetName: complaint.targetName ?? null,
      targetId: complaint.targetId ?? null,
      discordThreadId: complaint.discordThreadId ?? null,
      reason: (payload.reason as string) ?? complaint.description ?? null,
      details: (payload.details as string) ?? null,
      targetFrom: (payload.target as string) ?? complaint.targetName ?? null,
      summary: complaint.summary ?? null,
      closedAt: complaint.closedAt?.toISOString() ?? null,
      closedByDiscordId: complaint.closedByDiscordId ?? null,
      closedByDisplayName,
      closeReason: complaint.closeReason ?? null,
      createdAt: complaint.createdAt.toISOString(),
      updatedAt: complaint.updatedAt.toISOString(),
    },
  });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const actorDiscordId = (session?.user as any)?.discordId ?? null;

  const complaint = await prisma.complaint.findFirst({
    where: { id, familyId: FAMILY_ID },
    select: { id: true, status: true, closedAt: true },
  });
  if (!complaint) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const decisionRaw = String((body as any).decision ?? "").trim().toUpperCase();
  const summaryText = String((body as any).summary ?? "").trim() || null;

  if (!STATUS_MAP[decisionRaw]) {
    return NextResponse.json({ ok: false, error: "INVALID_DECISION" }, { status: 400 });
  }

  const newStatus = STATUS_MAP[decisionRaw] as any;
  const isClosed = ["RESOLVED", "REJECTED", "CLOSED"].includes(newStatus);

  const updated = await prisma.complaint.update({
    where: { id },
    data: {
      status: newStatus,
      summary: summaryText ?? undefined,
      closedAt: isClosed ? new Date() : undefined,
      closedByDiscordId: isClosed ? (actorDiscordId ?? "panel") : undefined,
      closeReason: isClosed ? decisionRaw : undefined,
    },
  });

  const payload = (updated.payload as Record<string, unknown>) ?? {};
  const closedByDisplayName = await resolveClosedByDisplayName(updated.closedByDiscordId ?? null, FAMILY_ID);

  return NextResponse.json({
    ok: true,
    complaint: {
      id: updated.id,
      ticketKey: updated.ticketKey ?? null,
      title: updated.title,
      status: updated.status,
      authorDiscordId: updated.authorDiscordId ?? null,
      authorTag: updated.authorTag ?? null,
      targetName: updated.targetName ?? null,
      reason: (payload.reason as string) ?? null,
      details: (payload.details as string) ?? null,
      summary: updated.summary ?? null,
      closedAt: updated.closedAt?.toISOString() ?? null,
      closedByDiscordId: updated.closedByDiscordId ?? null,
      closedByDisplayName,
      closeReason: updated.closeReason ?? null,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

const STATUSES = ["OPEN", "TREATED", "UNTREATED", "CLOSED"] as const;

type TicketStatus = (typeof STATUSES)[number];

function isValidStatus(value: string) {
  return STATUSES.includes(value as TicketStatus);
}
