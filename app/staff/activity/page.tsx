import { requireChefOrEtatMajor } from "@/lib/guards";
import ActivityClient from "./activity-client";
import { redirect } from "next/navigation";

export default async function StaffActivityPage() {
  // ✅ PATCH: Unified staff protection (session + isStaff + member linked)
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <div style={{ padding: 24 }}>
      <h1>Activite</h1>
      <ActivityClient />
    </div>
  );
}
