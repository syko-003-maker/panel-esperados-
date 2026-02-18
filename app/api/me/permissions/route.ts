import { NextResponse } from "next/server";
import { getSession } from "@/auth";
import { getStaffUser } from "@/lib/rbac";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

/**
 * GET /api/me/permissions
 * Get current user's permissions
 */
export async function GET(req: Request) {
  const session = await getSession();

  if (!session?.user) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const familyId = searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

  const staffUser = await getStaffUser(session, familyId);

  // Legacy check for isStaff
  const user = session.user as any;
  const isLegacyStaff = user?.isStaff && !staffUser;

  return NextResponse.json({
    ok: true,
    isStaff: !!staffUser || isLegacyStaff,
    isChef: user?.isChef ?? false,
    role: staffUser
      ? {
          code: staffUser.roleCode,
          name: staffUser.roleName,
          priority: staffUser.rolePriority,
        }
      : isLegacyStaff
        ? { code: "LEGACY_STAFF", name: "Legacy Staff", priority: 50 }
        : null,
    permissions: staffUser?.permissions ?? (isLegacyStaff ? [
      "TICKETS_VIEW", "TICKETS_CLOSE",
      "SANCTIONS_VIEW",
      "MEETINGS_VIEW",
      "MEMBERS_VIEW",
      "ACTIVITY_VIEW",
      "ABSENCES_VIEW",
    ] : []),
  });
}
