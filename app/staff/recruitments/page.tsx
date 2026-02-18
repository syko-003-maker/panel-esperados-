import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { DEFAULT_FAMILY_ID, resolveFamilyId } from "@/lib/family";
import { requireRecruiterOrAbove } from "@/lib/guards";
import { RecruitmentsListClient } from "./recruitments-list-client";

export default async function RecruitmentsPage() {
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) {
    const location = guard.headers.get("Location") ?? "/staff/forbidden";
    redirect(location);
  }

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);

  const recruitments = await prisma.recruitment.findMany({
    where: {
      familyId: familyDbId,
      ticketKey: { not: null },
    },
    orderBy: [
      { closedAt: "asc" }, // OPEN first (null closedAt)
      { createdAt: "desc" },
    ],
    take: 200,
  });

  const data = recruitments.map((r) => ({
    id: r.id,
    ticketKey: r.ticketKey!,
    status: (r.closedAt ? "FINI" : "OPEN") as "OPEN" | "FINI",
    authorDiscordId: r.discordId,
    authorTag: r.authorTag,
    steamId: r.steamId,
    rpName: r.rpName,
    threadId: r.discordThreadId,
    createdAt: r.createdAt.toISOString(),
    closedAt: r.closedAt?.toISOString() ?? null,
  }));

  return <RecruitmentsListClient recruitments={data} />;
}
