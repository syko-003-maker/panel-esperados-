import { toFamilyCuid } from "@/lib/family";
import { NextResponse } from "next/server";
import { requireChef } from "@/lib/guards";
import { prisma } from "@/lib/db";

export async function GET(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familyId = await toFamilyCuid(searchParams.get("familyId"));
  const item = await prisma.discordTemplate.findUnique({
    where: { familyId_key: { familyId, key } },
  });
  if (!item) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, data: item });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familyId = await toFamilyCuid(searchParams.get("familyId"));
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }
  const content = "content" in body ? String(body.content ?? "").trim() : null;
  const title = "title" in body ? String(body.title ?? "").trim() : null;
  const enabled = "enabled" in body ? Boolean(body.enabled) : null;

  const updateData: any = {};
  if (content !== null) {
    if (!content) {
      return NextResponse.json({ ok: false, error: "MISSING_CONTENT" }, { status: 400 });
    }
    updateData.content = content;
  }
  if (title !== null) {
    updateData.title = title || null;
  }
  if (enabled !== null) {
    updateData.enabled = enabled;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ ok: false, error: "NO_FIELDS" }, { status: 400 });
  }

  const updated = await prisma.discordTemplate.update({
    where: { familyId_key: { familyId, key } },
    data: updateData,
  });

  return NextResponse.json({ ok: true, data: updated });
}

export async function DELETE(req: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familyId = await toFamilyCuid(searchParams.get("familyId"));
  const deleted = await prisma.discordTemplate.deleteMany({ where: { familyId, key } });
  return NextResponse.json({ ok: true, deleted: deleted.count });
}
