import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

/**
 * GET /api/staff/rbac/roles/[id]
 * Get a single role with details
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission("ADMIN_FULL");
  if (guard instanceof Response) return guard;

  const { id } = await params;

  try {
    const role = await prisma.staffRole.findUnique({
      where: { id },
      include: {
        permissions: { include: { permission: true } },
        staffUsers: {
          where: { isActive: true },
          select: { id: true, discordId: true, userId: true },
        },
      },
    });

    if (!role) {
      return NextResponse.json({ ok: false, error: "Role not found" }, { status: 404 });
    }

    return NextResponse.json({
      ok: true,
      role: {
        ...role,
        permissions: role.permissions.map((rp) => rp.permission),
      },
    });
  } catch (error: any) {
    console.error(`[/api/staff/rbac/roles/${id} GET]`, error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch role" },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/staff/rbac/roles/[id]
 * Update a role
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
    const existing = await prisma.staffRole.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ ok: false, error: "Role not found" }, { status: 404 });
    }

    // Prevent modifying ADMIN role code
    if (existing.code === "ADMIN" && body.code && body.code !== "ADMIN") {
      return NextResponse.json(
        { ok: false, error: "Cannot change ADMIN role code" },
        { status: 400 }
      );
    }

    const updateData: Record<string, unknown> = {};
    if (body.name !== undefined) updateData.name = body.name;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.priority !== undefined) updateData.priority = body.priority;
    if (body.discordRoleId !== undefined) updateData.discordRoleId = body.discordRoleId || null;
    if (body.color !== undefined) updateData.color = body.color || null;
    if (body.isActive !== undefined) updateData.isActive = body.isActive;

    const role = await prisma.staffRole.update({
      where: { id },
      data: updateData,
    });

    // Update permissions if provided
    if (Array.isArray(body.permissions)) {
      // Remove existing permissions
      await prisma.staffRolePermission.deleteMany({
        where: { roleId: id },
      });

      // Add new permissions
      const permissionRecords = await prisma.staffPermission.findMany({
        where: { code: { in: body.permissions } },
      });

      for (const perm of permissionRecords) {
        await prisma.staffRolePermission.create({
          data: { roleId: id, permissionId: perm.id },
        });
      }
    }

    return NextResponse.json({ ok: true, role });
  } catch (error: any) {
    console.error(`[/api/staff/rbac/roles/${id} PATCH]`, error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to update role" },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/staff/rbac/roles/[id]
 * Delete a role (soft delete by setting isActive = false)
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission("ADMIN_FULL");
  if (guard instanceof Response) return guard;

  const { id } = await params;

  try {
    const existing = await prisma.staffRole.findUnique({
      where: { id },
      include: { _count: { select: { staffUsers: { where: { isActive: true } } } } },
    });

    if (!existing) {
      return NextResponse.json({ ok: false, error: "Role not found" }, { status: 404 });
    }

    // Prevent deleting ADMIN role
    if (existing.code === "ADMIN") {
      return NextResponse.json(
        { ok: false, error: "Cannot delete ADMIN role" },
        { status: 400 }
      );
    }

    // Check for active staff users
    if (existing._count.staffUsers > 0) {
      return NextResponse.json(
        { ok: false, error: `Role has ${existing._count.staffUsers} active staff users` },
        { status: 400 }
      );
    }

    // Soft delete
    await prisma.staffRole.update({
      where: { id },
      data: { isActive: false },
    });

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error(`[/api/staff/rbac/roles/${id} DELETE]`, error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to delete role" },
      { status: 500 }
    );
  }
}
