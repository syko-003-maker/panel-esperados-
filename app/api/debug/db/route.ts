/**
 * /api/debug/db - Database Health Check
 * 
 * Returns Prisma counts for all critical tables to verify sync state.
 * Protected by requirePrivileged() - staff only.
 */

import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

export async function GET() {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const familyId = DEFAULT_FAMILY_ID;

  try {
    const [
      familyCount,
      memberCount,
      activeMemberCount,
      bankLogCount,
      linkRequestCount,
      pendingLinkCount,
      sanctionCount,
      absenceCount,
    ] = await Promise.all([
      prisma.family.count(),
      prisma.member.count({ where: { familyId } }),
      prisma.member.count({ where: { familyId, isActive: true } }),
      prisma.bankLog.count({ where: { familyId } }),
      prisma.linkRequest.count(),
      prisma.linkRequest.count({ where: { status: "PENDING" } }),
      prisma.sanction.count(),
      prisma.absence.count(),
    ]);

    const isEmpty = memberCount === 0 && bankLogCount === 0;

    return NextResponse.json({
      ok: true,
      familyId,
      counts: {
        families: familyCount,
        members: memberCount,
        activeMembers: activeMemberCount,
        bankLogs: bankLogCount,
        linkRequests: linkRequestCount,
        pendingLinks: pendingLinkCount,
        sanctions: sanctionCount,
        absences: absenceCount,
      },
      isEmpty,
      recommendation: isEmpty 
        ? "Database is empty. Run /api/staff/sync/all to bootstrap data from LYG."
        : "Database contains data. Sync is healthy.",
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      {
        ok: false,
        error: err.message ?? "Database query failed",
      },
      { status: 500 }
    );
  }
}
