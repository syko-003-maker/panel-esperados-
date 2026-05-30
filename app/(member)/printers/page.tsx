import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { redirect } from "next/navigation";
import PrinterCalculator from "@/components/printers/printer-calculator";

export default async function PrintersPage() {
  const session = await auth();
  if (!session) redirect("/login");

  const linkedMember = await getMemberScopeOrNull(session);
  if (!linkedMember) {
    redirect("/dashboard");
  }

  return <PrinterCalculator />;
}
