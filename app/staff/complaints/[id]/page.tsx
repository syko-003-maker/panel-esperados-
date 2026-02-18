import { redirect } from "next/navigation";
import { requireChefOrEtatMajor } from "@/lib/guards";
import ComplaintDetailClient from "./complaint-detail-client";

export default async function StaffComplaintDetailPage({ params }: { params: { id: string } }) {
  // ✅ PATCH: Unified staff protection (session + isStaff + member linked)
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <div style={{ padding: 24 }}>
      <ComplaintDetailClient ticketId={params.id} />
    </div>
  );
}
