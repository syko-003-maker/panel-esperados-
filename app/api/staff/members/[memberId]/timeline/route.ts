import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor } from "@/lib/guards";

export async function GET(
  req: Request,
  { params }: { params: Promise<{ memberId: string }> }
) {
  try {
    const guard = await requireChefOrEtatMajor();
    if (guard instanceof Response) return guard;

    const { memberId } = await params;
    if (!memberId) {
      return NextResponse.json({ ok: false, error: "MISSING_MEMBER_ID" }, { status: 400 });
    }

    // Verify member exists and get pivot IDs
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { 
        id: true, 
        discordId: true, 
        steamId: true, 
        rpName: true 
      },
    });

    if (!member) {
      return NextResponse.json({ ok: false, error: "MEMBER_NOT_FOUND" }, { status: 404 });
    }

    // Fetch all timeline data in parallel
    const [sanctions, complaints, recruitments] = await Promise.all([
      // Sanctions by memberId
      prisma.sanction.findMany({
        where: { memberId },
        select: {
          id: true,
          type: true,
          status: true,
          reason: true,
          createdAt: true,
          expiresAt: true,
        },
        orderBy: { createdAt: "desc" },
      }),

      // Complaints by targetId or targetName (no FK - fuzzy match)
      member.rpName
        ? prisma.complaint.findMany({
            where: {
              OR: [
                { targetId: memberId },
                { targetName: { contains: member.rpName, mode: "insensitive" } },
              ],
            },
            select: {
              id: true,
              title: true,
              status: true,
              createdAt: true,
              closedAt: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),

      // Recruitments by discordId
      member.discordId
        ? prisma.recruitment.findMany({
            where: { discordId: member.discordId },
            select: {
              id: true,
              rpName: true,
              status: true,
              createdAt: true,
              closedAt: true,
            },
            orderBy: { createdAt: "desc" },
          })
        : Promise.resolve([]),
    ]);

    // Normalize all to unified timeline format
    const items = [
      // Sanctions
      ...sanctions.map((s) => ({
        id: s.id,
        type: "SANCTION" as const,
        title: `Sanction: ${s.type}`,
        description: s.reason || "Aucune raison spécifiée",
        status: s.status,
        createdAt: s.createdAt.toISOString(),
        effectiveAt: s.expiresAt?.toISOString() ?? null,
      })),

      // Complaints
      ...complaints.map((c) => ({
        id: c.id,
        type: "COMPLAINT" as const,
        title: `Plainte: ${c.title}`,
        description: `Ticket #${c.id.slice(0, 8)}`,
        status: c.status,
        createdAt: c.createdAt.toISOString(),
        effectiveAt: c.closedAt?.toISOString() ?? null,
      })),

      // Recruitments
      ...recruitments.map((r) => ({
        id: r.id,
        type: "RECRUITMENT" as const,
        title: `Recrutement: ${r.rpName || "Candidat"}`,
        description: `Ticket #${r.id.slice(0, 8)}`,
        status: r.status,
        createdAt: r.createdAt.toISOString(),
        effectiveAt: r.closedAt?.toISOString() ?? null,
      })),
    ];

    // Sort by date DESC
    items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      ok: true,
      memberId,
      items,
    });
  } catch (error) {
    console.error("Timeline error:", error);
    return NextResponse.json(
      { ok: false, error: "INTERNAL_ERROR" },
      { status: 500 }
    );
  }
}
