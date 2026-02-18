import { redirect } from "next/navigation";
import { requireChefOrEtatMajor } from "@/lib/guards";
import StaffLogsClient from "./StaffLogsClient";

export default async function StaffLogsPage() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return <StaffLogsClient />;
}
