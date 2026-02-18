import { requireChefOrEtatMajor } from "@/lib/guards";
import SanctionsClient from "./sanctions-client";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/staff/ui";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { Plus } from "lucide-react";

export default async function StaffSanctionsPage() {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <PageShell
      title="Sanctions"
      description="Gestion des sanctions membres"
      actions={
        <Button asChild>
          <Link href="/staff/sanctions/new">
            <Plus className="h-4 w-4 mr-2" />
            Nouvelle sanction
          </Link>
        </Button>
      }
    >
      <SanctionsClient />
    </PageShell>
  );
}
