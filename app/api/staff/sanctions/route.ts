import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor, requirePrivileged } from "@/lib/guards";
import { logInfo, logWarn, logError, makeRequestId } from "@/lib/obs";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { auditStaffAction } from "@/lib/audit";
import { evaluateSanctionRules } from "@/lib/sanction-rules";
import { getUserDiscordIdFromSession } from "@/server/auth/discord";
import type { SanctionType } from "@prisma/client";
import { enqueueRemoveRole, enqueueSanctionApply } from "@/lib/discord/discord";
import {
  BLOCKING_SANCTION_TYPES,
  getAvertRoleId,
  getSanctionExpirationDate,
  isValidSanctionType,
  SANCTION_TYPES,
} from "@/lib/sanctions";
import { getEffectiveSanctionStatus } from "@/lib/sanction-status-labels";

const STATUSES = ["ACTIVE", "EXPIRED", "CLOSED"] as const;
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
  return value ? SANCTION_TYPES.includes(value as (typeof SANCTION_TYPES)[number]) : true;
}

function isValidDiscordStatus(value: string | null) {
  return value ? DISCORD_STATUSES.includes(value as (typeof DISCORD_STATUSES)[number]) : true;
}

function toIso(value: Date | null) {
  return value ? value.toISOString() : null;
}

async function resolveActorStaffContext(params: {
  session: any;
  familyId: string;
  actorId: string;
  actorMemberIdFromSession: string | null;
}) {
  const actorDiscordId = await getUserDiscordIdFromSession(params.session);

  let actorMemberId =
    typeof params.actorMemberIdFromSession === "string" && params.actorMemberIdFromSession.trim()
      ? params.actorMemberIdFromSession.trim()
      : null;
  let actorRpName: string | null = null;

  if (actorMemberId) {
    const actorMember = await prisma.member.findFirst({
      where: { id: actorMemberId, familyId: params.familyId },
      select: { id: true, rpName: true },
    });
    if (actorMember?.id) {
      actorMemberId = actorMember.id;
      actorRpName = actorMember.rpName?.trim() || null;
    } else {
      actorMemberId = null;
    }
  }

  if (!actorMemberId && actorDiscordId) {
    const linkedMember = await prisma.member.findUnique({
      where: {
        familyId_discordId: {
          familyId: params.familyId,
          discordId: actorDiscordId,
        },
      },
      select: { id: true, rpName: true },
    });
    if (linkedMember?.id) {
      actorMemberId = linkedMember.id;
      actorRpName = linkedMember.rpName?.trim() || null;
    }
  }

  if (!actorMemberId) {
    const staffUser = await prisma.staffUser.findFirst({
      where: {
        familyId: params.familyId,
        isActive: true,
        OR: [{ userId: params.actorId }, ...(actorDiscordId ? [{ discordId: actorDiscordId }] : [])],
      },
      select: { discordId: true },
    });

    if (staffUser?.discordId) {
      const staffMember = await prisma.member.findUnique({
        where: {
          familyId_discordId: {
            familyId: params.familyId,
            discordId: staffUser.discordId,
          },
        },
        select: { id: true, rpName: true },
      });

      if (staffMember?.id) {
        actorMemberId = staffMember.id;
        actorRpName = staffMember.rpName?.trim() || null;
      }
    }
  }

  return { actorMemberId, actorRpName };
}

export async function GET(req: Request) {
  const guard = await requirePrivileged();
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
    const familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);
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
    const guildId = process.env.DISCORD_GUILD_ID ?? process.env.GUILD_ID ?? "";

    const expiredSanctions = await prisma.sanction.findMany({
      where: { familyId, status: "ACTIVE", expiresAt: { lt: now } },
      select: {
        id: true,
        familyId: true,
        discordId: true,
        type: true,
      },
    });

    for (const sanction of expiredSanctions) {
      const roleId = getAvertRoleId(sanction.type);
      const shouldQueueCleanup = Boolean(roleId && sanction.discordId && guildId);

      await prisma.sanction.update({
        where: { id: sanction.id },
        data: {
          status: "EXPIRED",
          closedAt: now,
          clearedStatus: shouldQueueCleanup ? "PENDING" : undefined,
          clearedError: shouldQueueCleanup ? null : undefined,
        } as any,
      });

      if (shouldQueueCleanup) {
        await enqueueRemoveRole({
          familyId: sanction.familyId,
          guildId,
          userDiscordId: sanction.discordId!,
          roleId: roleId!,
          entity: "Sanction",
          entityId: sanction.id,
          meta: {
            sanctionId: sanction.id,
            sanctionType: sanction.type,
            setClearedAt: false,
          },
        });
      }
    }

    const where: any = { familyId };
    if (status) where.status = status;
    if (status === "ACTIVE") {
      where.clearedAt = null;
      where.NOT = { clearedStatus: "APPLIED" };
    }
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
          outboxJobId: true,
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
    const outboxIds = Array.from(new Set(data.map((item: any) => item.outboxJobId).filter(Boolean)));
    const members = memberIds.length
      ? await prisma.member.findMany({
          where: { id: { in: memberIds as string[] } },
          select: { id: true, rpName: true, discordId: true },
        })
      : [];
    const outboxes = outboxIds.length
      ? await prisma.discordOutbox.findMany({
          where: { id: { in: outboxIds as string[] } },
          select: { id: true, status: true },
        })
      : [];
    const memberMap = new Map(members.map((m) => [m.id, m]));
    const outboxMap = new Map(outboxes.map((outbox) => [outbox.id, outbox.status]));

    const items = data.map((item: any) => {
      const member = item.memberId ? memberMap.get(item.memberId) : null;
      const effectiveDiscordStatus =
        item.discordStatus === "PENDING" && item.discordAppliedAt ? "APPLIED" : item.discordStatus;
      return {
        id: item.id,
        memberId: item.memberId,
        memberDiscordId: member?.discordId ?? item.discordId,
        memberName: member?.rpName ?? "Unknown",
        type: item.type,
        source: item.source,
        status: getEffectiveSanctionStatus(item.status, item.clearedAt, item.clearedStatus),
        reason: item.reason ?? null,
        startAt: item.startAt.toISOString(),
        endAt: toIso(item.endAt),
        expiresAt: toIso(item.expiresAt),
        clearedAt: toIso(item.clearedAt),
        clearedStatus: item.clearedStatus ?? null,
        clearedError: item.clearedError ?? null,
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
        discordStatus: effectiveDiscordStatus,
        outboxStatus: item.outboxJobId ? outboxMap.get(item.outboxJobId) ?? null : null,
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
  const requestId = makeRequestId();

  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const actorId = (guard.session as any)?.user?.id ?? (guard.session as any)?.userId;
  const actorMemberIdFromSession = (guard.session as any)?.member?.id ?? null;
  const actorName = (guard.session as any)?.user?.name ?? null;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  try {

  const familyId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const { actorMemberId, actorRpName } = await resolveActorStaffContext({
    session: guard.session,
    familyId,
    actorId,
    actorMemberIdFromSession,
  });
  const typeRaw = String(body.type ?? "").trim().toUpperCase();
  const reasonRaw = typeof body.reason === "string" ? body.reason.trim() : "";

  if (!typeRaw || !isValidSanctionType(typeRaw)) {
    return NextResponse.json({ ok: false, error: "INVALID_TYPE", requestId }, { status: 400 });
  }

  const memberId = body.memberId ? String(body.memberId).trim() : null;
  const memberDiscordId = body.memberDiscordId ? String(body.memberDiscordId).trim() : null;

  if (!memberId && !memberDiscordId) {
    return NextResponse.json({ ok: false, error: "MISSING_MEMBER", requestId }, { status: 400 });
  }

  const member = memberId
    ? await prisma.member.findFirst({
        where: { id: memberId, familyId },
        select: { id: true, discordId: true, rpName: true, isActive: true, isGhost: true },
      })
    : await prisma.member.findUnique({
        where: { familyId_discordId: { familyId, discordId: memberDiscordId! } },
        select: { id: true, discordId: true, rpName: true, isActive: true, isGhost: true },
      });

  if (!member || !member.discordId) {
    logWarn("sanction_create_member_not_found", { requestId, memberId, memberDiscordId });
    return NextResponse.json({ ok: false, error: "MEMBER_NOT_FOUND", requestId }, { status: 404 });
  }

  if (!member.isActive || member.isGhost) {
    logWarn("sanction_create_member_not_active", { requestId, memberId: member.id, rpName: member.rpName });
    return NextResponse.json({ ok: false, error: "MEMBER_NOT_ACTIVE", requestId }, { status: 400 });
  }

  const blockingSanction = await prisma.sanction.findFirst({
    where: {
      familyId,
      memberId: member.id,
      status: "ACTIVE",
      clearedAt: null,
      type: { in: [...BLOCKING_SANCTION_TYPES] },
    },
    select: { id: true, type: true },
  });

  if (blockingSanction) {
    return NextResponse.json(
      { ok: false, error: "MEMBER_NOT_SANCTIONABLE", blockingType: blockingSanction.type },
      { status: 409 }
    );
  }

  const startAt = new Date();
  const expiresAt = getSanctionExpirationDate(typeRaw, startAt);

  // Optional: link to complaint if provided
  const complaintId = body.complaintId ? String(body.complaintId).trim() : null;

  const sanction = (await prisma.sanction.create({
    data: {
      familyId,
      discordId: member.discordId,
      memberId: member.id,
      type: typeRaw as SanctionType,
      reason: reasonRaw || null,
      startAt,
      expiresAt,
      status: "ACTIVE",
      discordStatus: "PENDING",
      createdById: actorId,
      complaintId: complaintId || null,
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
      reason: sanction.reason ?? null,
      complaintId: complaintId ?? null,
      expiresAt: expiresAt?.toISOString() ?? null,
    },
  });

  const durationHours = expiresAt
    ? Math.max(1, Math.ceil((expiresAt.getTime() - startAt.getTime()) / (60 * 60 * 1000)))
    : null;

  const outbox = await enqueueSanctionApply({
    familyId,
    sanctionId: sanction.id,
    discordId: member.discordId,
    memberName: member.rpName ?? "Unknown",
    sanctionType: sanction.type,
    reason: sanction.reason,
    durationHours,
    staffName: actorName ?? "Staff inconnu",
    staffRpName: actorRpName,
    appliedByUserId: actorId,
    actorMemberId,
  });

  await prisma.sanction.update({
    where: { id: sanction.id },
    data: { outboxJobId: outbox?.id ?? null } as any,
  });

  // Evaluate auto sanction rules
  await evaluateSanctionRules(member.id, familyId).catch((err) => {
    logError("sanction_create_rules_evaluation_failed", { requestId, sanctionId: sanction.id, memberId: member.id }, err);
  });

  logInfo("sanction_created", {
    requestId,
    sanctionId: sanction.id,
    memberId: member.id,
    rpName: member.rpName ?? "Unknown",
    type: sanction.type,
    actorId,
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
      outboxJobId: outbox?.id ?? null,
      createdAt: sanction.createdAt.toISOString(),
    },
  });
  } catch (err) {
    logError("sanction_create_error", { requestId }, err);
    return NextResponse.json({ ok: false, error: "INTERNAL_ERROR", requestId }, { status: 500 });
  }
}
