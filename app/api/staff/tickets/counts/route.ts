import { NextResponse } from "next/server";
import { requirePrivileged } from "@/lib/guards";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import {
  getOpenRecruitmentsCount,
  getOpenComplaintsCount,
  getLatestTickets,
} from "@/lib/tickets";

export async function GET() {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const familyId = DEFAULT_FAMILY_ID;

  const [openRecruitments, openComplaints, latestTickets] = await Promise.all([
    getOpenRecruitmentsCount(familyId),
    getOpenComplaintsCount(familyId),
    getLatestTickets(familyId, 10),
  ]);

  return NextResponse.json({
    ok: true,
    openRecruitments,
    openComplaints,
    totalOpen: openRecruitments + openComplaints,
    latestTickets: latestTickets.map((t) => ({
      ...t,
      createdAt: t.createdAt.toISOString(),
      closedAt: t.closedAt?.toISOString() ?? null,
    })),
  });
}
