import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChef, requireChefOrEtatMajor, requirePrivileged } from "@/lib/guards";
import { getSession } from "@/auth";
import { resolveFamilyId } from "@/lib/family";
import { getISOWeekKey } from "@/lib/meetings-legacy";
import {
  buildMeetingClientRow,
  buildMeetingRowSnapshot,
  computeMeetingCounts,
  DEFAULT_MEETING_FAMILY_ID,
  isMeetingLocked,
  mapStoredMeetingDecisionToBusinessDecision,
  MEETING_PLAYTIME_THRESHOLD_MINUTES,
} from "@/lib/meetings";
import { isStaffMeetingScopeMember, getMemberScopeFlags } from "@/lib/staff/member-scope";
import { ensureFreshFamilyPlaytime } from "@/lib/staff/ensure-fresh-playtime";
import { resolveAvatarHashByDiscordId } from "@/lib/discord/avatar-hash-resolver";

type MeetingHistoryItem = {
  meetingId: string;
  meetingTitle: string;
  weekKey: string;
  scheduledAt: string;
  decision: string;
  decisionLabel: string;
  targetGrade: string | null;
  sanctionReason: string | null;
};

type MeetingRowContinuity = {
  lastMeetingAt: string | null;
  lastDecision: string | null;
  lastDecisionLabel: string | null;
  lastSanctionAt: string | null;
  currentSanctionStatus: string | null;
  validatedWeeksCount: number;
  invalidatedWeeksCount: number;
  recentMeetingHistory: MeetingHistoryItem[];
  continuityIndicator: string | null;
};

function getMeetingDecisionLabel(decision: string | null | undefined) {
  switch (String(decision ?? "").trim().toUpperCase()) {
    case "UP":
      return "Up";
    case "DOUBLE_UP":
      return "Double Up";
    case "WEEK_VALID_1":
      return "Semaine validee 1";
    case "WEEK_VALID_2":
      return "Semaine validee 2";
    case "WEEK_VALID_3":
      return "Semaine validee 3";
    case "WEEK_INVALID":
      return "Semaine non validee";
    case "WARN_LIGHT":
      return "Avertissement leger";
    case "WARN_HEAVY":
      return "Avertissement lourd";
    case "BLACKLIST":
      return "Blacklist";
    case "RESERVIST":
      return "Reserviste";
    case "PLAYTIME_WARN":
      return "Averto playtime";
    case "DEMOTE":
      return "Demote";
    case "EXCLUDE":
      return "Exclusion";
    case "MAINTAIN":
    default:
      return "Maintien";
  }
}

function getSanctionTypeLabel(type: string | null | undefined) {
  switch (String(type ?? "").trim().toUpperCase()) {
    case "AVERT_ORAL_PLAYTIME":
      return "Averto playtime";
    case "AVERT_ORAL_REUNION":
      return "Averto reunion";
    case "AVERT_LEGER":
      return "Avertissement leger";
    case "AVERT_LOURD":
      return "Avertissement lourd";
    case "AVERT_EM":
      return "Averto EM";
    case "DEMOTE":
      return "Demote";
    case "BLACKLIST":
      return "Blacklist";
    case "RESERVISTE":
      return "Reserviste";
    default:
      return null;
  }
}

function buildContinuityIndicator(continuity: MeetingRowContinuity) {
  const parts: string[] = [];

  if (continuity.lastDecisionLabel) {
    parts.push(`Derniere decision: ${continuity.lastDecisionLabel}`);
  }

  if (continuity.currentSanctionStatus) {
    parts.push(`Sanction active: ${continuity.currentSanctionStatus}`);
  }

  if (continuity.validatedWeeksCount > 0 || continuity.invalidatedWeeksCount > 0) {
    parts.push(
      `Semaines validees ${continuity.validatedWeeksCount} / invalidees ${continuity.invalidatedWeeksCount}`
    );
  }

  return parts.length > 0 ? parts.join(" • ") : null;
}

function rowMatchesIdentity(
  row: { memberId?: string | null; discordIdSnapshot?: string | null },
  target: { memberId?: string | null; discordIdSnapshot?: string | null }
) {
  if (row.memberId && target.memberId && row.memberId === target.memberId) {
    return true;
  }
  if (
    row.discordIdSnapshot &&
    target.discordIdSnapshot &&
    row.discordIdSnapshot === target.discordIdSnapshot
  ) {
    return true;
  }
  return false;
}

async function buildMeetingContinuity(params: {
  meetingId: string;
  familyId: string;
  meetingDate: Date;
  rows: Array<{ memberId: string | null; discordIdSnapshot: string | null }>;
}) {
  const memberIds = Array.from(
    new Set(
      params.rows
        .map((row) => row.memberId)
        .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    )
  );
  const discordIds = Array.from(
    new Set(
      params.rows
        .map((row) => row.discordIdSnapshot)
        .filter((value): value is string => typeof value === "string" && value.trim() !== "")
    )
  );

  const identityFilters = [
    ...(memberIds.length > 0 ? [{ memberId: { in: memberIds } }] : []),
    ...(discordIds.length > 0 ? [{ discordIdSnapshot: { in: discordIds } }] : []),
  ];

  if (identityFilters.length === 0) {
    return new Map<string, MeetingRowContinuity>();
  }

  const [historyRows, historyDecisions, sanctions] = await Promise.all([
    prisma.meetingRow.findMany({
      where: {
        OR: identityFilters,
        meeting: {
          familyId: params.familyId,
          id: { not: params.meetingId },
          meetingDate: { lt: params.meetingDate },
          status: { in: ["CLOSED", "FINAL"] },
        },
      },
      select: {
        memberId: true,
        discordIdSnapshot: true,
        sanctionType: true,
        decisionType: true,
        sanctionReason: true,
        meeting: {
          select: {
            id: true,
            title: true,
            weekKey: true,
            meetingDate: true,
          },
        },
      },
      orderBy: [{ meeting: { meetingDate: "desc" } }],
    }),
    prisma.meetingDecision.findMany({
      where: {
        memberDiscordId: { in: discordIds.length > 0 ? discordIds : ["__never__"] },
        meeting: {
          familyId: params.familyId,
          id: { not: params.meetingId },
          meetingDate: { lt: params.meetingDate },
          status: { in: ["CLOSED", "FINAL"] },
        },
      },
      select: {
        meetingId: true,
        memberDiscordId: true,
        newGrade: true,
      },
    }),
    prisma.sanction.findMany({
      where: {
        familyId: params.familyId,
        OR: [
          ...(memberIds.length > 0 ? [{ memberId: { in: memberIds } }] : []),
          ...(discordIds.length > 0 ? [{ discordId: { in: discordIds } }] : []),
        ],
      },
      select: {
        memberId: true,
        discordId: true,
        type: true,
        status: true,
        clearedAt: true,
        expiresAt: true,
        startAt: true,
        createdAt: true,
      },
      orderBy: [{ startAt: "desc" }, { createdAt: "desc" }],
    }),
  ]);

  const targetGradeByMeetingAndDiscord = new Map(
    historyDecisions.map((decision) => [`${decision.meetingId}:${decision.memberDiscordId}`, decision.newGrade ?? null])
  );
  const now = Date.now();
  const continuityByIdentity = new Map<string, MeetingRowContinuity>();

  for (const currentRow of params.rows) {
    const matchingHistory = historyRows.filter((row) => rowMatchesIdentity(row, currentRow));
    const recentMeetingHistory = matchingHistory.slice(0, 3).map((row) => {
      const decision = mapStoredMeetingDecisionToBusinessDecision(row.decisionType, row.sanctionType);
      const discordKey = row.discordIdSnapshot ? `${row.meeting.id}:${row.discordIdSnapshot}` : null;
      return {
        meetingId: row.meeting.id,
        meetingTitle: row.meeting.title ?? `Réunion ${row.meeting.weekKey}`,
        weekKey: row.meeting.weekKey,
        scheduledAt: row.meeting.meetingDate.toISOString(),
        decision,
        decisionLabel: getMeetingDecisionLabel(decision),
        targetGrade: discordKey ? targetGradeByMeetingAndDiscord.get(discordKey) ?? null : null,
        sanctionReason: row.sanctionReason ?? null,
      };
    });

    const matchingSanctions = sanctions.filter(
      (sanction) =>
        (currentRow.memberId && sanction.memberId === currentRow.memberId) ||
        (currentRow.discordIdSnapshot && sanction.discordId === currentRow.discordIdSnapshot)
    );
    const activeSanctionLabels = matchingSanctions
      .filter((sanction) => {
        if (String(sanction.status).toUpperCase() !== "ACTIVE") return false;
        if (sanction.clearedAt) return false;
        if (sanction.expiresAt && sanction.expiresAt.getTime() <= now) return false;
        return true;
      })
      .map((sanction) => getSanctionTypeLabel(sanction.type))
      .filter((value): value is NonNullable<typeof value> => Boolean(value));
    const uniqueActiveSanctionLabels = Array.from(new Set(activeSanctionLabels));

    const continuity: MeetingRowContinuity = {
      lastMeetingAt: recentMeetingHistory[0]?.scheduledAt ?? null,
      lastDecision: recentMeetingHistory[0]?.decision ?? null,
      lastDecisionLabel: recentMeetingHistory[0]?.decisionLabel ?? null,
      lastSanctionAt: matchingSanctions[0]?.startAt?.toISOString() ?? matchingSanctions[0]?.createdAt.toISOString() ?? null,
      currentSanctionStatus:
        uniqueActiveSanctionLabels.length > 0 ? uniqueActiveSanctionLabels.join(", ") : null,
      validatedWeeksCount: matchingHistory.filter((row) => {
        const decision = mapStoredMeetingDecisionToBusinessDecision(row.decisionType, row.sanctionType);
        return decision === "WEEK_VALID_1" || decision === "WEEK_VALID_2" || decision === "WEEK_VALID_3";
      }).length,
      invalidatedWeeksCount: matchingHistory.filter((row) => {
        const decision = mapStoredMeetingDecisionToBusinessDecision(row.decisionType, row.sanctionType);
        return decision === "WEEK_INVALID";
      }).length,
      recentMeetingHistory,
      continuityIndicator: null,
    };

    continuity.continuityIndicator = buildContinuityIndicator(continuity);

    if (currentRow.memberId) {
      continuityByIdentity.set(`member:${currentRow.memberId}`, continuity);
    }
    if (currentRow.discordIdSnapshot) {
      continuityByIdentity.set(`discord:${currentRow.discordIdSnapshot}`, continuity);
    }
  }

  return continuityByIdentity;
}

type ActiveMemberSets = {
  activeMemberIds: Set<string>;
  activeDiscordIds: Set<string>;
};

async function ensureMeetingRows(id: string): Promise<ActiveMemberSets> {
  await ensureFreshFamilyPlaytime(DEFAULT_MEETING_FAMILY_ID);

  const familyId = await resolveFamilyId(DEFAULT_MEETING_FAMILY_ID);

  // Récupère le statut + la date de la réunion pour décider si on peut
  // encore update les playtimeMinutes / l'attendance (avant finalisation)
  // ou si on doit figer (après).
  const meetingMeta = await prisma.meeting.findUnique({
    where: { id },
    select: { status: true, meetingDate: true },
  });
  const meetingLocked = isMeetingLocked(meetingMeta?.status ?? null);
  const meetingDate = meetingMeta?.meetingDate ?? null;

  const existingRows = await prisma.meetingRow.findMany({
    where: { meetingId: id },
    select: {
      id: true,
      memberId: true,
      discordIdSnapshot: true,
      playtimeMinutes: true,
      attendanceStatus: true,
      updatedAt: true,
    },
  });

  const members = await prisma.member.findMany({
    where: { familyId, isGhost: false },
    select: {
      id: true,
      source: true,
      discordId: true,
      rpName: true,
      grade: true,
      isActive: true,
      discordRoleIds: true,
      rankRoleId: true,
      rankLabel: true,
      steamId: true,
      playtime7d: true,
      discordInGuild: true,
      missingFromLygSince: true,
    },
    orderBy: { rpName: "asc" },
  });

  // Filtre meeting-specific : exclut les "extra members" (Nutella, etc.)
  // en plus des règles d'inventaire générales (actif + linké + non démote/BL/RES).
  const activeMembers = members.filter(isStaffMeetingScopeMember);

  // Build active identity sets — used by buildMeetingDetail to filter visible rows
  const activeMemberIds = new Set(
    activeMembers.map((m) => m.id).filter((v): v is string => typeof v === "string" && v.trim() !== "")
  );
  const activeDiscordIds = new Set(
    activeMembers
      .map((m) => m.discordId)
      .filter((v): v is string => typeof v === "string" && v.trim() !== "")
  );

  if (activeMembers.length === 0) return { activeMemberIds, activeDiscordIds };

  const existingMemberIds = new Set(
    existingRows
      .map((row) => row.memberId)
      .filter((value): value is string => typeof value === "string" && value.trim() !== "")
  );
  const existingDiscordIds = new Set(
    existingRows
      .map((row) => row.discordIdSnapshot)
      .filter((value): value is string => typeof value === "string" && value.trim() !== "")
  );

  const missingMembers = activeMembers.filter((member) => {
    if (member.id && existingMemberIds.has(member.id)) return false;
    if (member.discordId && existingDiscordIds.has(member.discordId)) return false;
    return true;
  });

  if (missingMembers.length > 0) {
    await prisma.meetingRow.createMany({
      data: missingMembers.map((member, index) => ({
        meetingId: id,
        ...buildMeetingRowSnapshot(member),
        attendanceStatus: "NOT_CONCERNED",
        decisionType: "NONE",
        sanctionType: null,
        sanctionReason: null,
        staffNote: null,
        sortOrder: existingRows.length + index,
      })),
    });
  }

  const memberById = new Map(members.map((member) => [member.id, member]));
  const memberByDiscordId = new Map(
    members
      .filter((member) => typeof member.discordId === "string" && member.discordId.trim() !== "")
      .map((member) => [member.discordId as string, member])
  );

  // Sync playtime sur les rows :
  //   - Réunion verrouillée (CLOSED/FINAL/CANCELED) → on touche à RIEN, snapshot historique préservé
  //   - Réunion en cours (DRAFT/IN_PROGRESS)        → update si playtime live > playtime actuel
  //
  // L'anti-régression (Math.max) sert deux cas :
  //   1. Le staff peut éditer manuellement playtimeMinutes à une valeur plus
  //      haute via PATCH /row → on ne veut pas écraser cet override.
  //   2. LYG reset le compteur en début de semaine (lundi 00:00 Brussels) → si
  //      la réunion couvre ce reset, on garde la valeur la plus haute observée
  //      au lieu de retomber à 0.
  if (!meetingLocked) {
    for (const row of existingRows) {
      const member =
        (row.memberId ? memberById.get(row.memberId) : null) ??
        (row.discordIdSnapshot ? memberByDiscordId.get(row.discordIdSnapshot) : null);
      const livePlaytime =
        typeof member?.playtime7d === "number" ? Math.max(0, Math.round(member.playtime7d)) : 0;
      if (livePlaytime <= row.playtimeMinutes) continue; // pas de régression, pas d'écrasement

      await prisma.meetingRow.update({
        where: { id: row.id },
        data: { playtimeMinutes: livePlaytime },
      });
    }
  }

  // Auto-attendance complet (tant que la meeting n'est pas verrouillée) :
  //   - Absence APPROVED couvre meetingDate     → JUSTIFIED
  //   - Sinon, playtime ≥ MEETING_THRESHOLD_MIN → PRESENT
  //   - Sinon                                   → ABSENT
  //
  // Le staff n'a plus à juger manuellement : la feuille reflète la réalité
  // (absences validées + playtime live) en continu jusqu'à la finalisation.
  // À la finalisation (status CLOSED/FINAL/CANCELED), le snapshot est figé.
  //
  // Override staff : si une ligne porte le flag attendanceLockedByStaff
  // (posé par PATCH /row dès qu'un staff modifie le statut de présence),
  // on ne réécrit plus rien dessus — l'édition manuelle est respectée.
  if (!meetingLocked && meetingDate) {
    const allMemberIds = existingRows
      .map((r) => r.memberId)
      .filter((v): v is string => typeof v === "string" && v.trim() !== "");
    const allDiscordIds = existingRows
      .map((r) => r.discordIdSnapshot)
      .filter((v): v is string => typeof v === "string" && v.trim() !== "");

    let justifiedMemberIds = new Set<string>();
    let justifiedDiscordIds = new Set<string>();

    if (allMemberIds.length > 0 || allDiscordIds.length > 0) {
      const approvedAbsences = await prisma.absence.findMany({
        where: {
          familyId,
          status: "APPROVED",
          startAt: { lte: meetingDate },
          endAt: { gte: meetingDate },
          OR: [
            ...(allMemberIds.length > 0 ? [{ memberId: { in: allMemberIds } }] : []),
            ...(allDiscordIds.length > 0 ? [{ discordId: { in: allDiscordIds } }] : []),
          ],
        },
        select: { memberId: true, discordId: true },
      });

      justifiedMemberIds = new Set(
        approvedAbsences
          .map((a) => a.memberId)
          .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      );
      justifiedDiscordIds = new Set(
        approvedAbsences
          .map((a) => a.discordId)
          .filter((v): v is string => typeof v === "string" && v.trim() !== "")
      );
    }

    // On relit les rows pour avoir les playtimeMinutes potentiellement
    // mis à jour juste avant. Les selects précédents donnent l'état avant
    // sync ; ici on veut la valeur cohérente la plus à jour.
    const rowsForAttendance = await prisma.meetingRow.findMany({
      where: { meetingId: id },
      select: { id: true, memberId: true, discordIdSnapshot: true, playtimeMinutes: true, attendanceStatus: true, staffNote: true, attendanceLockedByStaff: true },
    });

    // Détection Chef Famille / Sous Chef Famille : ils sont exclus du suivi
    // playtime, donc on ne les marque jamais ABSENT auto. Une absence approuvée
    // les met en JUSTIFIED, sinon ils restent en NOT_CONCERNED.
    const chefMemberIds = new Set<string>();
    const chefDiscordIds = new Set<string>();
    for (const m of members) {
      const flags = getMemberScopeFlags(m);
      if (flags.isChefExempt) {
        if (m.id) chefMemberIds.add(m.id);
        if (m.discordId) chefDiscordIds.add(m.discordId);
      }
    }

    for (const row of rowsForAttendance) {
      // Override staff : si le staff a modifié manuellement la présence
      // (via PATCH /row avec status), on ne réécrit plus rien sur cette
      // ligne. Le flag est posé par la route /row dès qu'un staff touche
      // au statut. Pour revenir à l'auto, il faut repasser par cette
      // route ou réinitialiser le flag explicitement.
      if (row.attendanceLockedByStaff) continue;

      const isJustified =
        (row.memberId && justifiedMemberIds.has(row.memberId)) ||
        (row.discordIdSnapshot && justifiedDiscordIds.has(row.discordIdSnapshot));
      const isChefExempt =
        (row.memberId && chefMemberIds.has(row.memberId)) ||
        (row.discordIdSnapshot && chefDiscordIds.has(row.discordIdSnapshot));

      // Calcul du statut auto :
      //   1. Absence approuvée   → JUSTIFIED (toujours, même pour les chefs)
      //   2. Chef/Sous-Chef      → PRESENT (exclus du playtime, considérés présents par défaut)
      //   3. Playtime ≥ seuil    → PRESENT
      //   4. Sinon               → ABSENT
      let nextStatus: "PRESENT" | "ABSENT" | "JUSTIFIED";
      if (isJustified) {
        nextStatus = "JUSTIFIED";
      } else if (isChefExempt) {
        nextStatus = "PRESENT";
      } else if (row.playtimeMinutes >= MEETING_PLAYTIME_THRESHOLD_MINUTES) {
        nextStatus = "PRESENT";
      } else {
        nextStatus = "ABSENT";
      }

      // Note : on n'écrit une note auto QUE pour JUSTIFIED. Pour PRESENT /
      // ABSENT / NOT_CONCERNED on n'ajoute aucune note (la colonne reste
      // libre pour les commentaires staff).
      const autoNote = nextStatus === "JUSTIFIED" ? "Absence approuvée : présence justifiée" : "";
      const currentNote = String(row.staffNote ?? "").trim();
      // Note "auto" = vide OU note historique générée par l'ancien code.
      // On les écrase / vide ; on préserve toute autre note staff custom.
      const isAutoNote =
        currentNote === "" ||
        currentNote.startsWith("Absence approuvée") ||
        currentNote.startsWith("Playtime validé") ||
        currentNote.startsWith("Playtime insuffisant");

      // Idempotence : ne pas update si rien ne change.
      const sameStatus = row.attendanceStatus === nextStatus;
      const noteAlreadyCorrect = !isAutoNote || currentNote === autoNote;
      if (sameStatus && noteAlreadyCorrect) continue;

      await prisma.meetingRow.update({
        where: { id: row.id },
        data: {
          attendanceStatus: nextStatus,
          isJustified: nextStatus === "JUSTIFIED",
          ...(isAutoNote ? { staffNote: autoNote } : {}),
        },
      });
    }
  }

  return { activeMemberIds, activeDiscordIds };
}

async function buildMeetingDetail(id: string) {
  const { activeMemberIds, activeDiscordIds } = await ensureMeetingRows(id);

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      familyId: true,
      meetingDate: true,
      weekKey: true,
      title: true,
      type: true,
      status: true,
      description: true,
      summary: true,
      summaryText: true,
      summaryChannelId: true,
      summaryPostedAt: true,
      closedAt: true,
      finalizedAt: true,
      updatedAt: true,
      decisions: {
        select: {
          memberDiscordId: true,
          newGrade: true,
          action: true,
          updatedAt: true,
        },
      },
      rows: {
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          memberId: true,
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
      },
    },
  });

  if (!meeting) return null;

  // ✅ Pour les réunions non verrouillées (DRAFT/IN_PROGRESS), on filtre les rows
  // des membres qui ne sont plus actifs (DEMOTE, BLACKLIST, RESERVISTE, hors Discord, etc.).
  // Les réunions verrouillées (CLOSED/FINAL) conservent toutes leurs rows pour l'historique.
  const visibleRows = isMeetingLocked(meeting.status)
    ? meeting.rows
    : meeting.rows.filter((row) => {
        if (row.memberId && activeMemberIds.has(row.memberId)) return true;
        if (row.discordIdSnapshot && activeDiscordIds.has(row.discordIdSnapshot)) return true;
        return false;
      });

  const latestRowUpdate = visibleRows.reduce<Date | null>((latest, row) => {
    if (!latest || row.updatedAt > latest) return row.updatedAt;
    return latest;
  }, null);
  const latestDecisionUpdate = meeting.decisions.reduce<Date | null>((latest, decision) => {
    if (!latest || decision.updatedAt > latest) return decision.updatedAt;
    return latest;
  }, null);
  let updatedAt = latestRowUpdate && latestRowUpdate > meeting.updatedAt ? latestRowUpdate : meeting.updatedAt;
  if (latestDecisionUpdate && latestDecisionUpdate > updatedAt) {
    updatedAt = latestDecisionUpdate;
  }
  const promotionTargetByDiscordId = new Map(
    meeting.decisions
      .filter(
        (decision) =>
          decision.action === "PROMOTE" &&
          typeof decision.memberDiscordId === "string" &&
          decision.memberDiscordId.trim() !== ""
      )
      .map((decision) => [decision.memberDiscordId, decision.newGrade ?? null])
  );
  const avatarHashByDiscordId = await resolveAvatarHashByDiscordId(
    visibleRows
      .map((row) => row.discordIdSnapshot)
      .filter((value): value is string => typeof value === "string" && value.trim() !== "")
  );
  const continuityByIdentity = await buildMeetingContinuity({
    meetingId: meeting.id,
    familyId: meeting.familyId,
    meetingDate: meeting.meetingDate,
    rows: visibleRows.map((row) => ({
      memberId: row.memberId ?? null,
      discordIdSnapshot: row.discordIdSnapshot ?? null,
    })),
  });

  return {
    id: meeting.id,
    scheduledAt: meeting.meetingDate.toISOString(),
    title: meeting.title ?? `Réunion ${meeting.weekKey}`,
    type: meeting.type,
    status: meeting.status,
    weekKey: meeting.weekKey,
    locked: isMeetingLocked(meeting.status),
    counts: computeMeetingCounts(visibleRows),
    updatedAt: updatedAt.toISOString(),
    meetingNote: meeting.description ?? "",
    summary: meeting.summaryText ?? meeting.summary,
    finalizedAt: meeting.finalizedAt?.toISOString() ?? null,
    closedAt: meeting.closedAt?.toISOString() ?? null,
    discord: {
      channelId: meeting.summaryChannelId ?? null,
      messageId: null,
      lastPublishedAt: meeting.summaryPostedAt?.toISOString() ?? null,
    },
    rows: visibleRows.map((row) => {
      const continuity =
        (row.memberId ? continuityByIdentity.get(`member:${row.memberId}`) : null) ??
        (row.discordIdSnapshot ? continuityByIdentity.get(`discord:${row.discordIdSnapshot}`) : null) ??
        null;

      return {
        ...buildMeetingClientRow(row, {
          discordAvatarHash: row.discordIdSnapshot ? avatarHashByDiscordId.get(row.discordIdSnapshot) ?? null : null,
          targetGrade: row.discordIdSnapshot ? promotionTargetByDiscordId.get(row.discordIdSnapshot) ?? null : null,
        }),
        continuity,
      };
    }),
  };
}

function mapStatusInput(value: string) {
  const normalized = value.trim().toUpperCase();
  if (["DRAFT", "IN_PROGRESS", "CLOSED", "CANCELED", "FINAL"].includes(normalized)) {
    return normalized;
  }
  return null;
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireChefOrEtatMajor();
  if (guard instanceof Response) return guard;

  const meeting = await buildMeetingDetail(id);
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  return NextResponse.json({ ok: true, meeting });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requirePrivileged();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const actorId = session?.user?.id ?? (session as any)?.userId;
  if (!actorId) {
    return NextResponse.json({ ok: false, error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: {
      id: true,
      weekKey: true,
      status: true,
    },
  });
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  if (isMeetingLocked(meeting.status)) {
    return NextResponse.json({ ok: false, error: "MEETING_LOCKED" }, { status: 409 });
  }

  const updateData: Record<string, unknown> = {};

  if ("title" in body) {
    const title = String((body as any).title ?? "").trim();
    if (!title) {
      return NextResponse.json({ ok: false, error: "INVALID_TITLE" }, { status: 400 });
    }
    updateData.title = title;
  }

  if ("scheduledAt" in body) {
    const raw = String((body as any).scheduledAt ?? "").trim();
    const parsed = raw ? new Date(raw) : null;
    if (!parsed || Number.isNaN(parsed.getTime())) {
      return NextResponse.json({ ok: false, error: "INVALID_SCHEDULED_AT" }, { status: 400 });
    }
    const nextWeekKey = getISOWeekKey(parsed);
    const existing = await prisma.meeting.findFirst({
      where: {
        weekKey: nextWeekKey,
        id: { not: id },
      },
      select: { id: true },
    });
    if (existing) {
      return NextResponse.json({ ok: false, error: "WEEKKEY_EXISTS" }, { status: 409 });
    }
    updateData.meetingDate = parsed;
    updateData.weekKey = nextWeekKey;
  }

  if ("status" in body) {
    const next = mapStatusInput(String((body as any).status ?? ""));
    if (!next) {
      return NextResponse.json({ ok: false, error: "INVALID_STATUS" }, { status: 400 });
    }
    if (["CLOSED", "FINAL", "CANCELED"].includes(next)) {
      const chefGuard = await requireChef();
      if (chefGuard instanceof Response) return chefGuard;
    }
    updateData.status = next;
  }

  if ("meetingNote" in body || "notes" in body) {
    const noteSource = "meetingNote" in body ? (body as any).meetingNote : (body as any).notes;
    updateData.description = String(noteSource ?? "").trim() || null;
  }

  if ("summaryChannelId" in body) {
    const channelId = String((body as any).summaryChannelId ?? "").trim();
    updateData.summaryChannelId = channelId || null;
  }

  if (Object.keys(updateData).length === 0) {
    return NextResponse.json({ ok: false, error: "NO_FIELDS" }, { status: 400 });
  }

  await prisma.meeting.update({
    where: { id },
    data: updateData,
  });

  const detail = await buildMeetingDetail(id);
  return NextResponse.json({ ok: true, meeting: detail });
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireChef();
  if (guard instanceof Response) return guard;

  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { id: true, status: true, weekKey: true, title: true },
  });
  if (!meeting) {
    return NextResponse.json({ ok: false, error: "NOT_FOUND" }, { status: 404 });
  }

  const status = String(meeting.status ?? "").toUpperCase();
  const canDelete = status === "DRAFT" || status === "IN_PROGRESS" || status === "CANCELED";
  if (!canDelete) {
    return NextResponse.json(
      { ok: false, error: "DELETE_FORBIDDEN_STATUS", message: "Suppression autorisee uniquement pour Brouillon / En cours / Annulee" },
      { status: 409 }
    );
  }

  await prisma.meeting.delete({ where: { id } });

  return NextResponse.json({
    ok: true,
    deleted: {
      id: meeting.id,
      weekKey: meeting.weekKey,
      title: meeting.title,
    },
  });
}
