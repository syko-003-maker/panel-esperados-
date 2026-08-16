import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChef, requirePrivileged } from "@/lib/guards";
import { getActivityConfig, updateActivityConfig } from "@/lib/activity-config";
import { toFamilyCuid } from "@/lib/family";

const DEFAULT_FAMILY_ID = "esperados";

export async function GET(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familyId = await toFamilyCuid(searchParams.get("familyId") ?? DEFAULT_FAMILY_ID);

  const config = await getActivityConfig(prisma, familyId);
  return NextResponse.json({ ok: true, familyId, config });
}

async function handleUpdate(req: Request) {
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const familyId = await toFamilyCuid(String(body.familyId ?? DEFAULT_FAMILY_ID).trim());
  const patch = { ...body } as Record<string, unknown>;
  delete patch.familyId;

  const config = await updateActivityConfig(prisma, familyId, patch as any);
  return NextResponse.json({ ok: true, familyId, config });
}

export async function PATCH(req: Request) {
  return handleUpdate(req);
}

export async function POST(req: Request) {
  return handleUpdate(req);
}
