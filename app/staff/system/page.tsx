import { requireChefOrEtatMajor } from "@/lib/guards";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/staff/ui";
import { Server } from "lucide-react";
import SystemClient from "./system-client";

export default async function StaffSystemPage() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <PageShell
      title="Système"
      description="Monitoring du VPS, des services et de l'API LYG."
      icon={Server}
    >
      <SystemClient />
    </PageShell>
  );
}
