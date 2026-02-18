import { redirect, notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireRecruiterOrAbove } from "@/lib/guards";
import { RecruitmentDetailClient } from "./recruitment-detail-client";

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

  const data = {
    id: recruitment.id,
    ticketKey: recruitment.ticketKey!,
    status: (recruitment.closedAt ? "FINI" : "OPEN") as "OPEN" | "FINI",
    dbStatus: recruitment.status,
    authorDiscordId: recruitment.discordId,
    authorTag: recruitment.authorTag,
    steamId: recruitment.steamId,
    rpName: recruitment.rpName,
    motivation: recruitment.motivation,
    availabilities: recruitment.availabilities,
    payload: recruitment.payload as Record<string, unknown> | null,
    threadId: recruitment.discordThreadId,
    createdAt: recruitment.createdAt.toISOString(),
    updatedAt: recruitment.updatedAt.toISOString(),
    closedAt: recruitment.closedAt?.toISOString() ?? null,
    closedByDiscordId: recruitment.closedByDiscordId,
    closeReason: recruitment.closeReason,
  };

  return <RecruitmentDetailClient recruitment={data} />;
}
