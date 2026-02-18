import { NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import { prisma } from "@/lib/db";

const STATUSES = ["PENDING", "SENDING", "SENT", "FAILED", "CANCELED"] as const;
const TYPES = [
  "SEND_MESSAGE",
  "ASSIGN_ROLE",
  "REMOVE_ROLE",
  "ME_ABSENCE_CREATED",
  "ME_ABSENCE_JUSTIFIED",
  "ME_SANCTION_JUSTIFIED",
  "BANK_DEBT_PING_SINGLE",
  "BANK_DEBT_PING_BATCH",
  "ABSENCE_JUSTIFICATION_CREATED",
  "SANCTION_JUSTIFICATION_CREATED",
] as const;

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

export async function GET(req: Request) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familyId = searchParams.get("familyId") ?? "esperados";
  const status = searchParams.get("status");
  const type = searchParams.get("type");

  if (!isValidStatus(status)) {
    return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
  }
  if (!isValidType(type)) {
    return NextResponse.json({ ok: false, error: "INVALID_TYPE" }, { status: 400 });
  }

  const { page, pageSize, skip } = parsePageParams(searchParams);

  const where: any = { familyId };
  if (status) where.status = status;
  if (type) where.type = type;

  const [data, total] = await Promise.all([
    prisma.discordOutbox.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take: pageSize,
    }),
    prisma.discordOutbox.count({ where }),
  ]);

  return NextResponse.json({ ok: true, data, page, pageSize, total });
}

export async function PATCH(req: Request) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  if (!id) {
    return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });
  }

  const updated = await prisma.discordOutbox.update({
    where: { id },
    data: { status: "CANCELED" },
  });

  return NextResponse.json({ ok: true, data: updated });
}
