import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";

const STATUSES = ["SUBMITTED", "REVIEWED"] as const;

function isValidStatus(value: string) {
  return STATUSES.includes(value as (typeof STATUSES)[number]);
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const items = await prisma.absenceJustification.findMany({
    where: { absenceId: id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ ok: true, data: items });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const justificationId = String(body.id ?? "").trim();
  if (!justificationId) {
    return NextResponse.json({ ok: false, error: "MISSING_ID" }, { status: 400 });
  }

  const updateData: any = {};
  if ("staffReply" in body) {
    const value = String(body.staffReply ?? "").trim();
    updateData.staffReply = value || null;
  }
  if ("status" in body) {
    const value = String(body.status ?? "").trim();
    if (!isValidStatus(value)) {
      return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
    }
    updateData.status = value;
  } else {
    updateData.status = "REVIEWED";
  }

  const updated = await prisma.absenceJustification.updateMany({
    where: { id: justificationId, absenceId: id },
    data: updateData,
  });

  if (updated.count === 0) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const item = await prisma.absenceJustification.findUnique({ where: { id: justificationId } });
  return NextResponse.json({ ok: true, data: item });
}
