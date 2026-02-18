import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import { logInfo } from "@/lib/obs";

const STATUSES = ["OPEN", "TREATED", "UNTREATED", "CLOSED"] as const;

type TicketStatus = (typeof STATUSES)[number];

type TicketListItem = {
  id: string;
  channelId: string;
  status: TicketStatus;
  createdAtDiscord: Date;
  closedAtDiscord: Date | null;
  lastMessageAtDiscord: Date | null;
  messagesCount: number;
};

function parsePageParams(searchParams: URLSearchParams) {
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Math.min(Math.max(Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20, 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function isValidStatus(value: string | null) {
  return value ? STATUSES.includes(value as TicketStatus) : true;
}

export async function GET(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const startTime = Date.now();
  const dashboardRequestId = req.headers.get("x-dashboard-request-id");
  const dashboardSection = req.headers.get("x-dashboard-section") ?? "complaints";
  const logDashboardDone = () => {
    if (dashboardRequestId) {
      logInfo("dashboard_fetch_done", {
        requestId: dashboardRequestId,
        section: dashboardSection,
        durationMs: Date.now() - startTime,
      });
    }
  };

  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");
    const q = (searchParams.get("q") ?? "").trim();
    const lite = searchParams.get("lite") === "1" || searchParams.get("lite") === "true";

    if (!isValidStatus(status)) {
      return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
    }

    const { page, pageSize, skip } = parsePageParams(searchParams);

    const where: Record<string, unknown> = {};
    if (status) where.status = status;
    if (q) {
      where.channelId = { contains: q, mode: "insensitive" };
    }

    if (lite) {
      const [tickets, total] = await Promise.all([
        prisma.complaintTicket.findMany({
          where,
          orderBy: { createdAtDiscord: "desc" },
          take: pageSize,
          select: {
            id: true,
            channelId: true,
            status: true,
            createdAtDiscord: true,
            closedAtDiscord: true,
          },
        }),
        prisma.complaintTicket.count({ where }),
      ]);

      const data: TicketListItem[] = tickets.map((ticket) => ({
        id: ticket.id,
        channelId: ticket.channelId,
        status: ticket.status as TicketStatus,
        createdAtDiscord: ticket.createdAtDiscord,
        closedAtDiscord: ticket.closedAtDiscord ?? null,
        lastMessageAtDiscord: null,
        messagesCount: 0,
      }));

      return NextResponse.json({ ok: true, data, page: 1, pageSize, total });
    }

    const tickets = await prisma.complaintTicket.findMany({
      where,
      select: {
        id: true,
        channelId: true,
        status: true,
        createdAtDiscord: true,
        closedAtDiscord: true,
      },
    });

    if (tickets.length === 0) {
      return NextResponse.json({ ok: true, data: [], page, pageSize, total: 0 });
    }

    const ticketIds = tickets.map((ticket) => ticket.id);
    const messageAgg = await prisma.complaintMessage.groupBy({
      by: ["ticketId"],
      where: { ticketId: { in: ticketIds } },
      _count: { _all: true },
      _max: { createdAtDiscord: true },
    });

    const byTicket = new Map(
      messageAgg.map((item) => [
        item.ticketId,
        {
          messagesCount: item._count._all ?? 0,
          lastMessageAtDiscord: item._max.createdAtDiscord ?? null,
        },
      ])
    );

    const enriched: TicketListItem[] = tickets.map((ticket) => {
      const meta = byTicket.get(ticket.id);
      return {
        id: ticket.id,
        channelId: ticket.channelId,
        status: ticket.status as TicketStatus,
        createdAtDiscord: ticket.createdAtDiscord,
        closedAtDiscord: ticket.closedAtDiscord ?? null,
        lastMessageAtDiscord: meta?.lastMessageAtDiscord ?? null,
        messagesCount: meta?.messagesCount ?? 0,
      };
    });

    enriched.sort((a, b) => {
      const aTime = (a.lastMessageAtDiscord ?? a.createdAtDiscord).getTime();
      const bTime = (b.lastMessageAtDiscord ?? b.createdAtDiscord).getTime();
      return bTime - aTime;
    });

    const total = enriched.length;
    const data = enriched.slice(skip, skip + pageSize);

    return NextResponse.json({ ok: true, data, page, pageSize, total });
  } catch (e: any) {
    const errMsg = e?.message ?? String(e);
    console.error("[/api/staff/complaints GET] error:", errMsg);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  } finally {
    logDashboardDone();
  }
}

export async function POST() {
  return NextResponse.json(
    { ok: false, error: "Use GET /api/staff/complaints" },
    { status: 405, headers: { Allow: "GET" } }
  );
}
