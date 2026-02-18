import { requireChefOrEtatMajor } from "@/lib/guards";
import { MetricsClient } from "./metrics-client";
import { redirect } from "next/navigation";

export default async function MetricsPage() {
  // ✅ PATCH: Unified staff protection (session + isStaff + member linked)
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Métriques & Observabilité</h1>
      <MetricsClient />
    </div>
  );
}
