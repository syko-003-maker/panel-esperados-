import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/guards";

/**
 * GET /api/admin/activity/rules/[id]
 * Get a single activity rule
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (guard instanceof Response) return guard;

  const { id } = await params;

  try {
    const rule = await prisma.activityRule.findUnique({
      where: { id },
    });

    if (!rule) {
      return NextResponse.json({ ok: false, error: "Rule not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true, rule });
  } catch (error: any) {
    console.error(`[/api/admin/activity/rules/${id} GET]`, error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch rule" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/admin/activity/rules/[id]
 * Update an activity rule
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (guard instanceof Response) return guard;

  const { id } = await params;
  const body = await req.json();

  try {
    const existing = await prisma.activityRule.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Rule not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.params !== undefined) updateData.params = body.params;
    if (body.isEnabled !== undefined) updateData.isEnabled = body.isEnabled;
    if (body.priority !== undefined) updateData.priority = body.priority;

    const rule = await prisma.activityRule.update({
      where: { id },
      data: updateData,
    });

    return NextResponse.json({ ok: true, rule });
  } catch (error: any) {
    console.error(`[/api/admin/activity/rules/${id} PATCH]`, error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to update rule" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/admin/activity/rules/[id]
 * Delete an activity rule
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireAdmin();
  if (guard instanceof Response) return guard;

  const { id } = await params;

  try {
    const existing = await prisma.activityRule.findUnique({
      where: { id },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Rule not found" }, { status: 404 });
    }

    await prisma.activityRule.delete({
      where: { id },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error(`[/api/admin/activity/rules/${id} DELETE]`, error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to delete rule" },
      { status: 500 }
    );
  }
}
