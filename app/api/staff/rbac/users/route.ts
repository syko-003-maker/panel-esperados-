import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

/**
 * GET /api/staff/rbac/users
 * List all staff users
 */
export async function GET(req: NextRequest) {
  const guard = await requirePermission("ADMIN_FULL");
  if (guard instanceof Response) return guard;

  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const activeOnly = req.nextUrl.searchParams.get("activeOnly") !== "false";

  try {
    const staffUsers = await prisma.staffUser.findMany({
      where: {
        familyId,
        ...(activeOnly ? { isActive: true } : {}),
      },
      include: {
        role: {
          select: { id: true, code: true, name: true, priority: true, color: true },
        },
      },
      orderBy: [{ role: { priority: "desc" } }, { createdAt: "asc" }],
    });

    // Get member info for display names
    const discordIds = staffUsers.map((su) => su.discordId);
    const members = await prisma.member.findMany({
      where: { familyId, discordId: { in: discordIds } },
      select: { discordId: true, rpName: true },
    });
    const memberMap = new Map(members.map((m) => [m.discordId, m.rpName]));

    const users = staffUsers.map((su) => ({
      id: su.id,
      discordId: su.discordId,
      userId: su.userId,
      rpName: memberMap.get(su.discordId) ?? null,
      role: su.role,
      isActive: su.isActive,
      notes: su.notes,
      createdAt: su.createdAt,
      updatedAt: su.updatedAt,
    }));

    return NextResponse.json({ ok: true, users });
  } catch (error: any) {
    console.error("[/api/staff/rbac/users GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch staff users" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/staff/rbac/users
 * Add a staff user
 */
export async function POST(req: NextRequest) {
  const guard = await requirePermission("ADMIN_FULL");
  if (guard instanceof Response) return guard;

  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const body = await req.json();

  const { discordId, roleId, roleCode, notes } = body;

  if (!discordId) {
    return NextResponse.json({ ok: false, error: "discordId required" }, { status: 400 });
  }

  if (!roleId && !roleCode) {
    return NextResponse.json(
      { ok: false, error: "roleId or roleCode required" },
      { status: 400 }
    );
  }

  try {
    // Find role
    let role;
    if (roleId) {
      role = await prisma.staffRole.findUnique({ where: { id: roleId } });
    } else if (roleCode) {
      role = await prisma.staffRole.findUnique({
        where: { familyId_code: { familyId, code: roleCode } },
      });
    }

    if (!role) {
      return NextResponse.json({ ok: false, error: "Role not found" }, { status: 404 });
    }

    // Check if staff user already exists
    const existing = await prisma.staffUser.findUnique({
      where: { familyId_discordId: { familyId, discordId } },
    });

    if (existing) {
      // Update existing
      const updated = await prisma.staffUser.update({
        where: { id: existing.id },
        data: { roleId: role.id, isActive: true, notes: notes ?? existing.notes },
        include: { role: true },
      });
      return NextResponse.json({ ok: true, user: updated, action: "updated" });
    }

    // Create new
    const staffUser = await prisma.staffUser.create({
      data: {
        familyId,
        discordId,
        roleId: role.id,
        notes: notes ?? null,
      },
      include: { role: true },
    });

    return NextResponse.json({ ok: true, user: staffUser, action: "created" });
  } catch (error: any) {
    console.error("[/api/staff/rbac/users POST]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to create staff user" },
      { status: 500 }
    );
  }
}
