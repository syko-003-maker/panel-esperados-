import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

/**
 * PATCH /api/staff/rbac/users/[id]
 * Update a staff user
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission("ADMIN_FULL");
  if (guard instanceof Response) return guard;

  const { id } = await params;
  const body = await req.json();

  try {
    const existing = await prisma.staffUser.findUnique({
      where: { id },
      include: { role: true },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Staff user not found" }, { status: 404 });
    }

    const updateData: Record<string, unknown> = {};

    // Update role if provided
    if (body.roleId) {
      const role = await prisma.staffRole.findUnique({ where: { id: body.roleId } });
      if (!role) {
        return NextResponse.json({ ok: false, error: "Role not found" }, { status: 404 });
      }
      updateData.roleId = body.roleId;
    }

    if (body.isActive !== undefined) updateData.isActive = body.isActive;
    if (body.notes !== undefined) updateData.notes = body.notes;

    const user = await prisma.staffUser.update({
      where: { id },
      data: updateData,
      include: { role: true },
    });

    return NextResponse.json({ ok: true, user });
  } catch (error: any) {
    console.error(`[/api/staff/rbac/users/${id} PATCH]`, error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to update staff user" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/staff/rbac/users/[id]
 * Remove a staff user (soft delete)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission("ADMIN_FULL");
  if (guard instanceof Response) return guard;

  const { id } = await params;

  try {
    const existing = await prisma.staffUser.findUnique({ where: { id } });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Staff user not found" }, { status: 404 });
    }

    // Soft delete
    await prisma.staffUser.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error(`[/api/staff/rbac/users/${id} DELETE]`, error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to delete staff user" },
      { status: 500 }
    );
  }
}
