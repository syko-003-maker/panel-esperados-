import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";

const DEFAULT_FAMILY_ID = "esperados";
const PAGE_SIZE = 20;

export async function GET(req: Request) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { searchParams } = new URL(req.url);
  const familyId = searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const discordId = searchParams.get("discordId");
  const pageRaw = Number(searchParams.get("page") ?? "1");
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1;

  const where: Record<string, unknown> = {
    familyId,
    action: "ACTIVITY_ACTION",
    entity: "Member",
  };
  if (discordId) {
    where.entityId = discordId;
  }

  const rows = await prisma.auditLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE + 1,
    skip: (page - 1) * PAGE_SIZE,
    select: {
      id: true,
      entityId: true,
      meta: true,
      createdAt: true,
      actorId: true,
      actorName: true,
    },
  });

  const hasMore = rows.length > PAGE_SIZE;
  const slice = rows.slice(0, PAGE_SIZE);

  const items = slice.map((row) => {
    const meta = (row.meta ?? {}) as Record<string, unknown>;
    const flagsRaw = meta.flagsAtThatTime;
    const flags = Array.isArray(flagsRaw)
      ? flagsRaw.filter((flag) => typeof flag === "string")
      : [];

    return {
      id: row.id,
      discordId: row.entityId,
      type: typeof meta.type === "string" ? meta.type : "NOTE",
      note: typeof meta.note === "string" ? meta.note : null,
      suggestedActionAtThatTime:
        typeof meta.suggestedActionAtThatTime === "string" ? meta.suggestedActionAtThatTime : null,
      flagsAtThatTime: flags,
      at: row.createdAt.toISOString(),
      actorId: row.actorId,
      actorName: row.actorName ?? row.actorId,
    };
  });

  return NextResponse.json({
    ok: true,
    familyId,
    page,
    hasMore,
    items,
  });
}
