import { redirect } from "next/navigation";
import { requireChefOrEtatMajor } from "@/lib/guards";
import MembersListClient from "./members-list-client";
import { PageShell } from "@/components/staff/ui/PageShell";
import { Users } from "lucide-react";

export default async function MembersPage() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <PageShell
      title="Membres"
      description="Vue staff des membres actifs et de leur playtime sur 7 jours."
      icon={Users}
    >
      <MembersListClient />
    </PageShell>
  );
}
