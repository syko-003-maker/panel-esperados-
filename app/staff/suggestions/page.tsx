import { requireRecruiterOrAbove } from "@/lib/guards";
import { redirect } from "next/navigation";
import { Lightbulb } from "lucide-react";
import { PageShell } from "@/components/staff/ui/PageShell";
import SuggestionsClient from "./suggestions-client";

export default async function StaffSuggestionsPage() {
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <PageShell
      title="Suggestions"
      description="Idées proposées par les membres (site + Discord), triées par votes. Change le statut et réponds."
      icon={Lightbulb}
    >
      <SuggestionsClient />
    </PageShell>
  );
}
