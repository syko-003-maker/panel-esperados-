import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import { getSession } from "@/auth";
import { enqueueMessageFromTemplate, getOrCreateDiscordConfig } from "@/lib/discord/discord";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELED"] as const;

function parsePageParams(searchParams: URLSearchParams) {
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Math.min(Math.max(Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20, 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function isValidStatus(value: string | null) {
  return value ? STATUSES.includes(value as (typeof STATUSES)[number]) : true;
}

function parseDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

export async function GET(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familyId = searchParams.get("familyId") ?? "esperados";
  const status = searchParams.get("status");
  const discordId = (searchParams.get("discordId") ?? "").trim();
  const dateFromRaw = (searchParams.get("dateFrom") ?? "").trim();
  const dateToRaw = (searchParams.get("dateTo") ?? "").trim();

  if (!isValidStatus(status)) {
    return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
  }

  const { page, pageSize, skip } = parsePageParams(searchParams);

  let dateFrom: Date | null = null;
  let dateTo: Date | null = null;
  if (dateFromRaw) {
    dateFrom = parseDate(dateFromRaw);
    if (!dateFrom) {
      return NextResponse.json({ ok: false, error: "INVALID_DATE_FROM" }, { status: 400 });
    }
  }
  if (dateToRaw) {
    dateTo = parseDate(dateToRaw);
    if (!dateTo) {
      return NextResponse.json({ ok: false, error: "INVALID_DATE_TO" }, { status: 400 });
    }
  }

  const where: any = { familyId };
  if (status) where.status = status;
  if (discordId) where.discordId = discordId;
  if (dateFrom || dateTo) {
    where.startAt = {};
    if (dateFrom) where.startAt.gte = dateFrom;
    if (dateTo) where.startAt.lte = dateTo;
  }

  const [data, total] = await Promise.all([
    prisma.absence.findMany({
      where,
      orderBy: { startAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.absence.count({ where }),
  ]);

  return NextResponse.json({ ok: true, data, page, pageSize, total });
}

export async function POST(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const actorId = session?.user?.id;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const familyId = String(searchParams.get("familyId") ?? body.familyId ?? "esperados").trim() || "esperados";
  const discordId = String(body.discordId ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const notes = String(body.notes ?? "").trim();
  const startAtRaw = String(body.startAt ?? "").trim();
  const endAtRaw = String(body.endAt ?? "").trim();

  if (!discordId) {
    return NextResponse.json({ ok: false, error: "MISSING_DISCORD_ID" }, { status: 400 });
  }
  if (!startAtRaw || !endAtRaw) {
    return NextResponse.json({ ok: false, error: "MISSING_DATES" }, { status: 400 });
  }

  const startAt = parseDate(startAtRaw);
  const endAt = parseDate(endAtRaw);
  if (!startAt || !endAt) {
    return NextResponse.json({ ok: false, error: "INVALID_DATES" }, { status: 400 });
  }
  if (endAt.getTime() < startAt.getTime()) {
    return NextResponse.json({ ok: false, error: "END_BEFORE_START" }, { status: 400 });
  }

  const data = await prisma.absence.create({
    data: {
      familyId,
      discordId,
      reason: reason || null,
      notes: notes || null,
      startAt,
      endAt,
      createdById: actorId,
    },
  });

  await prisma.auditLog.create({
    data: {
      familyId,
      actorId,
      action: "create",
      entity: "Absence",
      entityId: data.id,
      meta: {
        discordId,
        status: data.status,
        startAt: data.startAt,
        endAt: data.endAt,
      },
    },
  });

  try {
    const config = await getOrCreateDiscordConfig(familyId);
    await enqueueMessageFromTemplate({
      familyId,
      channelId: config.absencesChannelId,
      key: "absence.requested",
      vars: {
        discordId,
        startAt: data.startAt.toISOString(),
        endAt: data.endAt.toISOString(),
        status: data.status,
      },
      entity: "Absence",
      entityId: data.id,
    });
  } catch (err) {
    console.warn("discord enqueue absence.requested failed", err);
  }

  return NextResponse.json({ ok: true, data });
}
