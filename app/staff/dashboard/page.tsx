import { redirect } from "next/navigation";
import { requireChefOrEtatMajor } from "@/lib/guards";
import StaffDashboardClient from "./dashboard-client";

export default async function StaffDashboardPage() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return <StaffDashboardClient />;
}
