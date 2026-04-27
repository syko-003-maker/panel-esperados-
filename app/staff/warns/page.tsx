import { requireChefOrEtatMajor } from "@/lib/guards";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/staff/ui";
import { TriangleAlert } from "lucide-react";
import WarnsClient from "./warns-client";

export default async function StaffWarnsPage() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <PageShell
      title="Warns in-game"
      description="Vue consolidée des sanctions in-game reçues par les membres du staff."
      icon={TriangleAlert}
    >
      <WarnsClient />
    </PageShell>
  );
}
