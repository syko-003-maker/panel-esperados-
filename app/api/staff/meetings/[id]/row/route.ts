import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requirePrivileged, requireFullWriter } from "@/lib/guards";
import { resolveFamilyId } from "@/lib/family";
import type { MeetingRowDecisionType } from "@prisma/client";
import {
  buildMeetingClientRow,
  computeMeetingCounts,
  buildMeetingRowSnapshot,
  DEFAULT_MEETING_FAMILY_ID,
  isMeetingLocked,
  mapBusinessDecisionToStoredValue,
  mapSanctionTypeToDecisionType,
  mapLegacyStatusToStored,
  mapStoredMeetingDecisionToBusinessDecision,
} from "@/lib/meetings";
import { getDiscordGradeMappings } from "@/lib/discord-grade";
import { checkSanctionTargetEligibility } from "@/lib/sanctions";
import { isProtectedPromotionTargetGrade } from "@/lib/staff/meetings/finalize/target-grade";

const MEETING_TARGET_GRADES = Array.from(
  new Set(
    getDiscordGradeMappings()
      .map((entry) => String(entry.grade ?? "").trim())
      .filter(Boolean)
  )
);

function normalizeMeetingTargetGrade(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  const match = MEETING_TARGET_GRADES.find((grade) => grade.toLowerCase() === normalized);
  return match ?? null;
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Lecture du body d'abord pour décider du niveau de guard nécessaire.
  // requirePrivileged() est suffisant pour : marquer présence / note /
  // playtime (Encadrant peut le faire pendant une réunion).
  // requireFullWriter() est requis pour : enregistrer une décision (sanction,
  // promotion, démote, grade cible) → bloque l'Encadrant.
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  // Détection "écriture sensible" : si le body touche aux décisions, on
  // exige le tier writer (EM/Chef). Sinon (juste status/note/playtime),
  // requirePrivileged() est suffisant — Encadrant OK.
  const touchesDecision =
    "decisionType" in body ||
    "sanctionType" in body ||
    "sanctionReason" in body ||
    "targetGrade" in body;
  if (touchesDecision) {
    const writerGuard = await requireFullWriter();
    if (writerGuard instanceof Response) return writerGuard;
  }

  const discordId = String((body as any).discordId ?? "").trim();
  const rowId = String((body as any).rowId ?? "").trim();
  if (!discordId && !rowId) {
    return NextResponse.json({ ok: false, error: "MISSING_ROW_IDENTIFIER" }, { status: 400 });
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  if (isMeetingLocked(meeting.status)) {
    return NextResponse.json({ ok: false, error: "MEETING_LOCKED" }, { status: 409 });
  }

  const nextStatusInput = "status" in body ? String((body as any).status ?? "").trim().toUpperCase() : null;
  const nextStatus = nextStatusInput !== null ? mapLegacyStatusToStored(nextStatusInput) : null;
  const nextNote = "note" in body ? String((body as any).note ?? "").trim() : null;
  const nextDecisionTypeRaw =
    "decisionType" in body ? String((body as any).decisionType ?? "MAINTAIN").trim().toUpperCase() : null;
  const nextSanctionTypeRaw =
    "sanctionType" in body ? String((body as any).sanctionType ?? "").trim().toUpperCase() : null;
  const allowedSanctionTypes = [
    "AVERT_ORAL_PLAYTIME",
    "AVERT_ORAL_REUNION",
    "AVERT_LEGER",
    "AVERT_LOURD",
    "AVERT_EM",
    "DEMOTE",
    "BLACKLIST",
    "RESERVISTE",
    "UP",
    "DOUBLE_UP",
    "WEEK_VALID_1",
    "WEEK_VALID_2",
    "WEEK_VALID_3",
    "WEEK_INVALID",
    "EXCLUDE",
    "REMOVE_TEST_RANK",
    "",
    "NONE",
    "MAINTIEN",
  ];
  const allowedBusinessDecisionTypes = [
    "MAINTAIN",
    "DEMOTE",
    "EXCLUDE",
    "WARN_LIGHT",
    "WARN_HEAVY",
    "BLACKLIST",
    "RESERVIST",
    "PLAYTIME_WARN",
    "UP",
    "DOUBLE_UP",
    "WEEK_VALID_1",
    "WEEK_VALID_2",
    "WEEK_VALID_3",
    "WEEK_INVALID",
    "REMOVE_TEST_RANK",
  ];
  const allowedDecisionTypes: MeetingRowDecisionType[] = [
    "NONE",
    "REMINDER",
    "WARNING_ORAL",
    "WARNING",
    "DEMOTE",
    "EXCLUDE",
    "OTHER",
  ];
  const nextDecisionType: MeetingRowDecisionType | null =
    nextDecisionTypeRaw && allowedDecisionTypes.includes(nextDecisionTypeRaw as MeetingRowDecisionType)
      ? (nextDecisionTypeRaw as MeetingRowDecisionType)
      : null;
  const mappedBusinessDecision =
    nextDecisionTypeRaw && allowedBusinessDecisionTypes.includes(nextDecisionTypeRaw)
      ? mapBusinessDecisionToStoredValue(nextDecisionTypeRaw)
      : null;
  const nextSanctionType: string | null =
    nextSanctionTypeRaw !== null && allowedSanctionTypes.includes(nextSanctionTypeRaw)
      ? (nextSanctionTypeRaw === "" || nextSanctionTypeRaw === "NONE" || nextSanctionTypeRaw === "MAINTIEN"
          ? null
          : nextSanctionTypeRaw)
      : null;
  const nextPlaytime =
    "playtimeMinutes" in body && Number.isFinite(Number((body as any).playtimeMinutes))
      ? Math.max(0, Math.round(Number((body as any).playtimeMinutes)))
      : null;
  const nextSanctionReason = "sanctionReason" in body ? String((body as any).sanctionReason ?? "").trim() : null;
  const nextJustified = "isJustified" in body ? Boolean((body as any).isJustified) : null;
  const nextTargetGradeInput = "targetGrade" in body ? String((body as any).targetGrade ?? "").trim() : null;
  const nextTargetGrade = nextTargetGradeInput !== null ? normalizeMeetingTargetGrade(nextTargetGradeInput) : null;

  if (nextStatusInput !== null && nextStatus === null) {
    return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
  }

  if (
    nextDecisionTypeRaw !== null &&
    nextDecisionType === null &&
    mappedBusinessDecision === null &&
    nextSanctionTypeRaw === null
  ) {
    return NextResponse.json({ ok: false, error: "INVALID_DECISION_TYPE" }, { status: 400 });
  }

  if (nextTargetGradeInput !== null && nextTargetGradeInput !== "" && nextTargetGrade === null) {
    return NextResponse.json({ ok: false, error: "INVALID_TARGET_GRADE" }, { status: 400 });
  }

  // Sécurité : interdire les promotions vers Chef famille / Général /
  // Sous-Chef famille / Consejero via une réunion. Voir le commentaire dans
  // src/lib/staff/meetings/finalize/target-grade.ts — la route est gardée
  // par requireChef() qui accepte tous les EM, donc un EM pourrait sinon
  // se promouvoir lui-même au plus haut grade.
  if (isProtectedPromotionTargetGrade(nextTargetGrade)) {
    return NextResponse.json(
      {
        ok: false,
        error: "FORBIDDEN_TARGET_GRADE",
        message: "Ce grade ne peut pas être attribué via une réunion (action réservée au Chef famille).",
      },
      { status: 403 },
    );
  }

  if (nextStatusInput === null && nextNote === null && nextDecisionType === null && mappedBusinessDecision === null && nextSanctionTypeRaw === null && nextSanctionReason === null && nextPlaytime === null && nextJustified === null && nextTargetGradeInput === null) {
    return NextResponse.json({ ok: false, error: "NO_FIELDS" }, { status: 400 });
  }

  let row = rowId
    ? await prisma.meetingRow.findFirst({ where: { id: rowId, meetingId: id } })
    : await prisma.meetingRow.findFirst({ where: { meetingId: id, discordIdSnapshot: discordId } });

  if (!row && discordId) {
    const familyId = await resolveFamilyId(DEFAULT_MEETING_FAMILY_ID);
    const member = await prisma.member.findFirst({
      where: { familyId, discordId },
      select: {
        id: true,
        rpName: true,
        grade: true,
        rankLabel: true,
        steamId: true,
        discordId: true,
        playtime7d: true,
      },
    });
    const snapshot = buildMeetingRowSnapshot({
      id: member?.id ?? null,
      rpName: member?.rpName ?? null,
      grade: member?.grade ?? null,
      rankLabel: member?.rankLabel ?? null,
      steamId: member?.steamId ?? null,
      discordId: member?.discordId ?? discordId,
      playtime7d: member?.playtime7d ?? 0,
    });

    row = await prisma.meetingRow.create({
      data: {
        meetingId: id,
        ...snapshot,
        attendanceStatus: "NOT_CONCERNED",
        decisionType: "NONE",
        sanctionType: null,
        sanctionReason: null,
        staffNote: null,
        sortOrder: await prisma.meetingRow.count({ where: { meetingId: id } }),
      },
    });
  }

  if (!row) {
    return NextResponse.json({ ok: false, error: "ROW_NOT_FOUND" }, { status: 404 });
  }

  const memberDiscordId = String(row.discordIdSnapshot ?? discordId ?? "").trim();
  const existingDecision = memberDiscordId
    ? await prisma.meetingDecision.findUnique({
        where: {
          meetingId_memberDiscordId: {
            meetingId: id,
            memberDiscordId,
          },
        },
      })
    : null;

  const resolvedSanctionType =
    mappedBusinessDecision !== null
      ? mappedBusinessDecision.sanctionType
      : nextSanctionTypeRaw !== null
        ? nextSanctionType
        : row.sanctionType;

  // Sanctions à scope restreint (AVERT_EM ⇒ membre EM uniquement).
  // On bloque ici aussi (en plus de la route /api/staff/sanctions) car les
  // décisions de réunion finalisent ensuite en sanctions réelles via
  // finalize → si on laissait passer une décision AVERT_EM sur un non-EM,
  // la finalize se planterait silencieusement.
  if (resolvedSanctionType && memberDiscordId) {
    const familyId = await resolveFamilyId(DEFAULT_MEETING_FAMILY_ID);
    const targetMember = await prisma.member.findFirst({
      where: { familyId, discordId: memberDiscordId },
      select: { discordRoleIds: true, rpName: true },
    });
    const eligibility = checkSanctionTargetEligibility(
      resolvedSanctionType,
      targetMember?.discordRoleIds ?? null,
    );
    if (!eligibility.ok) {
      return NextResponse.json(
        {
          ok: false,
          error: eligibility.error,
          requiredRoleId: eligibility.requiredRoleId,
          message:
            resolvedSanctionType === "AVERT_EM"
              ? "L'Averto EM ne peut être appliqué qu'à un membre de l'État-Major."
              : "Ce type de sanction n'est pas applicable à ce membre.",
        },
        { status: 400 },
      );
    }
  }
  const resolvedDecisionType =
    mappedBusinessDecision !== null
      ? mappedBusinessDecision.decisionType
      : nextSanctionTypeRaw !== null
        ? mapSanctionTypeToDecisionType(nextSanctionType)
        : nextDecisionType ?? row.decisionType;
  const resolvedBusinessDecision = mapStoredMeetingDecisionToBusinessDecision(
    resolvedDecisionType,
    resolvedSanctionType
  );
  const requiresTargetGrade = resolvedBusinessDecision === "UP" || resolvedBusinessDecision === "DOUBLE_UP";
  const resolvedTargetGrade =
    nextTargetGradeInput !== null
      ? nextTargetGrade
      : normalizeMeetingTargetGrade(existingDecision?.newGrade ?? null);

  if (requiresTargetGrade && !resolvedTargetGrade) {
    return NextResponse.json({ ok: false, error: "TARGET_GRADE_REQUIRED" }, { status: 400 });
  }

  // Si le staff modifie manuellement le statut de présence (ou le flag
  // isJustified), on verrouille la ligne pour que la boucle auto-attendance
  // (GET /meetings/[id]) ne l'écrase plus. Le staff peut toujours revenir
  // sur sa décision en repassant par cette même route.
  const staffEditedAttendance = nextStatus !== null || nextJustified !== null;

  await prisma.meetingRow.update({
    where: { id: row.id },
    data: {
      attendanceStatus: nextStatus?.attendanceStatus ?? row.attendanceStatus,
      staffNote: nextNote ?? row.staffNote,
      sanctionType: resolvedSanctionType,
      sanctionReason: nextSanctionReason ?? row.sanctionReason,
      decisionType: resolvedDecisionType,
      playtimeMinutes: nextPlaytime ?? row.playtimeMinutes,
      isJustified:
        nextJustified !== null
          ? nextJustified
          : nextStatus !== null
            ? nextStatus.isJustified
            : row.isJustified,
      ...(staffEditedAttendance ? { attendanceLockedByStaff: true } : {}),
    },
  });

  if (memberDiscordId) {
    if (requiresTargetGrade) {
      await prisma.meetingDecision.upsert({
        where: {
          meetingId_memberDiscordId: {
            meetingId: id,
            memberDiscordId,
          },
        },
        create: {
          meetingId: id,
          memberDiscordId,
          oldGrade: row.gradeSnapshot ?? null,
          newGrade: resolvedTargetGrade,
          action: "PROMOTE",
          reason: nextSanctionReason ?? row.sanctionReason ?? null,
        },
        update: {
          oldGrade: row.gradeSnapshot ?? null,
          newGrade: resolvedTargetGrade,
          action: "PROMOTE",
          reason: nextSanctionReason ?? row.sanctionReason ?? null,
        },
      });
    } else if (existingDecision) {
      await prisma.meetingDecision.deleteMany({
        where: {
          meetingId: id,
          memberDiscordId,
        },
      });
    }
  }

  const rows = await prisma.meetingRow.findMany({
    where: { meetingId: id },
    orderBy: { sortOrder: "asc" },
    select: {
      id: true,
      rpNameSnapshot: true,
      gradeSnapshot: true,
      steamIdSnapshot: true,
      discordIdSnapshot: true,
      playtimeMinutes: true,
      attendanceStatus: true,
      sanctionType: true,
      decisionType: true,
      sanctionReason: true,
      staffNote: true,
      isJustified: true,
      sortOrder: true,
      updatedAt: true,
    },
  });

  const updatedDecision = memberDiscordId
    ? await prisma.meetingDecision.findUnique({
        where: {
          meetingId_memberDiscordId: {
            meetingId: id,
            memberDiscordId,
          },
        },
        select: { newGrade: true, action: true },
      })
    : null;

  const updatedRow = rows.find((item) => item.id === row.id);
  const latestUpdate = rows.reduce((latest, item) => (item.updatedAt > latest ? item.updatedAt : latest), new Date(0));

  return NextResponse.json({
    ok: true,
    row:
      updatedRow
        ? buildMeetingClientRow(updatedRow, {
            targetGrade: updatedDecision?.action === "PROMOTE" ? updatedDecision.newGrade ?? null : null,
          })
        : null,
    counts: computeMeetingCounts(rows),
    locked: false,
    updatedAt: latestUpdate.toISOString(),
  });
}
