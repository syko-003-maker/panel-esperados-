import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChef } from "@/lib/guards";
import { getSession } from "@/auth";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import { GRADE_TO_ROLE } from "@/lib/roles";
import { getGradeLevel } from "@/lib/import-validation";
import { recordPanelMetric } from "@/lib/metrics";
import { requireMeetingsEnabled } from "@/lib/feature-guard";

/**
 * POST /api/staff/meetings/[id]/finalize
 * Finalize meeting and apply all decisions
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Check feature flag
  const featureCheck = await requireMeetingsEnabled("finalize");
  if (!featureCheck.allowed) return featureCheck.response;

  // Only chef can finalize
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const userId = session?.user?.id ?? (session as any)?.userId ?? null;
  const userDiscordId = (session as any)?.discordId ?? (session?.user as any)?.discordId ?? null;

  const { id: meetingId } = await params;

  // Get meeting with decisions
  const meeting = await prisma.meeting.findUnique({
    where: { id: meetingId },
    include: {
      decisions: true,
    },
  });

  if (!meeting) {
    return NextResponse.json({ ok: false, error: "Meeting not found" }, { status: 404 });
  }

  // Check if already finalized (idempotent)
  if (meeting.status === "FINAL") {
    return NextResponse.json({
      ok: true,
      alreadyFinal: true,
      message: "Meeting was already finalized",
      finalizedAt: meeting.finalizedAt,
    });
  }

  // Validate all decisions have valid grades
  const validGrades = Object.keys(GRADE_TO_ROLE);
  const invalidDecisions = meeting.decisions.filter((d) => {
    if (d.action === "KEEP" || d.action === "EXCLUDE") return false;
    if (!d.newGrade) return true;
    return !validGrades.includes(d.newGrade.toUpperCase());
  });

  if (invalidDecisions.length > 0) {
    return NextResponse.json(
      {
        ok: false,
        error: "Some decisions have invalid grades",
        invalidDecisions: invalidDecisions.map((d) => ({
          memberDiscordId: d.memberDiscordId,
          newGrade: d.newGrade,
        })),
      },
      { status: 400 }
    );
  }

  // Apply decisions
  const results = {
    promoted: 0,
    demoted: 0,
    kept: 0,
    excluded: 0,
    errors: [] as Array<{ memberDiscordId: string; error: string }>,
  };

  for (const decision of meeting.decisions) {
    try {
      // Find member
      const member = await prisma.member.findFirst({
        where: {
          familyId: DEFAULT_FAMILY_ID,
          discordId: decision.memberDiscordId,
        },
      });

      if (!member) {
        results.errors.push({
          memberDiscordId: decision.memberDiscordId,
          error: "Member not found",
        });
        continue;
      }

      switch (decision.action) {
        case "PROMOTE":
        case "DEMOTE": {
          if (!decision.newGrade) {
            results.errors.push({
              memberDiscordId: decision.memberDiscordId,
              error: "No newGrade specified for grade change",
            });
            continue;
          }

          const newGrade = decision.newGrade.toUpperCase();
          const newGradeLevel = getGradeLevel(newGrade);
          const roleDiscordId = GRADE_TO_ROLE[newGrade] ?? null;

          // Update member
          await prisma.member.update({
            where: { id: member.id },
            data: {
              grade: newGrade,
              gradeLevel: newGradeLevel,
              roleDiscordId,
            },
          });

          // Record grade history
          await prisma.gradeHistory.create({
            data: {
              memberId: member.id,
              oldGrade: member.grade,
              oldGradeLevel: member.gradeLevel,
              newGrade,
              newGradeLevel,
              source: "MEETING",
              changedBy: userDiscordId ?? userId,
              notes: `Meeting: ${meeting.title ?? meeting.weekKey}${decision.reason ? ` - ${decision.reason}` : ""}`,
            },
          });

          // Mark decision as applied
          await prisma.meetingDecision.update({
            where: { id: decision.id },
            data: { appliedAt: new Date() },
          });

          if (decision.action === "PROMOTE") {
            results.promoted++;
          } else {
            results.demoted++;
          }
          break;
        }

        case "EXCLUDE": {
          // Mark member as inactive
          await prisma.member.update({
            where: { id: member.id },
            data: { isActive: false },
          });

          // Record in grade history
          await prisma.gradeHistory.create({
            data: {
              memberId: member.id,
              oldGrade: member.grade,
              oldGradeLevel: member.gradeLevel,
              newGrade: "EXCLUDED",
              newGradeLevel: -1,
              source: "MEETING",
              changedBy: userDiscordId ?? userId,
              notes: `Exclusion - Meeting: ${meeting.title ?? meeting.weekKey}${decision.reason ? ` - ${decision.reason}` : ""}`,
            },
          });

          await prisma.meetingDecision.update({
            where: { id: decision.id },
            data: { appliedAt: new Date() },
          });

          results.excluded++;
          break;
        }

        case "KEEP":
        default: {
          // No action needed, just mark as applied
          await prisma.meetingDecision.update({
            where: { id: decision.id },
            data: { appliedAt: new Date() },
          });
          results.kept++;
          break;
        }
      }
    } catch (err: any) {
      results.errors.push({
        memberDiscordId: decision.memberDiscordId,
        error: err.message?.slice(0, 100) ?? "Unknown error",
      });
    }
  }

  // Mark meeting as FINAL
  const finalizedMeeting = await prisma.meeting.update({
    where: { id: meetingId },
    data: {
      status: "FINAL",
      finalizedAt: new Date(),
      finalizedByUserId: userId,
    },
  });

  // Create summary
  const summary = `Réunion finalisée: ${results.promoted} promotion(s), ${results.demoted} rétrogradation(s), ${results.excluded} exclusion(s), ${results.kept} maintien(s)`;

  // Update meeting summary
  await prisma.meeting.update({
    where: { id: meetingId },
    data: { summary },
  });

  // Audit log
  await prisma.auditLog.create({
    data: {
      familyId: DEFAULT_FAMILY_ID,
      actorType: "staff",
      actorId: userId,
      actorName: session?.user?.name ?? null,
      action: "FINALIZED",
      entity: "Meeting",
      entityId: meetingId,
      entityName: meeting.title ?? meeting.weekKey,
      meta: {
        promoted: results.promoted,
        demoted: results.demoted,
        kept: results.kept,
        excluded: results.excluded,
        errors: results.errors.length,
      },
    },
  });

  // Record metric
  recordPanelMetric("meeting.finalize", meetingId, {
    promoted: results.promoted,
    demoted: results.demoted,
    kept: results.kept,
    excluded: results.excluded,
    errors: results.errors.length,
  }).catch(() => {});

  return NextResponse.json({
    ok: true,
    finalizedAt: finalizedMeeting.finalizedAt,
    summary,
    results: {
      promoted: results.promoted,
      demoted: results.demoted,
      kept: results.kept,
      excluded: results.excluded,
      errors: results.errors.length,
    },
    errors: results.errors.length > 0 ? results.errors : undefined,
  });
}
