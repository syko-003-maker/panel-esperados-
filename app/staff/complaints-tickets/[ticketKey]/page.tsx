import { redirect, notFound } from "next/navigation";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { ComplaintDetailClient } from "./complaint-detail-client";

export default async function ComplaintDetailPage({
  params,
}: {
  params: Promise<{ ticketKey: string }>;
}) {
  const { ticketKey } = await params;

  const session = await getSession();
  if (!session?.user) {
    redirect("/api/auth/signin");
  }

  const user = await prisma.user.findFirst({
    where: { email: session.user.email },
    select: { isStaff: true, isChef: true },
  });

  if (!user?.isStaff && !user?.isChef) {
    redirect("/");
  }

  const complaint = await prisma.complaint.findUnique({
    where: { ticketKey },
  });

  if (!complaint) {
    notFound();
  }

  const data = {
    id: complaint.id,
    ticketKey: complaint.ticketKey!,
    status: complaint.status,
    authorDiscordId: complaint.authorDiscordId,
    authorTag: complaint.authorTag,
    targetName: complaint.targetName,
    title: complaint.title,
    description: complaint.description,
    summary: complaint.summary,
    payload: complaint.payload as Record<string, unknown> | null,
    threadId: complaint.discordThreadId,
    createdAt: complaint.createdAt.toISOString(),
    updatedAt: complaint.updatedAt.toISOString(),
    closedAt: complaint.closedAt?.toISOString() ?? null,
    closedByDiscordId: complaint.closedByDiscordId,
    closeReason: complaint.closeReason,
  };

  return <ComplaintDetailClient complaint={data} />;
}
