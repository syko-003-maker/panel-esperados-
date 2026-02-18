import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePermission } from "@/lib/rbac";

/**
 * GET /api/staff/rbac/permissions
 * List all available permissions
 */
export async function GET() {
  const guard = await requirePermission("ADMIN_FULL");
  if (guard instanceof Response) return guard;

  try {
    const permissions = await prisma.staffPermission.findMany({
      orderBy: [{ category: "asc" }, { code: "asc" }],
    });

    // Group by category
    const grouped = permissions.reduce(
      (acc, perm) => {
        const category = perm.category ?? "other";
        if (!acc[category]) acc[category] = [];
        acc[category].push(perm);
        return acc;
      },
      {} as Record<string, typeof permissions>
    );

    return NextResponse.json({
      ok: true,
      permissions,
      grouped,
      categories: Object.keys(grouped).sort(),
    });
  } catch (error: any) {
    console.error("[/api/staff/rbac/permissions GET]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Failed to fetch permissions" },
      { status: 500 }
    );
  }
}
