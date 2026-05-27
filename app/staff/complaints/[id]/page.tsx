import { redirect } from "next/navigation";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { isCurrentSessionFullWriter } from "@/lib/rbac";
import ComplaintDetailClient from "./complaint-detail-client";

export default async function StaffComplaintDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  // Encadrant : lecture seule — masque les boutons "Trancher" côté UI.
  const canWrite = await isCurrentSessionFullWriter();

  return (
    <div style={{ padding: 24 }}>
      <ComplaintDetailClient ticketId={id} canWrite={canWrite} />
    </div>
  );
}
