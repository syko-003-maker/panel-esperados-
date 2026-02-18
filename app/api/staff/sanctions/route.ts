import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { logInfo } from "@/lib/obs";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { auditStaffAction } from "@/lib/audit";
import { evaluateSanctionRules } from "@/lib/sanction-rules";
import type { SanctionType } from "@prisma/client";

const STATUSES = ["ACTIVE", "EXPIRED", "CLOSED"] as const;
const TYPES = [
  "AVERT_ORAL_PLAYTIME",
  "AVERT_ORAL_REUNION",
  "AVERT_LEGER",
  "AVERT_LOURD",
  "DEMOTE",
  "RESERVISTE",
  "BLACKLIST",
] as const;
const DISCORD_STATUSES = ["PENDING", "APPLIED", "FAILED"] as const;

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

function isValidType(value: string | null) {
  return value ? TYPES.includes(value as (typeof TYPES)[number]) : true;
}

function isValidDiscordStatus(value: string | null) {
  return value ? DISCORD_STATUSES.includes(value as (typeof DISCORD_STATUSES)[number]) : true;
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

export async function GET(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const startTime = Date.now();
  const dashboardRequestId = req.headers.get("x-dashboard-request-id");
  const dashboardSection = req.headers.get("x-dashboard-section") ?? "sanctions";
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
    const familyId = searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
    const status = searchParams.get("status");
    const discordStatus = searchParams.get("discordStatus");
    const type = searchParams.get("type");
    const memberId = searchParams.get("memberId");

    if (!isValidStatus(status)) {
      return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
    }
    if (!isValidType(type)) {
      return NextResponse.json({ ok: false, error: "INVALID_TYPE" }, { status: 400 });
    }
    if (!isValidDiscordStatus(discordStatus)) {
      return NextResponse.json({ ok: false, error: "INVALID_DISCORD_STATUS" }, { status: 400 });
    }

    const { page, pageSize, skip } = parsePageParams(searchParams);
    const now = new Date();

    await prisma.sanction.updateMany({
      where: { familyId, status: "ACTIVE", endAt: { lt: now } },
      data: { status: "EXPIRED" },
    });

    const where: any = { familyId };
    if (status) where.status = status;
    if (discordStatus) where.discordStatus = discordStatus;
    if (type) where.type = type;
    if (memberId) where.memberId = memberId;

    const [data, total] = await Promise.all([
      prisma.sanction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
        select: {
          id: true,
          memberId: true,
          discordId: true,
          type: true,
          source: true,
          status: true,
          reason: true,
          startAt: true,
          endAt: true,
          expiresAt: true,
          clearedAt: true,
          clearedStatus: true,
          clearedError: true,
          createdAt: true,
          updatedAt: true,
          discordStatus: true,
          discordAppliedAt: true,
          discordError: true,
          createdById: true,
        },
      }) as any,
      prisma.sanction.count({ where }),
    ]);

    const memberIds = Array.from(new Set(data.map((item: any) => item.memberId).filter(Boolean)));
    const members = memberIds.length
      ? await prisma.member.findMany({
          where: { id: { in: memberIds as string[] } },
          select: { id: true, rpName: true, discordId: true },
        })
      : [];
    const memberMap = new Map(members.map((m) => [m.id, m]));

    const items = data.map((item: any) => {
      const member = item.memberId ? memberMap.get(item.memberId) : null;
      return {
        id: item.id,
        memberId: item.memberId,
        memberDiscordId: member?.discordId ?? item.discordId,
        memberName: member?.rpName ?? "Unknown",
        type: item.type,
        source: item.source,
        status: item.status,
        reason: item.reason ?? null,
        startAt: item.startAt.toISOString(),
        endAt: toIso(item.endAt),
        expiresAt: toIso(item.expiresAt),
        clearedAt: toIso(item.clearedAt),
        clearedStatus: item.clearedStatus ?? null,
        clearedError: item.clearedError ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        discordStatus: item.discordStatus,
        discordAppliedAt: toIso(item.discordAppliedAt),
        discordError: item.discordError ?? null,
        createdById: item.createdById,
      };
    });

    return NextResponse.json({ ok: true, data: items, page, pageSize, total });
  } catch (e: any) {
    const errMsg = e?.message ?? String(e);
    console.error("[/api/staff/sanctions GET] error:", errMsg);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR" }, { status: 500 });
  } finally {
    logDashboardDone();
  }
}

export async function POST(req: Request) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const actorId = (guard.session as any)?.user?.id ?? (guard.session as any)?.userId;
  const actorMemberId = (guard.session as any)?.member?.id ?? null;
  const actorName = (guard.session as any)?.user?.name ?? null;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const familyId = DEFAULT_FAMILY_ID;
  const typeRaw = String(body.type ?? "").trim().toUpperCase();
  const reasonRaw = String(body.reason ?? "").trim();

  if (!typeRaw || !isValidType(typeRaw)) {
    return NextResponse.json({ ok: false, error: "INVALID_TYPE" }, { status: 400 });
  }
  if (!reasonRaw) {
    return NextResponse.json({ ok: false, error: "MISSING_REASON" }, { status: 400 });
  }

  const memberId = body.memberId ? String(body.memberId).trim() : null;
  const memberDiscordId = body.memberDiscordId ? String(body.memberDiscordId).trim() : null;

  if (!memberId && !memberDiscordId) {
    return NextResponse.json({ ok: false, error: "MISSING_MEMBER" }, { status: 400 });
  }

  const member = memberId
    ? await prisma.member.findUnique({
        where: { id: memberId },
        select: { id: true, discordId: true, rpName: true },
      })
    : await prisma.member.findUnique({
        where: { familyId_discordId: { familyId, discordId: memberDiscordId! } },
        select: { id: true, discordId: true, rpName: true },
      });

  if (!member || !member.discordId) {
    return NextResponse.json({ ok: false, error: "MEMBER_NOT_FOUND" }, { status: 404 });
  }

  const startAt = new Date();

  // Calculate expiresAt based on sanction type
  let expiresAt: Date | null = null;
  if (typeRaw === "AVERT_ORAL_PLAYTIME" || typeRaw === "AVERT_ORAL_REUNION" || typeRaw === "AVERT_LEGER") {
    // 7 days expiration
    expiresAt = new Date(startAt.getTime() + 7 * 24 * 60 * 60 * 1000);
  } else if (typeRaw === "AVERT_LOURD") {
    // 14 days expiration
    expiresAt = new Date(startAt.getTime() + 14 * 24 * 60 * 60 * 1000);
  }
  // DEMOTE, RESERVISTE, BLACKLIST have no expiration (null)

  const sanction = (await prisma.sanction.create({
    data: {
      familyId,
      discordId: member.discordId,
      memberId: member.id,
      type: typeRaw as SanctionType,
      reason: reasonRaw,
      startAt,
      expiresAt,
      status: "ACTIVE",
      discordStatus: "PENDING",
      createdById: actorId,
    } as any,
  })) as any;

  await auditStaffAction(actorId, actorName, "SANCTION_CREATE", "Sanction", sanction.id, {
    familyId,
    entityName: member.rpName ?? undefined,
    meta: {
      actorMemberId,
      memberId: member.id,
      memberDiscordId: member.discordId,
      type: sanction.type,
      reason: sanction.reason,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  });

  const logChannelId = process.env.SANCTION_LOG_CHANNEL_ID ?? null;
  if (!logChannelId) {
    await prisma.sanction.update({
      where: { id: sanction.id },
      data: {
        discordStatus: "FAILED",
        discordError: "SANCTION_LOG_CHANNEL_ID_MISSING",
      } as any,
    });

    await auditStaffAction(actorId, actorName, "SANCTION_FAILED", "Sanction", sanction.id, {
      familyId,
      entityName: member.rpName ?? undefined,
      meta: {
        actorMemberId,
        reason: "SANCTION_LOG_CHANNEL_ID_MISSING",
      },
    });

    return NextResponse.json({
      ok: true,
      sanction: {
        id: sanction.id,
        memberId: sanction.memberId,
        memberDiscordId: member.discordId,
        memberName: member.rpName ?? "Unknown",
        type: sanction.type,
        reason: sanction.reason,
        status: sanction.status,
        discordStatus: "FAILED",
        discordError: "SANCTION_LOG_CHANNEL_ID_MISSING",
        createdAt: sanction.createdAt.toISOString(),
      },
    });
  }

  const outbox = await prisma.discordOutbox.create({
    data: {
      familyId,
      type: "SANCTION_APPLY",
      status: "PENDING",
      channelId: logChannelId,
      userDiscordId: member.discordId,
      entity: "Sanction",
      entityId: sanction.id,
      meta: {
        sanctionId: sanction.id,
        memberId: member.id,
        memberDiscordId: member.discordId,
        memberName: member.rpName,
        type: sanction.type,
        reason: sanction.reason,
        expiresAt: expiresAt?.toISOString() ?? null,
      },
    } as any,
  });

  await prisma.sanction.update({
    where: { id: sanction.id },
    data: { outboxJobId: outbox.id } as any,
  });

  // Evaluate auto sanction rules
  await evaluateSanctionRules(member.id, familyId).catch((err) => {
    console.error("[POST /api/staff/sanctions] Error evaluating rules:", err);
  });

  return NextResponse.json({
    ok: true,
    sanction: {
      id: sanction.id,
      memberId: sanction.memberId,
      memberDiscordId: member.discordId,
      memberName: member.rpName ?? "Unknown",
      type: sanction.type,
      reason: sanction.reason,
      status: sanction.status,
      discordStatus: sanction.discordStatus,
      expiresAt: expiresAt?.toISOString() ?? null,
      outboxJobId: outbox.id,
      createdAt: sanction.createdAt.toISOString(),
    },
  });
}
