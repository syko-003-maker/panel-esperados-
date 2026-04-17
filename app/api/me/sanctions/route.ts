import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";

const STATUSES = ["ACTIVE", "EXPIRED", "CLOSED"] as const;
const FAMILY_ID = DEFAULT_FAMILY_ID;

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

function mapStatusToLegacy(value: string | null) {
  if (!value) return null;
  if (value === "CLOSED") return "LIFTED";
  return value;
}

function mapStatusToApi(value: string) {
  if (value === "LIFTED") return "CLOSED";
  return value;
}

function mapTypeToApi(type: string) {
  return type;
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

  try {
    const { searchParams } = new URL(req.url);
    const { discordId } = scope;
    const status = searchParams.get("status");

    if (!isValidStatus(status)) {
      return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
    }

    const { page, pageSize, skip } = parsePageParams(searchParams);
    const now = new Date();
    const familyDbId = await resolveFamilyId(FAMILY_ID);
    await prisma.sanction.updateMany({
      where: { familyId: familyDbId, status: "ACTIVE", endAt: { lt: now } },
      data: { status: "EXPIRED" },
    });

    const where: any = {
      familyId: familyDbId,
      discordId: String(discordId),
    };
    const legacyStatus = mapStatusToLegacy(status);
    if (legacyStatus) where.status = legacyStatus;

    const [data, total] = await Promise.all([
      prisma.sanction.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: pageSize,
      }),
      prisma.sanction.count({ where }),
    ]);

    return NextResponse.json({
      ok: true,
      data: data.map((item) => ({
        id: item.id,
        type: mapTypeToApi(item.type),
        reason: item.reason ?? null,
        status: mapStatusToApi(item.status),
        startAt: item.startAt.toISOString(),
        createdAt: item.createdAt.toISOString(),
        updatedAt: item.updatedAt.toISOString(),
      })),
      page,
      pageSize,
      total,
    });
  } catch (e: any) {
    const errMsg = e?.message ?? String(e);
    console.error("[/api/me/sanctions GET] error:", errMsg);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
