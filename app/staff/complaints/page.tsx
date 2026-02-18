import { requireChefOrEtatMajor } from "@/lib/guards";
import { redirect } from "next/navigation";
import ComplaintsClient from "./complaints-client";

export default async function StaffComplaintsPage() {
  // ✅ PATCH: Unified staff protection (session + isStaff + member linked)
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return <ComplaintsClient />;
}
