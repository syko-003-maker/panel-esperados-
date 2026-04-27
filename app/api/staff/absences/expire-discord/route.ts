import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { getOrCreateDiscordConfig } from "@/lib/discord/discord";
import { resolveFamilyId } from "@/lib/family";

// Appelé par le cron pour supprimer les messages Discord des absences expirées
export async function POST(req: Request) {
  const secret = req.headers.get("x-cron-secret");
  if (secret !== process.env.INGEST_SECRET) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  const now = new Date();
  const familyId = await resolveFamilyId("esperados");
  const config = await getOrCreateDiscordConfig("esperados");

  if (!config.absencesChannelId) {
    return NextResponse.json({ ok: true, deleted: 0, reason: "no channel configured" });
  }

  // Trouver les absences expirées avec un messageId Discord non encore supprimé
  const expired = await prisma.absence.findMany({
    where: {
      familyId,
      endAt: { lt: now },
      discordMessageId: { not: null },
    },
    select: { id: true, discordMessageId: true },
  });

  if (expired.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0 });
  }

  // Créer un job DELETE_MESSAGE pour chaque message à supprimer
  await prisma.discordOutbox.createMany({
    data: expired.map((a) => ({
      familyId,
      type: "DELETE_MESSAGE" as const,
      status: "PENDING" as const,
      channelId: config.absencesChannelId!,
      content: "",
      entity: "Absence",
      entityId: a.id,
      meta: { messageId: a.discordMessageId },
    })),
    skipDuplicates: true,
  });

  // Effacer le discordMessageId pour ne pas re-programmer la suppression
  await prisma.absence.updateMany({
    where: { id: { in: expired.map((a) => a.id) } },
    data: { discordMessageId: null },
  });

  return NextResponse.json({ ok: true, deleted: expired.length });
}
