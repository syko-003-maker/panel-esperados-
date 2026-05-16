import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefOrEtatMajor, requirePrivileged } from "@/lib/guards";
import { getSession } from "@/auth";
import type { MeetingDecisionAction } from "@prisma/client";
import { isMeetingLocked } from "@/lib/meetings";
import { isProtectedPromotionTargetGrade } from "@/lib/staff/meetings/finalize/target-grade";

type DecisionInput = {
  memberDiscordId: string;
  oldGrade?: string | null;
  newGrade?: string | null;
  action: MeetingDecisionAction;
  reason?: string | null;
};

/**
 * GET /api/staff/meetings/[id]/decisions
 * Get all decisions for a meeting
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const { id: meetingId } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, status: true },
  });

  if (!meeting) {
    return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
  }

  const decisions = await prisma.meetingDecision.findMany({
    where: { meetingId },
    orderBy: { createdAt: "asc" },
  });

  // Get member info for each decision
  const memberDiscordIds = decisions.map((d) => d.memberDiscordId);
  const members = await prisma.member.findMany({
    where: { discordId: { in: memberDiscordIds } },
    select: { discordId: true, rpName: true, grade: true, gradeLevel: true },
  });

  const memberMap = new Map(members.map((m) => [m.discordId, m]));

  const enrichedDecisions = decisions.map((d) => ({
    ...d,
    member: memberMap.get(d.memberDiscordId) ?? null,
  }));

  return NextResponse.json({
    ok: true,
    meetingStatus: meeting.status,
    decisions: enrichedDecisions,
  });
}

/**
 * POST /api/staff/meetings/[id]/decisions
 * Upsert decisions (bulk)
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const userId = session?.user?.id ?? (session as any)?.userId ?? null;

  const { id: meetingId } = await params;

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { id: true, status: true },
  });

  if (!meeting) {
    return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
  }

  if (isMeetingLocked(meeting.status)) {
    return NextResponse.json(
      { ok: false, error: "Meeting is locked, decisions cannot be modified" },
      { status: 409 }
    );
  }

  const body = await req.json();
  const decisions: DecisionInput[] = body.decisions;

  if (!Array.isArray(decisions)) {
    return NextResponse.json({ ok: false, error: "decisions must be an array" }, { status: 400 });
  }

  const results = {
    created: 0,
    updated: 0,
    errors: [] as Array<{ memberDiscordId: string; error: string }>,
  };

  for (const decision of decisions) {
    if (!decision.memberDiscordId) {
      results.errors.push({ memberDiscordId: "unknown", error: "Missing memberDiscordId" });
      continue;
    }

    const validActions: MeetingDecisionAction[] = ["DEMOTE", "KEEP", "EXCLUDE"];
    if (!validActions.includes(decision.action)) {
      results.errors.push({
        memberDiscordId: decision.memberDiscordId,
        error: `Invalid action: ${decision.action}`,
      });
      continue;
    }

    // Sécurité : interdire les promotions vers Chef famille / Général /
    // Sous-Chef famille / Consejero via une réunion. Cf. commentaire dans
    // src/lib/staff/meetings/finalize/target-grade.ts.
    if (isProtectedPromotionTargetGrade(decision.newGrade)) {
      results.errors.push({
        memberDiscordId: decision.memberDiscordId,
        error: "FORBIDDEN_TARGET_GRADE — réservé au Chef famille (hors réunion)",
      });
      continue;
    }

    try {
      const existing = await prisma.meetingDecision.findUnique({
        where: {
          meetingId_memberDiscordId: {
            meetingId,
            memberDiscordId: decision.memberDiscordId,
          },
        },
      });

      if (existing) {
        await prisma.meetingDecision.update({
          where: { id: existing.id },
          data: {
            oldGrade: decision.oldGrade ?? existing.oldGrade,
            newGrade: decision.newGrade ?? existing.newGrade,
            action: decision.action,
            reason: decision.reason ?? existing.reason,
            decidedByUserId: userId,
          },
        });
        results.updated++;
      } else {
        await prisma.meetingDecision.create({
          data: {
            meetingId,
            memberDiscordId: decision.memberDiscordId,
            oldGrade: decision.oldGrade,
            newGrade: decision.newGrade,
            action: decision.action,
            reason: decision.reason,
            decidedByUserId: userId,
          },
        });
        results.created++;
      }
    } catch (err: any) {
      results.errors.push({
        memberDiscordId: decision.memberDiscordId,
        error: err.message?.slice(0, 100) ?? "Unknown error",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    created: results.created,
    updated: results.updated,
    errors: results.errors.length > 0 ? results.errors : undefined,
  });
}

/**
 * DELETE /api/staff/meetings/[id]/decisions
 * Delete a specific decision
 */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const { id: meetingId } = await params;
  const { memberDiscordId } = await req.json();

  if (!memberDiscordId) {
    return NextResponse.json({ ok: false, error: "memberDiscordId required" }, { status: 400 });
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    select: { status: true },
  });

  if (!meeting) {
    return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
  }

  if (isMeetingLocked(meeting.status)) {
    return NextResponse.json(
      { ok: false, error: "Meeting is locked" },
      { status: 409 }
    );
  }

  await prisma.meetingDecision.deleteMany({
    where: { meetingId, memberDiscordId },
  });

  return NextResponse.json({ ok: true });
}
