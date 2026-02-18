import { redirect } from "next/navigation";
import { getSession } from "@/auth";
import { prisma } from "@/lib/db";
import { ComplaintsListClient } from "./complaints-list-client";

const FAMILY_ID = process.env.FAMILY_ID ?? "esperados";

export default async function ComplaintsTicketsPage() {
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

  const complaints = await prisma.complaint.findMany({
    where: {
      familyId: FAMILY_ID,
      ticketKey: { not: null },
    },
    orderBy: [
      { closedAt: "asc" }, // OPEN first (null closedAt)
      { createdAt: "desc" },
    ],
    take: 200,
  });

  const data = complaints.map((c) => ({
    id: c.id,
    ticketKey: c.ticketKey!,
    status: c.status,
    authorDiscordId: c.authorDiscordId,
    authorTag: c.authorTag,
    target: c.targetName,
    reason: c.title,
    threadId: c.discordThreadId,
    createdAt: c.createdAt.toISOString(),
    closedAt: c.closedAt?.toISOString() ?? null,
  }));

  return <ComplaintsListClient complaints={data} />;
}
