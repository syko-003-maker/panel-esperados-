export const DEFAULT_MEETING_FAMILY_ID = "esperados";
// Seuil de validation du playtime hebdomadaire (Brussels lundi 00:00 → réunion).
// Au-dessus de ce seuil, un membre est considéré "présent" automatiquement
// dans la feuille de réunion. En-dessous (et sans absence approuvée), il est
// marqué absent. Source : convention Los Esperados.
export const MEETING_PLAYTIME_THRESHOLD_MINUTES = 300;

/**
 * Minutes de playtime réellement requises pour un membre donné.
 *
 * Exception par membre : `Member.playtimeRequiredMinutes` (accordée au cas par
 * cas par le staff). Si null / ≤ 0 → seuil par défaut (300). Sinon, le seuil
 * personnalisé remplace le seuil global pour la validation de présence.
 */
export function resolveRequiredPlaytimeMinutes(
  playtimeRequiredMinutes: number | null | undefined,
): number {
  // >= 0 : 0 = membre EXEMPTÉ de playtime (aucun minimum requis → toujours
  // "présent"). null/undefined → seuil par défaut (300).
  return typeof playtimeRequiredMinutes === "number" &&
    Number.isFinite(playtimeRequiredMinutes) &&
    playtimeRequiredMinutes >= 0
    ? Math.floor(playtimeRequiredMinutes)
    : MEETING_PLAYTIME_THRESHOLD_MINUTES;
}

import { GRADE_LABEL_BY_ROLE_ID, GRADE_ROLE_IDS_ORDERED } from "@/lib/grade-colors";

type Nullable<T> = T | null | undefined;

export type MeetingMemberSnapshotSource = {
  id?: string | null;
  rpName?: string | null;
  grade?: string | null;
  rankLabel?: string | null;
  steamId?: string | null;
  discordId?: string | null;
  playtime7d?: number | null;
  discordRoleIds?: unknown;
};

export type MeetingRowLike = {
  id?: string | null;
  rpNameSnapshot?: string | null;
  gradeSnapshot?: string | null;
  steamIdSnapshot?: string | null;
  discordIdSnapshot?: string | null;
  playtimeMinutes?: number | null;
  attendanceStatus?: string | null;
  status?: string | null;
  decisionType?: string | null;
  sanctionType?: string | null;
  sanctionReason?: string | null;
  staffNote?: string | null;
  isJustified?: boolean | null;
  sortOrder?: number | null;
  updatedAt?: Date | string | null;
};

export type MeetingCounts = {
  total: number;
  present: number;
  late: number;
  excused: number;
  absentJustified: number;
  absentUnjustified: number;
  unknown: number;
};

export type MeetingSummaryCounts = {
  totalMembers: number;
  justifiedCount: number;
  noActionCount: number;
  reminderCount: number;
  warningOralCount: number;
  warningCount: number;
  demoteCount: number;
  blacklistCount: number;
  reservistCount: number;
  excludeCount: number;
  otherCount: number;
  sanctionedCount: number;
  playtimeTotalMinutes: number;
  playtimeAverageMinutes: number;
  underThresholdCount: number;
  summaryText: string;
};

export type AbsenceType = "MEETING" | "GENERAL";
export type AbsenceUiStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELED" | "EXPIRED";

export type AbsenceMeta = {
  v: 1;
  type: AbsenceType;
  meetingDate: string | null;
  memberNotes: string | null;
  rejectionReason: string | null;
  rejectedById: string | null;
  rejectedAt: string | null;
};

export type StoredAttendanceUpdate = {
  attendanceStatus: "PRESENT" | "ABSENT" | "JUSTIFIED" | "EXCUSED" | "LATE" | "NOT_CONCERNED";
  isJustified: boolean;
};

export type StoredMeetingDecision = {
  decisionType: "NONE" | "REMINDER" | "WARNING_ORAL" | "WARNING" | "DEMOTE" | "EXCLUDE" | "OTHER";
  sanctionType: string | null;
};

function normalizeText(value: Nullable<string>) {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function normalizeMinutes(value: Nullable<number>) {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.round(value));
}

function normalizeDecisionType(value: Nullable<string>) {
  return String(value ?? "NONE").trim().toUpperCase() || "NONE";
}

function normalizeSanctionType(value: Nullable<string>) {
  const normalized = String(value ?? "").trim().toUpperCase();
  if (!normalized || normalized === "NONE" || normalized === "MAINTIEN" || normalized === "MAINTAIN") {
    return null;
  }
  return normalized;
}

function normalizeLegacyAttendance(value: Nullable<string>) {
  return String(value ?? "UNKNOWN").trim().toUpperCase() || "UNKNOWN";
}

function normalizeStoredAttendance(value: Nullable<string>) {
  return String(value ?? "NOT_CONCERNED").trim().toUpperCase() || "NOT_CONCERNED";
}

function normalizeAbsenceType(value: unknown): AbsenceType {
  const normalized = String(value ?? "GENERAL").trim().toUpperCase();
  return normalized === "MEETING" ? "MEETING" : "GENERAL";
}

function parseDateLike(value: unknown): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function toLegacyAttendanceStatus(value: Nullable<string>):
  | "UNKNOWN"
  | "PRESENT"
  | "LATE"
  | "EXCUSED"
  | "ABSENT_JUSTIFIED"
  | "ABSENT_UNJUSTIFIED" {
  switch (normalizeStoredAttendance(value)) {
    case "PRESENT":
      return "PRESENT";
    case "LATE":
      return "LATE";
    case "EXCUSED":
      return "EXCUSED";
    case "JUSTIFIED":
      return "ABSENT_JUSTIFIED";
    case "ABSENT":
      return "ABSENT_UNJUSTIFIED";
    case "NOT_CONCERNED":
    default:
      return "UNKNOWN";
  }
}

function formatMinutes(minutes: number) {
  const safe = normalizeMinutes(minutes);
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  if (hours <= 0) return `${remainder} min`;
  return remainder > 0 ? `${hours}h ${remainder}` : `${hours}h`;
}

function decisionLabel(decisionType: string) {
  switch (decisionType) {
    case "REMINDER":
      return "reminder";
    case "WARNING_ORAL":
      return "oral warning";
    case "WARNING":
      return "warning";
    case "DEMOTE":
      return "demote";
    case "EXCLUDE":
      return "exclude";
    case "OTHER":
      return "other";
    default:
      return "none";
  }
}

function businessDecisionLabel(decision: string) {
  switch (decision) {
    case "UP":
      return "up";
    case "DOUBLE_UP":
      return "double up";
    case "WEEK_VALID_1":
      return "week valid 1";
    case "WEEK_VALID_2":
      return "week valid 2";
    case "WEEK_VALID_3":
      return "week valid 3";
    case "WEEK_INVALID":
      return "week invalid";
    case "WARN_LIGHT":
      return "warn light";
    case "WARN_HEAVY":
      return "warn heavy";
    case "BLACKLIST":
      return "blacklist";
    case "RESERVIST":
      return "reservist";
    case "PLAYTIME_WARN":
      return "playtime warn";
    case "DEMOTE":
      return "demote";
    case "EXCLUDE":
      return "exclude";
    case "MAINTAIN":
    default:
      return "maintain";
  }
}

/**
 * Résout le grade d'un membre depuis ses rôles Discord.
 *
 * Itère sur GRADE_ROLE_IDS_ORDERED (ordre hiérarchique : du plus haut au
 * plus bas) et renvoie le label du PREMIER rôle trouvé. Ça gère le cas
 * d'un membre avec plusieurs rôles grade (legacy Chef famille + nouveau
 * Coronel par ex.) — on prend le plus haut comme source de vérité.
 */
function resolveGradeFromRoles(discordRoleIds: unknown): string | null {
  const roles = new Set(
    Array.isArray(discordRoleIds)
      ? discordRoleIds.map((r) => String(r ?? "").trim()).filter(Boolean)
      : [],
  );
  if (roles.size === 0) return null;
  for (const roleId of GRADE_ROLE_IDS_ORDERED) {
    if (roles.has(roleId)) {
      const label = GRADE_LABEL_BY_ROLE_ID[roleId];
      if (label) return label;
    }
  }
  return null;
}

/**
 * Construit le snapshot d'une ligne de réunion.
 *
 * IMPORTANT — priorité Discord > DB :
 *   Member.discordRoleIds est le mirror live des rôles Discord, mis à jour
 *   toutes les 3 min par le worker. C'est la SOURCE DE VÉRITÉ. Les champs
 *   Member.rankLabel / Member.grade sont des caches DB qui ne sont PAS
 *   re-synchronisés quand un staff change manuellement un rôle Discord →
 *   ils peuvent être obsolètes pendant longtemps.
 *
 *   Avant ce fix : on prenait rankLabel/grade en priorité → si un staff
 *   promouvait quelqu'un manuellement sur Discord et créait la feuille
 *   ensuite, le snapshot avait l'ancien grade.
 *
 *   Maintenant : on résout depuis discordRoleIds en priorité, et on tombe
 *   sur rankLabel/grade seulement comme fallback (membres sans Discord
 *   linkés, etc.).
 */
export function buildMeetingRowSnapshot(member: MeetingMemberSnapshotSource) {
  const gradeFromRoles = resolveGradeFromRoles(member.discordRoleIds);
  const gradeFromDb = normalizeText(member.rankLabel ?? member.grade);
  return {
    memberId: member.id ?? null,
    rpNameSnapshot: normalizeText(member.rpName) ?? "Membre inconnu",
    gradeSnapshot: gradeFromRoles ?? gradeFromDb,
    steamIdSnapshot: normalizeText(member.steamId),
    discordIdSnapshot: normalizeText(member.discordId),
    playtimeMinutes: normalizeMinutes(member.playtime7d),
  };
}

export function isMeetingLocked(status: Nullable<string>) {
  const normalized = String(status ?? "").trim().toUpperCase();
  return normalized === "CLOSED" || normalized === "FINAL" || normalized === "CANCELED";
}

export function mapAttendanceStatusToLegacy(value: Nullable<string>) {
  const normalized = normalizeStoredAttendance(value);
  if (normalized === "PRESENT") return "PRESENT" as const;
  if (normalized === "LATE") return "LATE" as const;
  if (normalized === "EXCUSED") return "EXCUSED" as const;
  if (normalized === "JUSTIFIED") return "ABSENT_JUSTIFIED" as const;
  if (normalized === "ABSENT") return "ABSENT_UNJUSTIFIED" as const;
  return "UNKNOWN" as const;
}

export function mapLegacyStatusToAttendance(value: Nullable<string>) {
  const normalized = normalizeLegacyAttendance(value);
  if (normalized === "PRESENT") return "PRESENT";
  if (normalized === "LATE") return "LATE";
  if (normalized === "EXCUSED") return "EXCUSED";
  if (normalized === "ABSENT_JUSTIFIED" || normalized === "JUSTIFIED") return "JUSTIFIED";
  if (normalized === "ABSENT_UNJUSTIFIED" || normalized === "ABSENT") return "ABSENT";
  return "NOT_CONCERNED";
}

export function mapLegacyStatusToStored(value: Nullable<string>): StoredAttendanceUpdate | null {
  const normalized = normalizeLegacyAttendance(value);

  if (normalized === "PRESENT") {
    return { attendanceStatus: "PRESENT", isJustified: false };
  }
  if (normalized === "LATE") {
    return { attendanceStatus: "LATE", isJustified: false };
  }
  if (normalized === "EXCUSED") {
    // Excusé = absent prévenu / motif accepté → on garde isJustified=true,
    // mais on conserve la distinction côté UI (EXCUSED vs ABSENT_JUSTIFIED).
    return { attendanceStatus: "EXCUSED", isJustified: true };
  }
  if (normalized === "ABSENT_JUSTIFIED" || normalized === "JUSTIFIED") {
    return { attendanceStatus: "JUSTIFIED", isJustified: true };
  }
  if (normalized === "ABSENT_UNJUSTIFIED" || normalized === "ABSENT") {
    return { attendanceStatus: "ABSENT", isJustified: false };
  }
  if (normalized === "UNKNOWN" || normalized === "NOT_CONCERNED") {
    return { attendanceStatus: "NOT_CONCERNED", isJustified: false };
  }

  return null;
}

export function mapSanctionTypeToDecisionType(sanctionType: Nullable<string>): StoredMeetingDecision["decisionType"] {
  const normalized = normalizeSanctionType(sanctionType);
  if (!normalized) return "NONE";

  if (normalized === "DEMOTE") return "DEMOTE";
  if (normalized === "BLACKLIST" || normalized === "EXCLUDE") return "EXCLUDE";
  if (normalized === "AVERT_ORAL_PLAYTIME" || normalized === "AVERT_ORAL_REUNION") return "WARNING_ORAL";
  if (
    normalized === "AVERT_LEGER" ||
    normalized === "AVERT_LOURD" ||
    normalized === "AVERT_EM" ||
    normalized === "WARN_LIGHT" ||
    normalized === "WARN_HEAVY"
  ) {
    return "WARNING";
  }

  return "OTHER";
}

export function mapBusinessDecisionToStoredValue(value: Nullable<string>): StoredMeetingDecision | null {
  const normalized = String(value ?? "").trim().toUpperCase();

  if (!normalized || normalized === "MAINTAIN") {
    return { decisionType: "NONE", sanctionType: null };
  }
  if (normalized === "DEMOTE") {
    return { decisionType: "DEMOTE", sanctionType: "DEMOTE" };
  }
  if (normalized === "EXCLUDE") {
    return { decisionType: "EXCLUDE", sanctionType: "EXCLUDE" };
  }
  if (normalized === "WARN_LIGHT") {
    return { decisionType: "WARNING", sanctionType: "AVERT_LEGER" };
  }
  if (normalized === "WARN_HEAVY") {
    return { decisionType: "WARNING", sanctionType: "AVERT_LOURD" };
  }
  if (normalized === "BLACKLIST") {
    return { decisionType: "EXCLUDE", sanctionType: "BLACKLIST" };
  }
  if (normalized === "RESERVIST") {
    return { decisionType: "OTHER", sanctionType: "RESERVISTE" };
  }
  if (normalized === "PLAYTIME_WARN") {
    return { decisionType: "WARNING_ORAL", sanctionType: "AVERT_ORAL_PLAYTIME" };
  }
  if (
    normalized === "UP" ||
    normalized === "DOUBLE_UP" ||
    normalized === "WEEK_VALID_1" ||
    normalized === "WEEK_VALID_2" ||
    normalized === "WEEK_VALID_3" ||
    normalized === "WEEK_INVALID" ||
    normalized === "REMOVE_TEST_RANK"
  ) {
    return { decisionType: "OTHER", sanctionType: normalized };
  }

  return null;
}

export function mapStoredMeetingDecisionToBusinessDecision(
  decisionType: Nullable<string>,
  sanctionType: Nullable<string>
) {
  const normalizedDecisionType = normalizeDecisionType(decisionType);
  const normalizedSanctionType = normalizeSanctionType(sanctionType);

  if (normalizedSanctionType === "UP") return "UP";
  if (normalizedSanctionType === "DOUBLE_UP") return "DOUBLE_UP";
  if (normalizedSanctionType === "WEEK_VALID_1") return "WEEK_VALID_1";
  if (normalizedSanctionType === "WEEK_VALID_2") return "WEEK_VALID_2";
  if (normalizedSanctionType === "WEEK_VALID_3") return "WEEK_VALID_3";
  if (normalizedSanctionType === "WEEK_INVALID") return "WEEK_INVALID";
  if (normalizedSanctionType === "RESERVIST" || normalizedSanctionType === "RESERVISTE") return "RESERVIST";
  if (normalizedSanctionType === "BLACKLIST") return "BLACKLIST";
  if (normalizedSanctionType === "AVERT_ORAL_PLAYTIME" || normalizedSanctionType === "AVERT_ORAL_REUNION") {
    return "PLAYTIME_WARN";
  }
  if (normalizedSanctionType === "AVERT_LOURD" || normalizedSanctionType === "WARN_HEAVY") {
    return "WARN_HEAVY";
  }
  if (normalizedSanctionType === "AVERT_LEGER" || normalizedSanctionType === "WARN_LIGHT") {
    return "WARN_LIGHT";
  }
  if (normalizedSanctionType === "DEMOTE") return "DEMOTE";
  if (normalizedSanctionType === "EXCLUDE") return "EXCLUDE";
  if (normalizedSanctionType === "REMOVE_TEST_RANK") return "REMOVE_TEST_RANK";

  if (normalizedDecisionType === "NONE") return "MAINTAIN";
  if (normalizedDecisionType === "DEMOTE") return "DEMOTE";
  if (normalizedDecisionType === "EXCLUDE") return "EXCLUDE";
  if (normalizedDecisionType === "WARNING_ORAL") return "PLAYTIME_WARN";
  if (normalizedDecisionType === "WARNING") return "WARN_LIGHT";

  return "MAINTAIN";
}

function resolveLegacyAttendanceFromRow(row: MeetingRowLike) {
  return mapAttendanceStatusToLegacy(row.attendanceStatus ?? row.status);
}

function resolveBusinessDecisionFromRow(row: MeetingRowLike) {
  return mapStoredMeetingDecisionToBusinessDecision(row.decisionType, row.sanctionType);
}

export function computeMeetingCounts(rows: MeetingRowLike[]): MeetingCounts {
  const counts: MeetingCounts = {
    total: Array.isArray(rows) ? rows.length : 0,
    present: 0,
    late: 0,
    excused: 0,
    absentJustified: 0,
    absentUnjustified: 0,
    unknown: 0,
  };

  if (!Array.isArray(rows)) return counts;

  for (const row of rows) {
    const legacy = resolveLegacyAttendanceFromRow(row);
    if (legacy === "PRESENT") counts.present += 1;
    else if (legacy === "LATE") counts.late += 1;
    else if (legacy === "EXCUSED") counts.excused += 1;
    else if (legacy === "ABSENT_JUSTIFIED") counts.absentJustified += 1;
    else if (legacy === "ABSENT_UNJUSTIFIED") counts.absentUnjustified += 1;
    else counts.unknown += 1;
  }

  return counts;
}

export function computeMeetingSummary(
  rows: MeetingRowLike[],
  options?: { meetingDate?: Date | string | null; notes?: string | null }
): MeetingSummaryCounts {
  const safeRows = Array.isArray(rows) ? rows : [];
  const totalMembers = safeRows.length;
  const playtimeTotalMinutes = safeRows.reduce((sum, row) => sum + normalizeMinutes(row.playtimeMinutes), 0);
  const playtimeAverageMinutes = totalMembers > 0 ? Math.round(playtimeTotalMinutes / totalMembers) : 0;

  let justifiedCount = 0;
  let noActionCount = 0;
  let reminderCount = 0;
  let warningOralCount = 0;
  let warningCount = 0;
  let demoteCount = 0;
  let blacklistCount = 0;
  let reservistCount = 0;
  let excludeCount = 0;
  let otherCount = 0;
  let underThresholdCount = 0;

  const concernedCases: string[] = [];

  for (const row of safeRows) {
    const decisionType = normalizeDecisionType(row.decisionType);
    const playtimeMinutes = normalizeMinutes(row.playtimeMinutes);
    const legacyAttendance = resolveLegacyAttendanceFromRow(row);
    const justified =
      row.isJustified === true ||
      legacyAttendance === "ABSENT_JUSTIFIED" ||
      legacyAttendance === "EXCUSED";

    if (justified) justifiedCount += 1;
    if (playtimeMinutes < MEETING_PLAYTIME_THRESHOLD_MINUTES) underThresholdCount += 1;

    if (decisionType === "REMINDER") reminderCount += 1;
    else if (decisionType === "WARNING_ORAL") warningOralCount += 1;
    else if (decisionType === "WARNING") warningCount += 1;
    else if (decisionType === "DEMOTE") demoteCount += 1;
    else if (decisionType === "EXCLUDE") excludeCount += 1;
    else if (decisionType === "OTHER") otherCount += 1;
    else noActionCount += 1;

    const businessDecision = resolveBusinessDecisionFromRow(row);
    if (businessDecision === "BLACKLIST") blacklistCount += 1;
    else if (businessDecision === "RESERVIST") reservistCount += 1;

    if (decisionType !== "NONE" || justified || playtimeMinutes < MEETING_PLAYTIME_THRESHOLD_MINUTES) {
      concernedCases.push(
        `- ${normalizeText(row.rpNameSnapshot) ?? "Membre inconnu"} - ${formatMinutes(playtimeMinutes)} - ${businessDecisionLabel(businessDecision)}`
      );
    }
  }

  const meetingDate = options?.meetingDate ? new Date(options.meetingDate) : null;
  const meetingDateText =
    meetingDate && !Number.isNaN(meetingDate.getTime())
      ? meetingDate.toLocaleDateString("fr-BE")
      : "date inconnue";
  const notes = normalizeText(options?.notes);

  return {
    totalMembers,
    justifiedCount,
    noActionCount,
    reminderCount,
    warningOralCount,
    warningCount,
    demoteCount,
    blacklistCount,
    reservistCount,
    excludeCount,
    otherCount,
    sanctionedCount: totalMembers - noActionCount,
    playtimeTotalMinutes,
    playtimeAverageMinutes,
    underThresholdCount,
    summaryText: [
      `Reunion staff - ${meetingDateText}`,
      `Membres traites : ${totalMembers}`,
      `Justifies : ${justifiedCount}`,
      `Sans sanction : ${noActionCount}`,
      `Sous seuil : ${underThresholdCount}`,
      `Playtime total : ${formatMinutes(playtimeTotalMinutes)}`,
      `Playtime moyen : ${formatMinutes(playtimeAverageMinutes)}`,
      "",
      "Sanctions prises :",
      `- reminder : ${reminderCount}`,
      `- oral warning : ${warningOralCount}`,
      `- warning : ${warningCount}`,
      `- demote : ${demoteCount}`,
      `- blacklist : ${blacklistCount}`,
      `- reservist : ${reservistCount}`,
      `- exclude : ${excludeCount}`,
      `- other : ${otherCount}`,
      "",
      "Cas concernes :",
      ...(concernedCases.length > 0 ? concernedCases : ["- Aucun cas notable"]),
      ...(notes ? ["", "Notes finales :", `- ${notes}`] : []),
    ].join("\n"),
  };
}

export function parseAbsenceMeta(notes: string | null | undefined): AbsenceMeta {
  if (!notes) {
    return {
      v: 1,
      type: "GENERAL",
      meetingDate: null,
      memberNotes: null,
      rejectionReason: null,
      rejectedById: null,
      rejectedAt: null,
    };
  }

  try {
    const parsed = JSON.parse(notes) as Partial<AbsenceMeta>;
    const type = normalizeAbsenceType(parsed.type);
    return {
      v: 1,
      type,
      meetingDate: typeof parsed.meetingDate === "string" ? parsed.meetingDate : null,
      memberNotes: typeof parsed.memberNotes === "string" ? parsed.memberNotes : null,
      rejectionReason: typeof parsed.rejectionReason === "string" ? parsed.rejectionReason : null,
      rejectedById: typeof parsed.rejectedById === "string" ? parsed.rejectedById : null,
      rejectedAt: typeof parsed.rejectedAt === "string" ? parsed.rejectedAt : null,
    };
  } catch {
    return {
      v: 1,
      type: "GENERAL",
      meetingDate: null,
      memberNotes: notes,
      rejectionReason: null,
      rejectedById: null,
      rejectedAt: null,
    };
  }
}

export function computeAbsenceUiStatus(status: Nullable<string>, endAt: Date | string): AbsenceUiStatus {
  const normalizedStatus = String(status ?? "").trim().toUpperCase();
  const end = parseDateLike(endAt);

  if (normalizedStatus === "APPROVED" && end && end.getTime() < Date.now()) {
    return "EXPIRED";
  }
  if (normalizedStatus === "APPROVED") return "APPROVED";
  if (normalizedStatus === "REJECTED") return "REJECTED";
  if (normalizedStatus === "CANCELED") return "CANCELED";
  return "PENDING";
}

export function isApprovedAbsenceValidForMeeting(
  absence: { status?: string | null; startAt?: Date | string | null; endAt?: Date | string | null },
  meetingDate: Date | string
) {
  if (String(absence?.status ?? "").trim().toUpperCase() !== "APPROVED") return false;
  const meeting = parseDateLike(meetingDate);
  const start = parseDateLike(absence?.startAt ?? null);
  const end = parseDateLike(absence?.endAt ?? null);
  if (!meeting || !start || !end) return false;
  return start.getTime() <= meeting.getTime() && end.getTime() >= meeting.getTime();
}

export function buildMeetingClientRow(
  row: MeetingRowLike,
  options?: { targetGrade?: string | null; discordAvatarHash?: string | null }
) {
  const legacyStatus = toLegacyAttendanceStatus(row.attendanceStatus ?? row.status);
  const businessDecision = mapStoredMeetingDecisionToBusinessDecision(row.decisionType, row.sanctionType);

  return {
    id: row.id ?? null,
    discordId: normalizeText(row.discordIdSnapshot) ?? "",
    name: normalizeText(row.rpNameSnapshot) ?? "Membre inconnu",
    gradeLabel: normalizeText(row.gradeSnapshot),
    status: legacyStatus,
    note: normalizeText(row.staffNote) ?? "",
    playtimeMinutes: normalizeMinutes(row.playtimeMinutes),
    sanctionType: normalizeSanctionType(row.sanctionType),
    sanctionReason: normalizeText(row.sanctionReason) ?? "",
    decisionType: businessDecision,
    justified: row.isJustified === true,
    targetGrade: normalizeText(options?.targetGrade),
    discordAvatarHash: normalizeText(options?.discordAvatarHash),
    updatedAt:
      row.updatedAt instanceof Date
        ? row.updatedAt.toISOString()
        : normalizeText(typeof row.updatedAt === "string" ? row.updatedAt : null) ?? new Date(0).toISOString(),
  };
}
