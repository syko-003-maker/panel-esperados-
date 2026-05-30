import { requireStaffAccess } from "@/lib/rbac";
import { redirect } from "next/navigation";
import PrinterCalculator from "@/components/printers/printer-calculator";

export default async function StaffPrintersPage() {
  // Accessible à tout le staff (Chef / EM / Encadrant / Recruteur).
  const guard = await requireStaffAccess();
  if (guard instanceof Response) {
    redirect("/staff/forbidden");
  }

  return <PrinterCalculator />;
}
