"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AttendanceStatus =
  | "UNKNOWN"
  | "PRESENT"
  | "LATE"
  | "EXCUSED"
  | "ABSENT_JUSTIFIED"
  | "ABSENT_UNJUSTIFIED";

type AttendanceCounts = {
  total: number;
  present: number;
  late: number;
  excused: number;
  absentJustified: number;
  absentUnjustified: number;
  unknown: number;
};

type MeetingEntry = {
  discordId: string;
  name: string;
  status: AttendanceStatus;
  note: string;
  updatedAt: string;
};

type MeetingDetail = {
  id: string;
  scheduledAt: string;
  title: string;
  status: string;
  weekKey: string;
  locked: boolean;
  counts: AttendanceCounts;
  updatedAt: string;
  meetingNote: string | null;
  discord?: {
    channelId?: string | null;
    messageId?: string | null;
    lastPublishedAt?: string | null;
  };
  rows: MeetingEntry[];
};

type SheetResponse = {
  ok: boolean;
  meeting?: MeetingDetail;
  changed?: boolean;
  error?: string;
};

type PendingUpdate = Partial<Pick<MeetingEntry, "status" | "note">>;

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: "UNKNOWN", label: "Inconnu" },
  { value: "PRESENT", label: "Present" },
  { value: "LATE", label: "En retard" },
  { value: "EXCUSED", label: "Excuse" },
  { value: "ABSENT_JUSTIFIED", label: "Absent justifie" },
  { value: "ABSENT_UNJUSTIFIED", label: "Absent injustifie" },
];

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-BE");
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-BE");
}

function computeLastSeen(meeting: MeetingDetail | null, rows: MeetingEntry[]) {
  const times = rows.map((row) => row.updatedAt);
  if (meeting?.updatedAt) times.push(meeting.updatedAt);
  if (times.length === 0) return new Date().toISOString();
  return times.reduce((max, value) => (value > max ? value : max), times[0]);
}

export default function MeetingSheetClient({ meetingId }: { meetingId: string }) {
  const [meeting, setMeeting] = useState<MeetingDetail | null>(null);
  const [rows, setRows] = useState<MeetingEntry[]>([]);
  const [meetingNote, setMeetingNote] = useState("");
  const [loading, setLoading] = useState(false);
  const [savingRows, setSavingRows] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [closing, setClosing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [lastSyncAt, setLastSyncAt] = useState<string | null>(null);

  const pendingRef = useRef<Record<string, PendingUpdate>>({});
  const timerRef = useRef<number | null>(null);
  const noteTimerRef = useRef<number | null>(null);
  const lastSeenRef = useRef<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/meetings/${meetingId}`, { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as SheetResponse;
      if (!res.ok || !json?.ok || !json.meeting) {
        throw new Error(json?.error || "Failed to load");
      }
      setMeeting(json.meeting);
      setRows(json.meeting.rows ?? []);
      setMeetingNote(json.meeting.meetingNote ?? "");
      const lastSeen = computeLastSeen(json.meeting, json.meeting.rows ?? []);
      lastSeenRef.current = lastSeen;
      setLastSyncAt(lastSeen);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [meetingId]);

  function updateRow(discordId: string, patch: Partial<MeetingEntry>) {
    setRows((prev) =>
      prev.map((row) =>
        row.discordId === discordId
          ? { ...row, ...patch, updatedAt: new Date().toISOString() }
          : row
      )
    );
  }

  function queueRowUpdate(discordId: string, update: PendingUpdate) {
    if (meeting?.locked) return;
    pendingRef.current[discordId] = { ...pendingRef.current[discordId], ...update };

    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      void flushUpdates();
    }, 500);
  }

  async function flushUpdates() {
    const entries = Object.entries(pendingRef.current);
    if (entries.length === 0) return;
    pendingRef.current = {};
    setSavingRows(true);
    setError(null);

    try {
      const results = await Promise.all(
        entries.map(async ([discordId, patch]) => {
          const res = await fetch(`/api/staff/meetings/${meetingId}/row`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ discordId, ...patch }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json?.ok) {
            throw new Error(json?.error || "Save failed");
          }
          return { discordId, json };
        })
      );

      const updates = new Map<string, { status?: AttendanceStatus; note?: string; updatedAt: string }>();
      let nextCounts: AttendanceCounts | null = meeting?.counts ?? null;
      let nextUpdatedAt = meeting?.updatedAt ?? null;

      for (const result of results) {
        const updatedAt = String(result.json?.updatedAt ?? new Date().toISOString());
        const row = result.json?.row as MeetingEntry | null | undefined;
        if (row) {
          updates.set(result.discordId, {
            status: row.status,
            note: row.note,
            updatedAt,
          });
        } else {
          updates.set(result.discordId, { updatedAt });
        }

        if (result.json?.counts) nextCounts = result.json.counts;
        if (result.json?.updatedAt) nextUpdatedAt = result.json.updatedAt;
      }

      setRows((prev) =>
        prev.map((row) => {
          const update = updates.get(row.discordId);
          if (!update) return row;
          return {
            ...row,
            status: update.status ?? row.status,
            note: update.note ?? row.note,
            updatedAt: update.updatedAt,
          };
        })
      );

      if (meeting) {
        setMeeting((prev) =>
          prev
            ? {
                ...prev,
                counts: nextCounts ?? prev.counts,
                updatedAt: nextUpdatedAt ?? prev.updatedAt,
              }
            : prev
        );
      }

      const nextSeen = results.reduce((max: string, result) => {
        const updatedAt = String(result.json?.updatedAt ?? "");
        if (updatedAt && updatedAt > max) return updatedAt;
        return max;
      }, lastSeenRef.current ?? new Date().toISOString());

      lastSeenRef.current = nextSeen;
      setLastSyncAt(nextSeen);
      setLastSavedAt(new Date().toISOString());
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setSavingRows(false);
    }
  }

  async function saveMeetingNote(nextNote: string) {
    if (!meeting || meeting.locked) return;
    setSavingNote(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/meetings/${meetingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ meetingNote: nextNote }),
      });
      const json = (await res.json().catch(() => ({}))) as SheetResponse;
      if (!res.ok || !json?.ok || !json.meeting) {
        throw new Error(json?.error || "Save failed");
      }
      setMeeting((prev) =>
        prev
          ? {
              ...prev,
              meetingNote: nextNote,
              updatedAt: json.meeting?.updatedAt ?? prev.updatedAt,
              counts: json.meeting?.counts ?? prev.counts,
              status: json.meeting?.status ?? prev.status,
              locked: json.meeting?.locked ?? prev.locked,
            }
          : prev
      );

      const nextSeen = json.meeting?.updatedAt ?? new Date().toISOString();
      lastSeenRef.current = nextSeen;
      setLastSyncAt(nextSeen);
      setLastSavedAt(new Date().toISOString());
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setSavingNote(false);
    }
  }

  function queueMeetingNote(nextNote: string) {
    setMeetingNote(nextNote);
    if (meeting?.locked) return;
    if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current);
    noteTimerRef.current = window.setTimeout(() => {
      void saveMeetingNote(nextNote);
    }, 500);
  }

  async function poll() {
    if (savingRows || savingNote || Object.keys(pendingRef.current).length > 0) return;
    const lastSeen = lastSeenRef.current;
    if (!lastSeen) return;

    const res = await fetch(`/api/staff/meetings/${meetingId}/poll?after=${encodeURIComponent(lastSeen)}`, {
      cache: "no-store",
    });
    const json = (await res.json().catch(() => ({}))) as SheetResponse;
    if (!res.ok || !json?.ok) return;
    if (!json.changed || !json.meeting) return;

    setMeeting(json.meeting);
    setRows(json.meeting.rows ?? []);
    setMeetingNote(json.meeting.meetingNote ?? "");
    const nextSeen = computeLastSeen(json.meeting, json.meeting.rows ?? []);
    lastSeenRef.current = nextSeen;
    setLastSyncAt(nextSeen);
  }

  useEffect(() => {
    const id = window.setInterval(() => {
      poll().catch(() => null);
    }, 1500);
    return () => window.clearInterval(id);
  }, [meetingId, savingRows, savingNote]);

  async function closeMeeting() {
    if (closing || meeting?.locked) return;
    setClosing(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/meetings/${meetingId}/close`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Close failed");
      setMeeting((prev) =>
        prev
          ? {
              ...prev,
              status: json.meeting?.status ?? prev.status,
              locked: true,
              updatedAt: json.meeting?.updatedAt ?? prev.updatedAt,
            }
          : prev
      );
      const nextSeen = json.meeting?.updatedAt ?? new Date().toISOString();
      lastSeenRef.current = nextSeen;
      setLastSyncAt(nextSeen);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setClosing(false);
    }
  }

  async function publishMeeting() {
    if (publishing) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/meetings/${meetingId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Publish failed");
      setLastSavedAt(new Date().toISOString());
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setPublishing(false);
    }
  }

  const counts = meeting?.counts ?? {
    total: 0,
    present: 0,
    late: 0,
    excused: 0,
    absentJustified: 0,
    absentUnjustified: 0,
    unknown: 0,
  };

  const statusLabel = useMemo(() => {
    if (!meeting) return "";
    if (meeting.locked) return `${meeting.status} (verrouille)`;
    return meeting.status;
  }, [meeting]);

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div>
          <h1 style={{ margin: 0 }}>{meeting?.title || "Reunion"}</h1>
          <div style={{ opacity: 0.7, fontSize: 12 }}>
            Semaine: <b>{meeting?.weekKey ?? "-"}</b> | Date:{" "}
            <b>{meeting ? fmtDate(meeting.scheduledAt) : "-"}</b> | Statut:{" "}
            <b>{statusLabel || "-"}</b> | Derniere sync:{" "}
            <b>{lastSyncAt ? fmtDateTime(lastSyncAt) : "-"}</b>
            {meeting?.discord?.lastPublishedAt ? (
              <>
                {" "}
                | Publie: <b>{fmtDateTime(meeting.discord.lastPublishedAt)}</b>
              </>
            ) : null}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
          <button type="button" onClick={load} disabled={loading}>
            {loading ? "Loading..." : "Refresh"}
          </button>
          <button type="button" onClick={publishMeeting} disabled={publishing || !meeting}>
            {publishing ? "Publishing..." : "Publier Discord"}
          </button>
          {!meeting?.locked ? (
            <button type="button" onClick={closeMeeting} disabled={closing}>
              {closing ? "Closing..." : "Clore reunion"}
            </button>
          ) : null}
          {savingRows || savingNote ? <span style={{ fontSize: 12, opacity: 0.7 }}>Saving...</span> : null}
          {lastSavedAt ? <span style={{ fontSize: 12, opacity: 0.7 }}>Saved {fmtDateTime(lastSavedAt)}</span> : null}
        </div>
      </div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 13, opacity: 0.8 }}>
        <div>
          Membres: <b>{counts.total}</b>
        </div>
        <div>
          Presents: <b>{counts.present}</b>
        </div>
        <div>
          Retards: <b>{counts.late}</b>
        </div>
        <div>
          Excuses: <b>{counts.excused}</b>
        </div>
        <div>
          Absents justifies: <b>{counts.absentJustified}</b>
        </div>
        <div>
          Absents injustifies: <b>{counts.absentUnjustified}</b>
        </div>
        <div>
          Inconnus: <b>{counts.unknown}</b>
        </div>
      </div>

      <div>
        <label style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Notes</label>
        <textarea
          value={meetingNote}
          onChange={(e) => queueMeetingNote(e.target.value)}
          disabled={Boolean(meeting?.locked)}
          rows={3}
          style={{ width: "100%", maxWidth: 720 }}
        />
      </div>

      {error ? (
        <div style={{ padding: 10, border: "1px solid #f2bcbc", background: "#fff5f5" }}>{error}</div>
      ) : null}

      <div style={{ overflowX: "auto", border: "1px solid #e5e5e5", borderRadius: 12 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f7f7f7", position: "sticky", top: 0, zIndex: 1 }}>
              <th style={{ padding: 8, textAlign: "left" }}>Nom</th>
              <th style={{ padding: 8, textAlign: "left" }}>Statut</th>
              <th style={{ padding: 8, textAlign: "left" }}>Note</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.discordId}>
                <td style={{ padding: 6, fontWeight: 600 }}>{row.name || "Unknown"}</td>
                <td style={{ padding: 6 }}>
                  <select
                    value={row.status}
                    onChange={(e) => {
                      const value = e.target.value as AttendanceStatus;
                      updateRow(row.discordId, { status: value });
                      queueRowUpdate(row.discordId, { status: value });
                    }}
                    disabled={Boolean(meeting?.locked)}
                  >
                    {STATUS_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </td>
                <td style={{ padding: 6 }}>
                  <input
                    value={row.note ?? ""}
                    onChange={(e) => {
                      const value = e.target.value;
                      updateRow(row.discordId, { note: value });
                      queueRowUpdate(row.discordId, { note: value });
                    }}
                    style={{ width: 260 }}
                    disabled={Boolean(meeting?.locked)}
                  />
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} style={{ padding: 10, opacity: 0.7 }}>
                  No members found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
