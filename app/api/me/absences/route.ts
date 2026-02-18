import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { enqueueMemberAbsenceCreated } from "@/lib/discord/discord";

const STATUSES = ["PENDING", "APPROVED", "REJECTED", "CANCELED"] as const;
const FAMILY_ID = "esperados";

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
  const where: any = { familyId: FAMILY_ID, discordId: String(discordId) };
  if (status) where.status = status;

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

  const startAtRaw = String(body.startAt ?? "").trim();
  const endAtRaw = String(body.endAt ?? "").trim();
  const reason = String(body.reason ?? "").trim();

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

  const now = new Date();
  const activeStatuses: ("PENDING" | "APPROVED")[] = ["PENDING", "APPROVED"];
  const activeWhere = {
    familyId: FAMILY_ID,
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
        familyId: FAMILY_ID,
        discordId: String(discordId),
        startAt,
        endAt,
        reason: reason || null,
        notes: null,
        status: "PENDING",
        createdById: actorId,
      },
    });

    await tx.auditLog.create({
      data: {
        familyId: FAMILY_ID,
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
          familyId: FAMILY_ID,
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

  return NextResponse.json({ ok: true, absence });
}
