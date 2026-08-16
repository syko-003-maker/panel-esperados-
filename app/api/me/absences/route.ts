import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { enqueueMemberAbsenceCreated } from "@/lib/discord/discord";
import { sendPushToStaff } from "@/lib/push";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELED", "EXPIRED"] as const;
const ABSENCE_TYPES = ["MEETING", "GENERAL"] as const;
const FAMILY_ID = DEFAULT_FAMILY_ID;

type AbsenceType = (typeof ABSENCE_TYPES)[number];
type AbsenceUiStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELED" | "EXPIRED";

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
  return value ? STATUSES.includes(value as (typeof STATUSES)[number]) : true;
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

function toResponseAbsence(absence: any) {
  const meta = parseAbsenceMeta(absence.notes);
  return {
    id: absence.id,
    familyId: absence.familyId,
    memberId: absence.memberId,
    discordId: absence.discordId,
    reason: absence.reason,
    notes: meta.memberNotes,
    type: meta.type,
    meetingDate: meta.meetingDate,
    status: absence.status,
    uiStatus: computeUiStatus(absence.status, absence.endAt),
    rejectionReason: meta.rejectionReason,
    startAt: absence.startAt.toISOString(),
    endAt: absence.endAt.toISOString(),
    decidedAt: absence.decidedAt ? absence.decidedAt.toISOString() : null,
    createdAt: absence.createdAt.toISOString(),
    updatedAt: absence.updatedAt.toISOString(),
  };
}

export async function GET(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const scope = await getMemberScopeOrNull(session);
  if (!scope) {
    return NextResponse.json(
      { ok: false, code: "MEMBER_NOT_LINKED" },
      { status: 403 }
    );
  }

  const { searchParams } = new URL(req.url);
  const { discordId } = scope;
  const status = searchParams.get("status");

  if (!isValidStatus(status)) {
    return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
  }

  const { page, pageSize, skip } = parsePageParams(searchParams);
  const familyDbId = await resolveFamilyId(FAMILY_ID);
  const where: any = { familyId: familyDbId, discordId: String(discordId) };
  if (status === "EXPIRED") {
    where.status = "APPROVED";
    where.endAt = { lt: new Date() };
  } else if (status) {
    where.status = status;
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

  return NextResponse.json({ ok: true, data: data.map((item) => toResponseAbsence(item)), page, pageSize, total });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const scope = await getMemberScopeOrNull(session);
  if (!scope) {
    return NextResponse.json(
      { ok: false, code: "MEMBER_NOT_LINKED" },
      { status: 403 }
    );
  }

  const { discordId } = scope;
  const actorId = session?.user?.id ?? (session as any)?.userId;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const type = parseAbsenceType(body.type);
  const startAtRaw = String(body.startAt ?? "").trim();
  const endAtRaw = String(body.endAt ?? "").trim();
  const meetingDateRaw = String(body.meetingDate ?? "").trim();
  const reason = String(body.reason ?? "").trim();
  const memberNotes = String(body.notes ?? "").trim();

  if (!startAtRaw || !endAtRaw) {
    return NextResponse.json({ ok: false, error: "MISSING_DATES" }, { status: 400 });
  }

  let startAt = parseDate(startAtRaw);
  let endAt = parseDate(endAtRaw);
  if (!startAt || !endAt) {
    return NextResponse.json({ ok: false, error: "INVALID_DATES" }, { status: 400 });
  }

  let meetingDate: Date | null = null;
  if (type === "MEETING") {
    const meetingSource = meetingDateRaw || startAtRaw || endAtRaw;
    const parsedMeetingDate = parseDate(meetingSource);
    if (!parsedMeetingDate) {
      return NextResponse.json({ ok: false, error: "INVALID_MEETING_DATE" }, { status: 400 });
    }
    meetingDate = normalizeMeetingDateToSunday21(parsedMeetingDate);
    startAt = new Date(meetingDate);
    startAt.setHours(0, 0, 0, 0);
    endAt = new Date(meetingDate);
    endAt.setHours(23, 59, 59, 999);
  }

  if (endAt.getTime() < startAt.getTime()) {
    return NextResponse.json({ ok: false, error: "END_BEFORE_START" }, { status: 400 });
  }

  if (type === "GENERAL") {
    const maxEnd = new Date(startAt);
    maxEnd.setMonth(maxEnd.getMonth() + 2);
    if (endAt.getTime() > maxEnd.getTime()) {
      return NextResponse.json({ ok: false, error: "GENERAL_MAX_2_MONTHS" }, { status: 400 });
    }
  }

  const now = new Date();
  const activeStatuses: ("PENDING" | "APPROVED")[] = ["PENDING", "APPROVED"];
  const familyDbId = await resolveFamilyId(FAMILY_ID);
  const activeWhere = {
    familyId: familyDbId,
    discordId: String(discordId),
    status: { in: activeStatuses },
    endAt: { gte: now },
  };

  const existingCount = await prisma.absence.count({
    where: activeWhere,
  });
  if (existingCount >= 2) {
    return NextResponse.json(
      { ok: false, error: "Tu as d\u00e9j\u00e0 2 absences en cours/\u00e0 venir. Maximum autoris\u00e9: 2." },
      { status: 400 }
    );
  }

  const overlap = await prisma.absence.findFirst({
    where: {
      ...activeWhere,
      startAt: { lte: endAt },
      endAt: { gte: startAt },
    },
    select: { id: true, startAt: true, endAt: true, status: true },
  });
  if (overlap) {
    return NextResponse.json(
      { ok: false, error: "Une absence existe d\u00e9j\u00e0 sur cette p\u00e9riode. Tu ne peux pas avoir 2 absences qui se chevauchent." },
      { status: 400 }
    );
  }

  const absence = await prisma.$transaction(async (tx) => {
    const created = await tx.absence.create({
      data: {
        familyId: familyDbId,
        discordId: String(discordId),
        memberId: scope.memberId ?? null,
        startAt,
        endAt,
        reason: reason || null,
        notes: stringifyAbsenceMeta({
          v: 1,
          type,
          meetingDate: meetingDate ? meetingDate.toISOString() : null,
          memberNotes: memberNotes || null,
          rejectionReason: null,
          rejectedById: null,
          rejectedAt: null,
        }),
        status: "PENDING",
        createdById: actorId,
      },
    });

    await tx.auditLog.create({
      data: {
        familyId: familyDbId,
        actorId,
        action: "create",
        entity: "Absence",
        entityId: created.id,
        meta: {
          discordId: String(discordId),
          status: created.status,
          startAt: created.startAt,
          endAt: created.endAt,
          source: "member_portal",
          rule: "max2_no_overlap",
        },
      },
    });

    try {
      await enqueueMemberAbsenceCreated({
          familyId: familyDbId,
        discordId: String(discordId),
          memberId: scope.memberId,
        absenceId: created.id,
        client: tx,
      });
    } catch (err) {
      console.warn("discord enqueue member absence failed", err);
    }

    return created;
  });

  // Notifie le staff qu'une absence est à valider (fire-and-forget).
  void sendPushToStaff({
    title: "📅 Absence à valider",
    body: `${scope.rpName || "Un membre"} a déposé une demande d'absence (${type}).`,
    url: "/staff/absences",
    tag: "absence-filed-" + absence.id,
  }).catch((err: unknown) => {
    // Notification perdue : degradation silencieuse d'un canal d'alerte.
    console.warn("[push] notification non delivree", {
      event: "absence_filed",
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ ok: true, absence: toResponseAbsence(absence) });
}
