import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

/**
 * GET /api/staff/rbac/roles
 * List all staff roles
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission("ADMIN_FULL");
  if (guard instanceof Response) return guard;

  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

  try {
    const roles = await prisma.staffRole.findMany({
      where: { familyId },
      orderBy: { priority: "desc" },
      include: {
        permissions: {
          include: { permission: true },
        },
        _count: { select: { staffUsers: { where: { isActive: true } } } },
      },
    });

    const formattedRoles = roles.map((role) => ({
      id: role.id,
      code: role.code,
      name: role.name,
      description: role.description,
      priority: role.priority,
      discordRoleId: role.discordRoleId,
      color: role.color,
      isActive: role.isActive,
      staffCount: role._count.staffUsers,
      permissions: role.permissions.map((rp) => rp.permission.code),
      createdAt: role.createdAt,
    }));

    return NextResponse.json({ ok: true, roles: formattedRoles });
  } catch (error: any) {
    console.error("[/api/staff/rbac/roles GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch roles" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/staff/rbac/roles
 * Create a new staff role
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("ADMIN_FULL");
  if (guard instanceof Response) return guard;

  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const body = await req.json();

  const { code, name, description, priority, discordRoleId, color, permissions } = body;

  if (!code || !name) {
    return NextResponse.json(
      { ok: false, error: "code and name are required" },
      { status: 400 }
    );
  }

  try {
    // Check if role already exists
    const existing = await prisma.staffRole.findUnique({
      where: { familyId_code: { familyId, code } },
    });

    if (existing) {
      return NextResponse.json(
        { ok: false, error: "Role with this code already exists" },
        { status: 409 }
      );
    }

    // Create role
    const role = await prisma.staffRole.create({
      data: {
        familyId,
        code,
        name,
        description: description ?? null,
        priority: priority ?? 0,
        discordRoleId: discordRoleId ?? null,
        color: color ?? null,
      },
    });

    // Assign permissions if provided
    if (Array.isArray(permissions) && permissions.length > 0) {
      const permissionRecords = await prisma.staffPermission.findMany({
        where: { code: { in: permissions } },
      });

      for (const perm of permissionRecords) {
        await prisma.staffRolePermission.create({
          data: { roleId: role.id, permissionId: perm.id },
        });
      }
    }

    return NextResponse.json({ ok: true, role });
  } catch (error: any) {
    console.error("[/api/staff/rbac/roles POST]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to create role" },
      { status: 500 }
    );
  }
}
