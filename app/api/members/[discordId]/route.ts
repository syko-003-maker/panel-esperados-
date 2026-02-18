import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged, requireChef } from "@/lib/guards";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { getGradeLevel, getRoleIdForGrade } from "@/lib/grades";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ discordId: string }> }
) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { discordId } = await params;
  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

  try {
    const member = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId, discordId } },
      include: {
        gradeHistory: {
          orderBy: { changedAt: "desc" },
          take: 20,
        },
        sanctions: {
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            type: true,
            reason: true,
            status: true,
            createdAt: true,
          },
        },
      },
    });

    if (!member) {
      return NextResponse.json(
        { ok: false, error: "Member not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ ok: true, member });
  } catch (err) {
    console.error("[GET /api/members/:discordId] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ discordId: string }> }
) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { discordId } = await params;
  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

  try {
    const body = await req.json();
    const { grade, rpName, steamId, age, isActive, changedBy, notes, discordId: bodyDiscordId } = body;

    // Get current member
    const current = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId, discordId } },
    });

    if (!current) {
      return NextResponse.json(
        { ok: false, error: "Member not found" },
        { status: 404 }
      );
    }

    // Build update data
    const updateData: Record<string, unknown> = {};

    // Validate and normalize discordId if provided
    if (bodyDiscordId !== undefined) {
      const trimmed = String(bodyDiscordId ?? "").trim();
      
      if (trimmed === "") {
        // Empty string -> null
        updateData.discordId = null;
      } else if (!/^\d{15,25}$/.test(trimmed)) {
        // Invalid snowflake format
        return NextResponse.json(
          { ok: false, error: "Invalid discordId format (must be 15-25 digits)" },
          { status: 400 }
        );
      } else {
        // Valid snowflake
        updateData.discordId = trimmed;
      }
    }
    
    if (rpName !== undefined) updateData.rpName = rpName;
    if (steamId !== undefined) updateData.steamId = steamId;
    if (age !== undefined) updateData.age = age;
    if (isActive !== undefined) updateData.isActive = isActive;

    // Handle grade change
    let gradeHistoryEntry = null;
    if (grade !== undefined && grade !== current.grade) {
      const newGradeLevel = getGradeLevel(grade);
      const newRoleId = getRoleIdForGrade(grade);
      
      updateData.grade = grade;
      updateData.gradeLevel = newGradeLevel;
      updateData.roleDiscordId = newRoleId;

      // Create grade history entry
      gradeHistoryEntry = {
        oldGrade: current.grade,
        oldGradeLevel: current.gradeLevel,
        newGrade: grade,
        newGradeLevel,
        changedBy: changedBy ?? null,
        source: "MANUAL" as const,
        notes: notes ?? null,
      };
    }

    // Update member using ID instead of discordId to avoid conflicts
    const member = await prisma.member.update({
      where: { id: current.id },
      data: updateData,
    });

    // Create grade history if grade changed
    if (gradeHistoryEntry) {
      await prisma.gradeHistory.create({
        data: {
          memberId: member.id,
          ...gradeHistoryEntry,
        },
      });
    }

    return NextResponse.json({ ok: true, member, gradeChanged: !!gradeHistoryEntry });
  } catch (err) {
    console.error("[PATCH /api/members/:discordId] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ discordId: string }> }
) {
  // Only chef can delete members
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const { discordId } = await params;
  const familyId = req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID;

  try {
    // Soft delete (set isActive = false)
    const member = await prisma.member.update({
      where: { familyId_discordId: { familyId, discordId } },
      data: { isActive: false },
    });

    return NextResponse.json({ ok: true, member });
  } catch (err) {
    console.error("[DELETE /api/members/:discordId] Error:", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
