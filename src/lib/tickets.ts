import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

export async function getOpenRecruitmentsCount(familyId = DEFAULT_FAMILY_ID): Promise<number> {
  return prisma.recruitment.count({
    where: {
      familyId,
      ticketKey: { not: null },
      closedAt: null,
    },
  });
}

export async function getOpenComplaintsCount(familyId = DEFAULT_FAMILY_ID): Promise<number> {
  return prisma.complaint.count({
    where: {
      familyId,
      ticketKey: { not: null },
      status: "OPEN",
      closedAt: null,
    },
  });
}

type TicketItem = {
  id: string;
  ticketKey: string;
  type: "recruitment" | "complaint";
  status: string;
  authorDiscordId: string | null;
  authorTag: string | null;
  threadId: string | null;
  createdAt: Date;
  closedAt: Date | null;
};

export async function getLatestTickets(familyId = DEFAULT_FAMILY_ID, limit = 10): Promise<TicketItem[]> {
  const [recruitments, complaints] = await Promise.all([
    prisma.recruitment.findMany({
      where: {
        familyId,
        ticketKey: { not: null },
      },
      orderBy: [{ closedAt: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        ticketKey: true,
        discordId: true,
        authorTag: true,
        discordThreadId: true,
        createdAt: true,
        closedAt: true,
      },
    }),
    prisma.complaint.findMany({
      where: {
        familyId,
        ticketKey: { not: null },
      },
      orderBy: [{ closedAt: "asc" }, { createdAt: "desc" }],
      take: limit,
      select: {
        id: true,
        ticketKey: true,
        status: true,
        authorDiscordId: true,
        authorTag: true,
        discordThreadId: true,
        createdAt: true,
        closedAt: true,
      },
    }),
  ]);

  const items: TicketItem[] = [
    ...recruitments.map((r) => ({
      id: r.id,
      ticketKey: r.ticketKey!,
      type: "recruitment" as const,
      status: r.closedAt ? "FINI" : "OPEN",
      authorDiscordId: r.discordId,
      authorTag: r.authorTag,
      threadId: r.discordThreadId,
      createdAt: r.createdAt,
      closedAt: r.closedAt,
    })),
    ...complaints.map((c) => ({
      id: c.id,
      ticketKey: c.ticketKey!,
      type: "complaint" as const,
      status: c.status,
      authorDiscordId: c.authorDiscordId,
      authorTag: c.authorTag,
      threadId: c.discordThreadId,
      createdAt: c.createdAt,
      closedAt: c.closedAt,
    })),
  ];

  // Sort: OPEN first (null closedAt), then by createdAt desc
  items.sort((a, b) => {
    // OPEN first
    if (!a.closedAt && b.closedAt) return -1;
    if (a.closedAt && !b.closedAt) return 1;
    // Then by createdAt desc
    return b.createdAt.getTime() - a.createdAt.getTime();
  });

  return items.slice(0, limit);
}
