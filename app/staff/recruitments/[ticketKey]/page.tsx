import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRecruiterOrAbove } from "@/lib/guards";
import RecruitmentDetailClient from "../../recruitment/[id]/recruitment-detail-client";

export default async function RecruitmentDetailPage({
  params,
}: {
  params: Promise<{ ticketKey: string }>;
}) {
  const { ticketKey } = await params;

  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  const recruitment = await prisma.recruitment.findUnique({
    where: { ticketKey },
  });

  if (!recruitment) {
    notFound();
  }

  return (
    <div className="px-6 py-6">
      <RecruitmentDetailClient
        ticketId={recruitment.id}
        backHref="/staff/recruitments"
        backLabel="← Retour à la gestion des recrutements"
      />
    </div>
  );
}
