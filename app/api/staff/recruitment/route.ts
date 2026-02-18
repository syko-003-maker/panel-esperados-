import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRecruiterOrAbove } from "@/lib/guards";
import { parseRecruitmentNotes } from "@/lib/recruitment/legacy";

const STATUSES = ["OPEN", "CLAIMED", "CLOSED_ACCEPTED", "CLOSED_REJECTED"] as const;

type TicketStatus = (typeof STATUSES)[number];

function isValidStatus(value: string | null) {
  return value ? STATUSES.includes(value as TicketStatus) : true;
}

export async function GET(req: Request) {
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");

  if (!isValidStatus(status)) {
    return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
  }

  const where: Record<string, unknown> = {};
  if (status) {
    if (status === "CLOSED_ACCEPTED") where.status = "ACCEPTED";
    else if (status === "CLOSED_REJECTED") where.status = "REJECTED";
    else where.status = "PENDING";
  }

  const rows = await prisma.recruitment.findMany({
    where,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      status: true,
      rpName: true,
      discordId: true,
      steamId: true,
      createdAt: true,
      updatedAt: true,
      notes: true,
    },
  });

  const data = rows.map((row) => {
    const notes = parseRecruitmentNotes(row.notes ?? null);
    const isClaimed = Boolean(notes.claimedById);
    const statusLabel =
      row.status === "ACCEPTED"
        ? "CLOSED_ACCEPTED"
        : row.status === "REJECTED" || row.status === "ARCHIVED"
          ? "CLOSED_REJECTED"
          : isClaimed
            ? "CLAIMED"
            : "OPEN";

    return {
      id: row.id,
      status: statusLabel,
      candidateRpName: row.rpName ?? row.discordId ?? "Unknown",
      candidateSteamId: row.steamId ?? null,
      candidateDiscordId: row.discordId ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      claimedAt: notes.claimedAt ?? null,
      claimedBy: notes.claimedById ? { id: notes.claimedById, name: null } : null,
    };
  });

  return NextResponse.json({ ok: true, data });
}

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Use Discord ingestion to create recruitment tickets" },
    { status: 405, headers: { Allow: "GET" } }
  );
}
