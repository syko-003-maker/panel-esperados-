import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor, requirePrivileged } from "@/lib/guards";

const FAMILY_ID = process.env.FAMILY_ID ?? "esperados";

const VALID_STATUSES = ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED", "CLOSED"] as const;
type ComplaintStatus = (typeof VALID_STATUSES)[number];

function parsePageParams(searchParams: URLSearchParams) {
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Math.min(Math.max(Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20, 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

export async function GET(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const statusParam = searchParams.get("status");
    const q = (searchParams.get("q") ?? "").trim();
    const { page, pageSize, skip } = parsePageParams(searchParams);

    if (statusParam && !VALID_STATUSES.includes(statusParam as ComplaintStatus)) {
      return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
    }

    type WhereClause = {
      familyId: string;
      status?: ComplaintStatus;
      OR?: Array<Record<string, unknown>>;
    };

    const where: WhereClause = { familyId: FAMILY_ID };
    if (statusParam) where.status = statusParam as ComplaintStatus;
    if (q) {
      where.OR = [
        { authorDiscordId: { contains: q } },
        { authorTag: { contains: q, mode: "insensitive" } },
        { targetName: { contains: q, mode: "insensitive" } },
        { ticketKey: { contains: q, mode: "insensitive" } },
      ];
    }

    const [complaints, total] = await Promise.all([
      prisma.complaint.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          ticketKey: true,
          title: true,
          status: true,
          authorDiscordId: true,
          authorTag: true,
          targetName: true,
          discordThreadId: true,
          payload: true,
          closedAt: true,
          closedByDiscordId: true,
          closeReason: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.complaint.count({ where }),
    ]);

    // Resolve RP names for complaint authors
    const authorDiscordIds = [...new Set(complaints.map((c) => c.authorDiscordId).filter(Boolean))] as string[];
    const authorMembers = authorDiscordIds.length > 0
      ? await prisma.member.findMany({
          where: { discordId: { in: authorDiscordIds } },
          select: { discordId: true, rpName: true },
        })
      : [];
    const rpNameByDiscordId = new Map(authorMembers.map((m) => [m.discordId, m.rpName]));

    const data = complaints.map((c) => {
      const payload = (c.payload as Record<string, unknown>) ?? {};
      return {
        id: c.id,
        ticketKey: c.ticketKey ?? null,
        title: c.title,
        status: c.status,
        authorDiscordId: c.authorDiscordId ?? null,
        authorTag: c.authorTag ?? null,
        authorRpName: c.authorDiscordId ? (rpNameByDiscordId.get(c.authorDiscordId) ?? null) : null,
        targetName: c.targetName ?? null,
        reason: (payload.reason as string) ?? null,
        discordThreadId: c.discordThreadId ?? null,
        closedAt: c.closedAt?.toISOString() ?? null,
        closedByDiscordId: c.closedByDiscordId ?? null,
        closeReason: c.closeReason ?? null,
        createdAt: c.createdAt.toISOString(),
        updatedAt: c.updatedAt.toISOString(),
      };
    });

    return NextResponse.json({ ok: true, data, page, pageSize, total });
  } catch (e: any) {
    console.error("[/api/staff/complaints GET] error:", e?.message ?? e);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  }
}

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Use GET /api/staff/complaints" },
    { status: 405, headers: { Allow: "GET" } }
  );
}
