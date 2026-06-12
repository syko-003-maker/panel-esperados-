import { requireStaffAccess } from "@/lib/rbac";
import { redirect } from "next/navigation";
import ReglementAssistant from "@/components/reglement/reglement-assistant";

export default async function StaffReglementPage() {
  // Accessible à tout le staff — même moteur que la commande Discord /reglement.
  const guard = await requireStaffAccess();
  if (guard instanceof Response) {
    redirect("/staff/forbidden");
  }

  return <ReglementAssistant />;
}
