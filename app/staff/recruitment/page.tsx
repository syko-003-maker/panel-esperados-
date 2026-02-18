import { requireRecruiterOrAbove } from "@/lib/guards";
import RecruitmentClient from "./recruitment-client";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/staff/ui";
import { Users } from "lucide-react";

export default async function StaffRecruitmentPage() {
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  return (
    <PageShell
      title="Recrutement"
      description="Gérer les candidatures de recrutement"
      icon={Users}
    >
      <RecruitmentClient />
    </PageShell>
  );
}
