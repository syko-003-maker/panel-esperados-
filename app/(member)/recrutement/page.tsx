import { requireRecruiterOrAbove } from "@/lib/guards";
import { redirect } from "next/navigation";
import RecruitmentClient from "@/app/staff/recruitment/recruitment-client";

export default async function MemberRecruitmentPage() {
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) {
    // Non-recruiter accessing directly → retour espace membre
    redirect("/dashboard");
  }

  return <RecruitmentClient />;
}
