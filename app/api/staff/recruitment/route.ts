import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRecruiterOrAbove } from "@/lib/guards";
import { parseRecruitmentNotes } from "@/lib/recruitment/legacy";

// Statuts DB bruts acceptés comme filtre
const DB_STATUSES = ["PENDING", "ACCEPTED", "REJECTED", "ARCHIVED"] as const;
type DbStatus = (typeof DB_STATUSES)[number];

function isValidStatusFilter(value: string | null): boolean {
  if (!value) return true;
  return DB_STATUSES.includes(value as DbStatus);
}

export async function GET(req: Request) {
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = (searchParams.get("q") ?? "").trim();

  if (!isValidStatusFilter(status)) {
    return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
  }

  const where: Record<string, unknown> = {};
  if (status) {
    where.status = status; // filtre direct sur la valeur DB
  }
  if (q) {
    (where as any).OR = [
      { rpName: { contains: q, mode: "insensitive" } },
      { discordId: { contains: q, mode: "insensitive" } },
      { steamId: { contains: q, mode: "insensitive" } },
      { ticketKey: { contains: q, mode: "insensitive" } },
      { authorTag: { contains: q, mode: "insensitive" } },
    ];
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
      ticketKey: true,
      discordThreadId: true,
      createdAt: true,
      updatedAt: true,
      notes: true,
    },
  });

  // Résolution des noms de recruteurs : claimedById est un userId NextAuth (CUID)
  // Priorité : rpName (Member) > displayName Discord > username Discord
  const allNotes = rows.map((row) => parseRecruitmentNotes(row.notes ?? null));
  const claimedUserIds = [...new Set(
    allNotes.map((n) => n.claimedById).filter((id): id is string => Boolean(id))
  )];
  const claimedUsers = claimedUserIds.length > 0
    ? await prisma.user.findMany({
        where: { id: { in: claimedUserIds } },
        select: { id: true, name: true },
      })
    : [];
  // userId → discordId via Account
  const accounts = claimedUserIds.length > 0
    ? await prisma.account.findMany({
        where: { userId: { in: claimedUserIds }, provider: "discord" },
        select: { userId: true, providerAccountId: true },
      })
    : [];
  const discordIdByUserId = new Map(accounts.map((a) => [a.userId, a.providerAccountId]));
  // discordId → rpName via Member
  const claimedDiscordIds = [...new Set(accounts.map((a) => a.providerAccountId))];
  const claimedMembers = claimedDiscordIds.length > 0
    ? await prisma.member.findMany({
        where: { discordId: { in: claimedDiscordIds } },
        select: { discordId: true, rpName: true },
      })
    : [];
  const rpNameByDiscordId = new Map(
    claimedMembers.filter((m): m is typeof m & { discordId: string } => Boolean(m.discordId))
      .map((m) => [m.discordId, m.rpName])
  );
  const userNameMap = new Map(claimedUsers.map((u) => {
    const discordId = discordIdByUserId.get(u.id);
    const rpName = discordId ? rpNameByDiscordId.get(discordId) : null;
    return [u.id, rpName ?? u.name ?? null];
  }));

  const data = rows.map((row, i) => {
    const notes = allNotes[i];
    const claimedById = notes.claimedById ?? null;
    const claimedByName = claimedById ? (userNameMap.get(claimedById) ?? null) : null;
    return {
      id: row.id,
      status: row.status as DbStatus,
      isClaimed: Boolean(claimedById),
      candidateRpName: row.rpName ?? row.discordId ?? "Unknown",
      candidateSteamId: row.steamId ?? null,
      candidateDiscordId: row.discordId ?? null,
      ticketKey: (row as any).ticketKey ?? null,
      discordThreadId: (row as any).discordThreadId ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      claimedAt: notes.claimedAt ?? null,
      claimedBy: claimedById ? { id: claimedById, name: claimedByName } : null,
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
