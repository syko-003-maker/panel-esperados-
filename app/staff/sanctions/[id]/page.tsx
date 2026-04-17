import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";
import { getEntityAuditLogs } from "@/lib/audit";
import SanctionDetailClient from "./sanction-detail-client";

export default async function SanctionDetailPage({ params }: { params: { id: string } }) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  const sanction = await prisma.sanction.findUnique({
    where: { id: params.id },
    include: { member: { select: { rpName: true, discordId: true } } },
  });

  if (!sanction) {
    notFound();
  }

  const [audit, outbox] = await Promise.all([
    getEntityAuditLogs("Sanction", sanction.id, 50),
    sanction.outboxJobId
      ? prisma.discordOutbox.findUnique({
          where: { id: sanction.outboxJobId },
          select: { status: true },
        })
      : Promise.resolve(null),
  ]);

  return (
    <SanctionDetailClient
      sanction={{
        id: sanction.id,
        member: sanction.member,
        discordId: sanction.discordId,
        type: sanction.type,
        status: sanction.status,
        reason: sanction.reason,
        discordStatus: sanction.discordStatus,
        outboxStatus: outbox?.status ?? null,
        discordError: sanction.discordError,
        expiresAt: sanction.expiresAt?.toISOString() ?? null,
        clearedAt: sanction.clearedAt?.toISOString() ?? null,
        clearedStatus: sanction.clearedStatus ?? null,
        clearedError: sanction.clearedError ?? null,
        createdAt: sanction.createdAt.toISOString(),
      }}
      audit={audit.map((log) => ({
        id: log.id,
        action: log.action,
        createdAt: log.createdAt.toISOString(),
      }))}
    />
  );
}
