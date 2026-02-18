import { redirect } from "next/navigation";
import { requireRecruiterOrAbove } from "@/lib/guards";
import RecruitmentDetailClient from "./recruitment-detail-client";

export default async function StaffRecruitmentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // ✅ PATCH: Unified staff protection (session + isStaff + member linked)
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <div style={{ padding: 24 }}>
      <RecruitmentDetailClient ticketId={id} />
    </div>
  );
}
