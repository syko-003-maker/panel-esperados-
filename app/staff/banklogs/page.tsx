import { redirect } from "next/navigation";
import { requireChefOrEtatMajor } from "@/lib/guards";
import BanklogsClient from "./banklogs-client";

export const dynamic = "force-dynamic";

export default async function StaffBankLogsPage() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return <BanklogsClient />;
}
