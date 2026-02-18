import { getIsoWeekKey } from "@/lib/isoWeek";

export type AttendanceStatus =
  | "UNKNOWN"
  | "PRESENT"
  | "LATE"
  | "EXCUSED"
  | "ABSENT_JUSTIFIED"
  | "ABSENT_UNJUSTIFIED";

export type MeetingNotesRow = {
  discordId: string;
  name: string;
  status: AttendanceStatus;
  note: string;
};

export type MeetingNotesPayload = {
  version: 1;
  weekKey: string;
  title?: string | null;
  status?: string | null;
  lockedAt: string | null;
  meetingNote?: string | null;
  discord?: {
    channelId?: string | null;
    messageId?: string | null;
    threadId?: string | null;
    lastPublishedAt?: string | null;
  };
  rows: MeetingNotesRow[];
};

export type AttendanceCounts = {
  total: number;
  present: number;
  late: number;
  excused: number;
  absentJustified: number;
  absentUnjustified: number;
  unknown: number;
};

const CLOSED_STATUSES = new Set(["DONE", "CANCELED", "CLOSED", "LOCKED"]);
export const DEFAULT_MEETING_FAMILY_ID = "esperados";

export function getISOWeekKey(date: Date) {
  return getIsoWeekKey(date);
}

function normalizeStatus(value: unknown): AttendanceStatus {
  const raw = String(value ?? "").trim().toUpperCase();
  const allowed: AttendanceStatus[] = [
    "UNKNOWN",
    "PRESENT",
    "LATE",
    "EXCUSED",
    "ABSENT_JUSTIFIED",
    "ABSENT_UNJUSTIFIED",
  ];
  return allowed.includes(raw as AttendanceStatus) ? (raw as AttendanceStatus) : "UNKNOWN";
}

function normalizeRow(raw: any): MeetingNotesRow | null {
  const discordId = String(raw?.discordId ?? "").trim();
  if (!discordId) return null;
  const name = String(raw?.name ?? "").trim() || "Unknown";
  const status = normalizeStatus(raw?.status);
  const note = String(raw?.note ?? "").trim();
  return { discordId, name, status, note };
}

function parseMeetingPayloadInternal(notes: string | null | undefined): MeetingNotesPayload {
  if (!notes) {
    return {
      version: 1,
      weekKey: "",
      lockedAt: null,
      meetingNote: null,
      rows: [],
    };
  }

  try {
    const parsed = JSON.parse(notes);
    if (!parsed || typeof parsed !== "object") {
      return {
        version: 1,
        weekKey: "",
        lockedAt: null,
        meetingNote: null,
        rows: [],
      };
    }

    const rows = Array.isArray(parsed.rows)
      ? (parsed.rows.map(normalizeRow).filter(Boolean) as MeetingNotesRow[])
      : [];

    const discordRaw = parsed.discord ?? {};
    const discord =
      typeof discordRaw === "object" && discordRaw
        ? {
            channelId: discordRaw.channelId ? String(discordRaw.channelId) : null,
            messageId: discordRaw.messageId ? String(discordRaw.messageId) : null,
            threadId: discordRaw.threadId ? String(discordRaw.threadId) : null,
            lastPublishedAt: discordRaw.lastPublishedAt
              ? String(discordRaw.lastPublishedAt)
              : null,
          }
        : {};

    return {
      version: 1,
      weekKey: String(parsed.weekKey ?? ""),
      title: parsed.title ? String(parsed.title) : null,
      status: parsed.status ? String(parsed.status) : null,
      lockedAt: parsed.lockedAt ? String(parsed.lockedAt) : null,
      meetingNote: parsed.meetingNote ? String(parsed.meetingNote) : null,
      discord,
      rows,
    };
  } catch {
    return {
      version: 1,
      weekKey: "",
      lockedAt: null,
      meetingNote: notes,
      discord: {},
      rows: [],
    };
  }
}

export function parseMeetingPayload(notes: string | null | undefined): MeetingNotesPayload {
  return parseMeetingPayloadInternal(notes);
}

export function parseMeetingNotes(notes: string | null | undefined): MeetingNotesPayload {
  return parseMeetingPayloadInternal(notes);
}

export function serializeMeetingNotes(payload: MeetingNotesPayload) {
  const data = {
    version: payload.version,
    weekKey: payload.weekKey,
    title: payload.title ?? null,
    status: payload.status ?? null,
    lockedAt: payload.lockedAt,
    meetingNote: payload.meetingNote ?? null,
    discord: payload.discord ?? {},
    rows: payload.rows,
  };
  return JSON.stringify(data);
}

export function buildMeetingDTO(params: {
  id: string;
  meetingDate: Date;
  weekKey: string;
  notes: string | null;
  updatedAt: Date;
}) {
  const payload = parseMeetingPayload(params.notes);
  const title = payload.title?.trim() || `Réunion ${params.weekKey}`;
  const status = (payload.status ?? "OPEN").trim() || "OPEN";
  const locked = isMeetingLocked(status, payload.lockedAt ?? null);
  const counts = computeAttendanceCounts(payload.rows);

  return {
    id: params.id,
    scheduledAt: params.meetingDate.toISOString(),
    title,
    status,
    weekKey: params.weekKey,
    locked,
    counts,
    updatedAt: params.updatedAt.toISOString(),
    meetingNote: payload.meetingNote ?? "",
    discord: payload.discord ?? {},
  };
}

export function ensureRows(
  payload: MeetingNotesPayload,
  members: Array<{ discordId: string | null; rpName: string | null }>
) {
  const map = new Map(payload.rows.map((row) => [row.discordId, { ...row }]));

  for (const member of members) {
    const discordId = String(member.discordId ?? "").trim();
    if (!discordId) continue;
    const name = String(member.rpName ?? "").trim() || "Unknown";
    const existing = map.get(discordId);
    if (existing) {
      if (!existing.name || existing.name === "Unknown") {
        existing.name = name;
      }
      map.set(discordId, existing);
    } else {
      map.set(discordId, { discordId, name, status: "UNKNOWN", note: "" });
    }
  }

  const rows = Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));

  return { ...payload, rows };
}

export function computeAttendanceCounts(rows: MeetingNotesRow[]): AttendanceCounts {
  const counts: AttendanceCounts = {
    total: rows.length,
    present: 0,
    late: 0,
    excused: 0,
    absentJustified: 0,
    absentUnjustified: 0,
    unknown: 0,
  };

  for (const row of rows) {
    if (row.status === "PRESENT") counts.present += 1;
    else if (row.status === "LATE") counts.late += 1;
    else if (row.status === "EXCUSED") counts.excused += 1;
    else if (row.status === "ABSENT_JUSTIFIED") counts.absentJustified += 1;
    else if (row.status === "ABSENT_UNJUSTIFIED") counts.absentUnjustified += 1;
    else counts.unknown += 1;
  }

  return counts;
}

export function isMeetingLocked(status: string, lockedAt: string | null) {
  if (lockedAt) return true;
  const normalized = String(status ?? "").trim().toUpperCase();
  return CLOSED_STATUSES.has(normalized);
}
