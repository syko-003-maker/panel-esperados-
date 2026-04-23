import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import { getSession } from "@/auth";
import { enqueueMessageFromTemplate, getOrCreateDiscordConfig } from "@/lib/discord/discord";
import { logInfo, logWarn, logError, makeRequestId } from "@/lib/obs";
import { resolveFamilyId } from "@/lib/family";

const STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;
const FILTER_STATUSES = ["PENDING", "APPROVED", "REJECTED", "EXPIRED"] as const;
const ABSENCE_TYPES = ["MEETING", "GENERAL"] as const;

type AbsenceType = (typeof ABSENCE_TYPES)[number];
type AbsenceUiStatus = (typeof FILTER_STATUSES)[number];
type AbsenceMeta = {
  v: 1;
  type: AbsenceType;
  meetingDate: string | null;
  memberNotes: string | null;
  rejectionReason: string | null;
  rejectedById: string | null;
  rejectedAt: string | null;
};

function parsePageParams(searchParams: URLSearchParams) {
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const pageSizeRaw = Number(searchParams.get("pageSize") ?? "20");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const pageSize = Math.min(Math.max(Number.isFinite(pageSizeRaw) ? pageSizeRaw : 20, 1), 100);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function isValidStatus(value: string | null) {
  return value ? FILTER_STATUSES.includes(value as (typeof FILTER_STATUSES)[number]) : true;
}

function parseDate(value: string) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function parseAbsenceType(value: unknown): AbsenceType {
  const normalized = String(value ?? "GENERAL").trim().toUpperCase();
  return normalized === "MEETING" ? "MEETING" : "GENERAL";
}

function normalizeMeetingDateToSunday21(date: Date): Date {
  const normalized = new Date(date);
  const day = normalized.getDay();
  const diffToSunday = (7 - day) % 7;
  normalized.setDate(normalized.getDate() + diffToSunday);
  normalized.setHours(21, 0, 0, 0);
  return normalized;
}

function parseAbsenceMeta(notes: string | null | undefined): AbsenceMeta {
  if (!notes) {
    return {
      v: 1,
      type: "GENERAL",
      meetingDate: null,
      memberNotes: null,
      rejectionReason: null,
      rejectedById: null,
      rejectedAt: null,
    };
  }

  try {
    const parsed = JSON.parse(notes) as Partial<AbsenceMeta>;
    const type = parseAbsenceType(parsed.type);
    return {
      v: 1,
      type,
      meetingDate: typeof parsed.meetingDate === "string" ? parsed.meetingDate : null,
      memberNotes: typeof parsed.memberNotes === "string" ? parsed.memberNotes : null,
      rejectionReason: typeof parsed.rejectionReason === "string" ? parsed.rejectionReason : null,
      rejectedById: typeof parsed.rejectedById === "string" ? parsed.rejectedById : null,
      rejectedAt: typeof parsed.rejectedAt === "string" ? parsed.rejectedAt : null,
    };
  } catch {
    return {
      v: 1,
      type: "GENERAL",
      meetingDate: null,
      memberNotes: notes,
      rejectionReason: null,
      rejectedById: null,
      rejectedAt: null,
    };
  }
}

function stringifyAbsenceMeta(meta: AbsenceMeta): string {
  return JSON.stringify(meta);
}

function computeUiStatus(status: string, endAt: Date): AbsenceUiStatus {
  if (status === "APPROVED" && endAt.getTime() < Date.now()) {
    return "EXPIRED";
  }
  return status as AbsenceUiStatus;
}

function toResponseAbsence(row: any) {
  const meta = parseAbsenceMeta(row.notes);
  return {
    id: row.id,
    familyId: row.familyId,
    memberId: row.memberId,
    member: row.member
      ? {
          id: row.member.id,
          rpName: row.member.rpName,
          discordId: row.member.discordId,
          steamId: row.member.steamId,
        }
      : null,
    discordId: row.discordId,
    reason: row.reason,
    notes: meta.memberNotes,
    type: meta.type,
    meetingDate: meta.meetingDate,
    status: row.status,
    uiStatus: computeUiStatus(row.status, row.endAt),
    rejectionReason: meta.rejectionReason,
    startAt: row.startAt.toISOString(),
    endAt: row.endAt.toISOString(),
    decidedAt: row.decidedAt ? row.decidedAt.toISOString() : null,
    decidedBy: row.decidedBy
      ? {
          id: row.decidedBy.id,
          name: row.decidedBy.name,
          discordId: row.decidedBy.accounts?.[0]?.providerAccountId ?? null,
          rpName: row.decidedBy._rpName ?? null, // enrichi après query
        }
      : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const requestId = req.headers.get("x-request-id") || makeRequestId();
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  try {
    const { searchParams } = new URL(req.url);
    const familyId = searchParams.get("familyId") ?? "esperados";
    const status = searchParams.get("status");
    const discordId = (searchParams.get("discordId") ?? "").trim();
    const memberId = (searchParams.get("memberId") ?? "").trim();
    const dateFromRaw = (searchParams.get("dateFrom") ?? "").trim();
    const dateToRaw = (searchParams.get("dateTo") ?? "").trim();

    if (!isValidStatus(status)) {
      logWarn("absences_list_invalid_status", { requestId, status });
      return NextResponse.json({ ok: false, error: "INVALID_STATUS", requestId }, { status: 400 });
    }

    const { page, pageSize, skip } = parsePageParams(searchParams);

    // ✅ Résoudre le slug en CUID (familyId DB = CUID, pas le slug)
    const resolvedFamilyId = await resolveFamilyId(familyId);

    let dateFrom: Date | null = null;
    let dateTo: Date | null = null;
    if (dateFromRaw) {
      dateFrom = parseDate(dateFromRaw);
      if (!dateFrom) {
        logWarn("absences_list_invalid_date_from", { requestId, dateFromRaw });
        return NextResponse.json({ ok: false, error: "INVALID_DATE_FROM", requestId }, { status: 400 });
      }
    }
    if (dateToRaw) {
      dateTo = parseDate(dateToRaw);
      if (!dateTo) {
        logWarn("absences_list_invalid_date_to", { requestId, dateToRaw });
        return NextResponse.json({ ok: false, error: "INVALID_DATE_TO", requestId }, { status: 400 });
      }
    }

    const where: any = { familyId: resolvedFamilyId };
    if (status === "EXPIRED") {
      where.status = "APPROVED";
      where.endAt = { lt: new Date() };
    } else if (status) {
      where.status = status;
    }
    if (discordId) where.discordId = discordId;
    if (memberId) where.memberId = memberId;
    if (dateFrom || dateTo) {
      where.startAt = {};
      if (dateFrom) where.startAt.gte = dateFrom;
      if (dateTo) where.startAt.lte = dateTo;
    }

    const [rows, total] = await Promise.all([
      prisma.absence.findMany({
        where,
        orderBy: { startAt: "desc" },
        skip,
        take: pageSize,
        include: {
          member: {
            select: { id: true, rpName: true, discordId: true, steamId: true },
          },
          decidedBy: {
            select: {
              id: true,
              name: true,
              accounts: {
                where: { provider: "discord" },
                select: { providerAccountId: true },
                take: 1,
              },
            },
          },
        },
      }),
      prisma.absence.count({ where }),
    ]);

    // Enrichir decidedBy avec le rpName du membre validateur
    const decidedByDiscordIds = rows
      .map((r: any) => r.decidedBy?.accounts?.[0]?.providerAccountId)
      .filter((id: any): id is string => typeof id === "string" && id.length > 0);

    const decidedByMemberMap = new Map<string, string>();
    if (decidedByDiscordIds.length > 0) {
      const decidedMembers = await prisma.member.findMany({
        where: { discordId: { in: decidedByDiscordIds } },
        select: { discordId: true, rpName: true },
      });
      for (const m of decidedMembers) {
        if (m.discordId) decidedByMemberMap.set(m.discordId, m.rpName ?? "");
      }
    }

    // Injecter _rpName avant de sérialiser
    for (const row of rows as any[]) {
      if (row.decidedBy?.accounts?.[0]?.providerAccountId) {
        row.decidedBy._rpName = decidedByMemberMap.get(row.decidedBy.accounts[0].providerAccountId) ?? null;
      }
    }

    const data = rows.map((row: any) => toResponseAbsence(row));

    logInfo("absences_listed", { requestId, total, page, pageSize });
    return NextResponse.json({ ok: true, requestId, data, page, pageSize, total });
  } catch (error) {
    logError("absences_list_error", { requestId }, error);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const requestId = req.headers.get("x-request-id") || makeRequestId();
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const actorId = session?.user?.id;
  if (!actorId) {
    logWarn("absence_create_unauthenticated", { requestId });
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED", requestId }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(req.url);
    const body = await req.json().catch(() => null);
    if (!body) {
      logWarn("absence_create_invalid_body", { requestId });
      return NextResponse.json({ ok: false, error: "INVALID_BODY", requestId }, { status: 400 });
    }

    const familySlug = String(searchParams.get("familyId") ?? body.familyId ?? "esperados").trim() || "esperados";
    // ✅ Résoudre le slug en CUID (familyId DB = CUID, pas le slug)
    const familyId = await resolveFamilyId(familySlug);
    const discordId = String(body.discordId ?? "").trim();
    const memberId = String(body.memberId ?? "").trim();
    const reason = String(body.reason ?? "").trim();
    const notes = String(body.notes ?? "").trim();
    const type = parseAbsenceType(body.type);
    const meetingDateRaw = String(body.meetingDate ?? "").trim();
    const startAtRaw = String(body.startAt ?? "").trim();
    const endAtRaw = String(body.endAt ?? "").trim();

    if (!memberId && !discordId) {
      logWarn("absence_create_missing_identity", { requestId });
      return NextResponse.json({ ok: false, error: "MISSING_MEMBER", requestId }, { status: 400 });
    }
    if (!startAtRaw || !endAtRaw) {
      logWarn("absence_create_missing_dates", { requestId });
      return NextResponse.json({ ok: false, error: "MISSING_DATES", requestId }, { status: 400 });
    }

    let startAt = parseDate(startAtRaw);
    let endAt = parseDate(endAtRaw);
    if (!startAt || !endAt) {
      logWarn("absence_create_invalid_dates", { requestId, startAtRaw, endAtRaw });
      return NextResponse.json({ ok: false, error: "INVALID_DATES", requestId }, { status: 400 });
    }

    let meetingDate: Date | null = null;
    if (type === "MEETING") {
      const meetingSource = meetingDateRaw || startAtRaw || endAtRaw;
      const parsedMeetingDate = parseDate(meetingSource);
      if (!parsedMeetingDate) {
        return NextResponse.json({ ok: false, error: "INVALID_MEETING_DATE", requestId }, { status: 400 });
      }
      meetingDate = normalizeMeetingDateToSunday21(parsedMeetingDate);
      startAt = new Date(meetingDate);
      startAt.setHours(0, 0, 0, 0);
      endAt = new Date(meetingDate);
      endAt.setHours(23, 59, 59, 999);
    }

    if (endAt.getTime() < startAt.getTime()) {
      logWarn("absence_create_end_before_start", { requestId, startAt, endAt });
      return NextResponse.json({ ok: false, error: "END_BEFORE_START", requestId }, { status: 400 });
    }

    if (type === "GENERAL") {
      const maxEnd = new Date(startAt);
      maxEnd.setMonth(maxEnd.getMonth() + 2);
      if (endAt.getTime() > maxEnd.getTime()) {
        return NextResponse.json({ ok: false, error: "GENERAL_MAX_2_MONTHS", requestId }, { status: 400 });
      }
    }

    const member = memberId
      ? await prisma.member.findFirst({
          where: { id: memberId, familyId },
          select: { id: true, rpName: true, discordId: true, steamId: true },
        })
      : await prisma.member.findFirst({
          where: { familyId, discordId },
          select: { id: true, rpName: true, discordId: true, steamId: true },
        });

    if (!member) {
      logWarn("absence_create_member_not_found", { requestId, familyId, memberId, discordId });
      return NextResponse.json({ ok: false, error: "MEMBER_NOT_FOUND", requestId }, { status: 404 });
    }

    const created = await prisma.absence.create({
      data: {
        familyId,
        discordId: member.discordId ?? discordId,
        memberId: member.id,
        reason: reason || null,
        notes: stringifyAbsenceMeta({
          v: 1,
          type,
          meetingDate: meetingDate ? meetingDate.toISOString() : null,
          memberNotes: notes || null,
          rejectionReason: null,
          rejectedById: null,
          rejectedAt: null,
        }),
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
        entityId: created.id,
        meta: {
          memberId: member.id,
          discordId: member.discordId,
          status: created.status,
          startAt: created.startAt,
          endAt: created.endAt,
        },
      },
    });

    try {
      const config = await getOrCreateDiscordConfig(familySlug);
      await enqueueMessageFromTemplate({
        familyId,
        channelId: config.absencesChannelId,
        key: "absence.requested",
        vars: {
          discordId: member.discordId ?? discordId,
          startAt: created.startAt.toISOString(),
          endAt: created.endAt.toISOString(),
          status: created.status,
        },
        entity: "Absence",
        entityId: created.id,
      });
    } catch (err) {
      logWarn("absence_create_discord_enqueue_failed", { requestId, error: String(err) });
    }

    logInfo("absence_created", { requestId, absenceId: created.id, memberId: member.id });
    return NextResponse.json({
      ok: true,
      requestId,
      data: {
        ...toResponseAbsence({ ...created, member }),
      },
    });
  } catch (error) {
    logError("absence_create_error", { requestId }, error);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}
