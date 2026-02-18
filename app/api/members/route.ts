import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged } from "@/lib/guards";
import { DEFAULT_FAMILY_ID } from "@/lib/family";

export async function GET(req: NextRequest) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const searchParams = req.nextUrl.searchParams;
  const familyId = searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;
  const grade = searchParams.get("grade");
  const activeOnly = searchParams.get("activeOnly") !== "false";
  const limit = parseInt(searchParams.get("limit") ?? "200", 10);
  const offset = parseInt(searchParams.get("offset") ?? "0", 10);

  try {
    const where: Record<string, unknown> = { familyId };
    
    if (activeOnly) {
      where.isActive = true;
    }
    
    if (grade) {
      where.grade = grade.toUpperCase();
    }

    const [members, total] = await Promise.all([
      prisma.member.findMany({
        where,
        orderBy: [
          { gradeLevel: "desc" },
          { rpName: "asc" },
        ],
        take: limit,
        skip: offset,
        select: {
          id: true,
          discordId: true,
          steamId: true,
          rpName: true,
          age: true,
          grade: true,
          gradeLevel: true,
          roleDiscordId: true,
          isActive: true,
          joinedAt: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      prisma.member.count({ where }),
    ]);

    return NextResponse.json({
      ok: true,
      members,
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error("[GET /api/members] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  try {
    const body = await req.json();
    const { 
      discordId, 
      steamId, 
      rpName, 
      age, 
      grade, 
      gradeLevel,
      familyId = DEFAULT_FAMILY_ID 
    } = body;

    if (!discordId) {
      return NextResponse.json(
        { ok: false, error: "discordId is required" },
        { status: 400 }
      );
    }

    // Ensure family exists
    await prisma.family.upsert({
      where: { slug: familyId },
      create: { slug: familyId, name: familyId },
      update: {},
    });

    const member = await prisma.member.upsert({
      where: { 
        familyId_discordId: { familyId, discordId } 
      },
      create: {
        familyId,
        discordId,
        steamId: steamId ?? null,
        rpName: rpName ?? null,
        age: age ?? null,
        grade: grade ?? null,
        gradeLevel: gradeLevel ?? 0,
        isActive: false, // ✅ Only LYG sync sets isActive=true
        joinedAt: new Date(),
      },
      update: {
        steamId: steamId ?? undefined,
        rpName: rpName ?? undefined,
        age: age ?? undefined,
        grade: grade ?? undefined,
        gradeLevel: gradeLevel ?? undefined,
      },
    });

    return NextResponse.json({ ok: true, member });
  } catch (err) {
    console.error("[POST /api/members] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
