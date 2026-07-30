import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireRecruiterOrAbove } from "@/lib/guards";

export const dynamic = "force-dynamic";

/**
 * Conversation archivée d'un ticket de recrutement.
 *
 * Le fil Discord est verrouillé puis archivé à la décision, et peut être
 * supprimé : la copie en base est parfois la seule trace de ce qui a été dit.
 *
 * Réservé au staff recruteur : ces échanges contiennent la discussion interne.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const guard = await requireRecruiterOrAbove();
  if (guard instanceof Response) return guard;

  const { id } = await params;

  const messages = await prisma.recruitmentMessage.findMany({
    where: { recruitmentId: id },
    orderBy: { createdAtDiscord: "asc" },
    select: {
      id: true,
      authorDiscordId: true,
      authorNameSnapshot: true,
      authorIsBot: true,
      content: true,
      embedsText: true,
      attachmentsJson: true,
      createdAtDiscord: true,
      editedAtDiscord: true,
    },
  });

  return NextResponse.json({
    ok: true,
    count: messages.length,
    messages: messages.map((m) => ({
      ...m,
      createdAtDiscord: m.createdAtDiscord.toISOString(),
      editedAtDiscord: m.editedAtDiscord?.toISOString() ?? null,
    })),
  });
}
