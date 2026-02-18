import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const items = await prisma.sanctionJustification.findMany({
    where: { sanctionId: id },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      authorDiscordId: true,
      message: true,
      status: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    ok: true,
    data: items.map((item) => ({
      id: item.id,
      authorDiscordId: item.authorDiscordId,
      message: item.message,
      status: item.status,
      createdAt: item.createdAt.toISOString(),
      updatedAt: item.updatedAt.toISOString(),
    })),
  });
}
