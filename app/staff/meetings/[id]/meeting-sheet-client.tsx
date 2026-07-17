"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  FileText,
  Megaphone,
  RefreshCw,
  ShieldCheck,
  Users,
} from "lucide-react";
import { DataTile } from "@/components/staff/ui/DataTile";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { LoadingState } from "@/components/staff/ui/LoadingState";
import { MotionButtonFrame, MotionSection } from "@/components/staff/ui/motion";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { StyledSelect } from "@/components/staff/ui/StyledSelect";

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
  playtimeMinutes: number;
  /** Seuil de playtime perso (exception ≠ 300) accordé à ce membre, sinon null. */
  playtimeRequiredMinutes?: number | null;
  sanctionType?: string | null;
  sanctionReason?: string;
  decisionType: string;
  justified?: boolean;
  updatedAt: string;
};

const DECISION_LABELS: Record<string, string> = {
  MAINTAIN: "Maintenir",
  PROMOTE: "Promotion",
  DEMOTE: "Démote",
  EXCLUDE: "Exclusion",
  WARN_LIGHT: "Avertissement léger",
  WARN_HEAVY: "Avertissement lourd",
  BLACKLIST: "Blacklist",
  RESERVIST: "Réserviste",
  PLAYTIME_WARN: "Avertissement playtime",
  UP: "Up",
  DOUBLE_UP: "Double Up",
  WEEK_VALID_1: "Semaine validée (1)",
  WEEK_VALID_2: "Semaine validée (2)",
  WEEK_VALID_3: "Semaine validée (3)",
  WEEK_INVALID: "Semaine non validée",
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

type PendingUpdate = Partial<Pick<MeetingEntry, "status" | "note" | "playtimeMinutes" | "decisionType">>;

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: "UNKNOWN", label: "Inconnu" },
  { value: "PRESENT", label: "Présent" },
  { value: "LATE", label: "En retard" },
  { value: "EXCUSED", label: "Excusé" },
  { value: "ABSENT_JUSTIFIED", label: "Absent justifié" },
  { value: "ABSENT_UNJUSTIFIED", label: "Absent injustifié" },
];

const DECISION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "MAINTAIN", label: "Maintien" },
  { value: "UP", label: "Up" },
  { value: "DOUBLE_UP", label: "Double Up" },
  { value: "WEEK_VALID_1", label: "Semaine validée (1)" },
  { value: "WEEK_VALID_2", label: "Semaine validée (2)" },
  { value: "WEEK_VALID_3", label: "Semaine validée (3)" },
  { value: "WEEK_INVALID", label: "Semaine non validée" },
  { value: "WARN_LIGHT", label: "Avertissement léger" },
  { value: "WARN_HEAVY", label: "Avertissement lourd" },
  { value: "DEMOTE", label: "Démote" },
  { value: "BLACKLIST", label: "Blacklist" },
  { value: "RESERVIST", label: "Réserviste" },
  { value: "PLAYTIME_WARN", label: "Avertissement playtime" },
];

function fmtDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("fr-BE");
}

function fmtDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("fr-BE");
}

function decisionLabel(value?: string | null) {
  return DECISION_LABELS[String(value ?? "").toUpperCase()] ?? "Maintenir";
}

function getAttendanceLabel(status: AttendanceStatus) {
  return STATUS_OPTIONS.find((option) => option.value === status)?.label ?? status;
}

function getAttendanceTone(status: AttendanceStatus) {
  if (status === "PRESENT") return "success" as const;
  if (status === "LATE") return "info" as const;
  if (status === "EXCUSED" || status === "ABSENT_JUSTIFIED") return "warning" as const;
  if (status === "ABSENT_UNJUSTIFIED") return "danger" as const;
  return "neutral" as const;
}

function getMeetingTone(status: string, locked: boolean) {
  if (locked) return "accent" as const;
  const key = String(status).toUpperCase();
  if (key === "FINAL" || key === "CLOSED") return "success" as const;
  if (key === "DRAFT") return "warning" as const;
  if (key === "IN_PROGRESS") return "info" as const;
  return "neutral" as const;
}

function getDecisionTone(value?: string | null) {
  const key = String(value ?? "").toUpperCase();
  if (["UP", "DOUBLE_UP", "WEEK_VALID_1", "WEEK_VALID_2", "WEEK_VALID_3", "RESERVIST"].includes(key)) {
    return "success" as const;
  }
  if (["WARN_LIGHT", "WARN_HEAVY", "PLAYTIME_WARN", "WEEK_INVALID"].includes(key)) {
    return "warning" as const;
  }
  if (["DEMOTE", "BLACKLIST", "EXCLUDE"].includes(key)) {
    return "danger" as const;
  }
  return "neutral" as const;
}

function getSelectClass(tone: "neutral" | "info" | "success" | "warning" | "danger") {
  if (tone === "success") return "border-emerald-500/25 bg-emerald-500/10 text-emerald-100";
  if (tone === "info") return "border-cyan-500/25 bg-cyan-500/10 text-cyan-100";
  if (tone === "warning") return "border-amber-500/25 bg-amber-500/10 text-amber-100";
  if (tone === "danger") return "border-red-500/25 bg-red-500/10 text-red-100";
  return "border-white/10 bg-white/[0.04] text-slate-100";
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
    void load();
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

      const updates = new Map<string, { status?: AttendanceStatus; note?: string; playtimeMinutes?: number; decisionType?: string; updatedAt: string }>();
      let nextCounts: AttendanceCounts | null = meeting?.counts ?? null;
      let nextUpdatedAt = meeting?.updatedAt ?? null;

      for (const result of results) {
        const updatedAt = String(result.json?.updatedAt ?? new Date().toISOString());
        const row = result.json?.row as MeetingEntry | null | undefined;
        if (row) {
          updates.set(result.discordId, {
            status: row.status,
            note: row.note,
            playtimeMinutes: row.playtimeMinutes,
            decisionType: row.decisionType,
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
            playtimeMinutes: update.playtimeMinutes ?? row.playtimeMinutes,
            decisionType: update.decisionType ?? row.decisionType,
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
      void poll().catch(() => null);
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
    if (meeting.locked) return `${meeting.status} (verrouillée)`;
    return meeting.status;
  }, [meeting]);

  const canPublish = meeting?.status === "CLOSED" || meeting?.status === "FINAL";
  const canClose = meeting?.status === "DRAFT" || meeting?.status === "IN_PROGRESS";

  if (loading && !meeting) {
    return (
      <LoadingState
        title="Chargement de la feuille de réunion"
        description="Récupération des présences, décisions et notes de la réunion staff."
      />
    );
  }

  if (!loading && !meeting) {
    return (
      <EmptyState
        icon={<CalendarDays className="h-12 w-12" />}
        title="Réunion introuvable"
        description="La feuille demandée n'est plus disponible ou n'a pas pu être chargée."
      />
    );
  }

  return (
    <div className="grid gap-6">
      <SectionCard
        title={meeting?.title || "Réunion staff"}
        description="Pilotage des présences, décisions et publication Discord de la réunion en cours."
        icon={CalendarDays}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <MotionButtonFrame>
              <button
                type="button"
                onClick={() => void load()}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
                {loading ? "Chargement..." : "Actualiser"}
              </button>
            </MotionButtonFrame>
            <MotionButtonFrame>
              <button
                type="button"
                onClick={publishMeeting}
                disabled={publishing || !meeting || !canPublish}
                className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-500/15 disabled:opacity-50"
              >
                <Megaphone className="h-4 w-4" />
                {publishing ? "Publication..." : "Publier Discord"}
              </button>
            </MotionButtonFrame>
            {canClose ? (
              <MotionButtonFrame>
                <button
                  type="button"
                  onClick={closeMeeting}
                  disabled={closing}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-500/15 disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {closing ? "Clôture..." : "Clore réunion"}
                </button>
              </MotionButtonFrame>
            ) : null}
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <DataTile label="Semaine" value={meeting?.weekKey ?? "-"} tone="info" />
          <DataTile label="Date" value={meeting ? fmtDate(meeting.scheduledAt) : "-"} />
          <DataTile
            label="Statut"
            value={<StatusBadge tone={getMeetingTone(meeting?.status ?? "", Boolean(meeting?.locked))}>{statusLabel || "-"}</StatusBadge>}
          />
          <DataTile label="Dernière synchronisation" value={lastSyncAt ? fmtDateTime(lastSyncAt) : "-"} />
          <DataTile
            label="Dernière publication"
            value={meeting?.discord?.lastPublishedAt ? fmtDateTime(meeting.discord.lastPublishedAt) : "Non publiée"}
            tone={meeting?.discord?.lastPublishedAt ? "success" : "warning"}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {savingRows || savingNote ? <StatusBadge tone="info">Sauvegarde en cours</StatusBadge> : null}
          {lastSavedAt ? <StatusBadge>Dernier enregistrement: {fmtDateTime(lastSavedAt)}</StatusBadge> : null}
          {meeting?.locked ? <StatusBadge tone="accent">Réunion verrouillée</StatusBadge> : null}
        </div>
      </SectionCard>

      <MotionSection delay={0.03}>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          <DataTile label="Membres" value={counts.total} />
          <DataTile label="Présents" value={counts.present} tone="success" />
          <DataTile label="Retards" value={counts.late} tone="info" />
          <DataTile label="Excusés" value={counts.excused} tone="warning" />
          <DataTile label="Absents justifiés" value={counts.absentJustified} tone="warning" />
          <DataTile label="Absents injustifiés" value={counts.absentUnjustified} tone="danger" />
          <DataTile label="Inconnus" value={counts.unknown} />
        </div>
      </MotionSection>

      <SectionCard
        title="Notes de réunion"
        description="Notes globales liées à cette réunion."
        icon={FileText}
      >
        <textarea
          value={meetingNote}
          onChange={(event) => queueMeetingNote(event.target.value)}
          disabled={Boolean(meeting?.locked)}
          rows={4}
          className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
          placeholder="Ajouter une note globale sur le déroulé de la réunion..."
        />
      </SectionCard>

      {error ? (
        <SectionCard title="Erreur" description="Une opération réunion a échoué." icon={AlertTriangle}>
          <div className="flex items-center gap-2 text-sm text-red-200">
            <StatusBadge tone="danger">Erreur runtime</StatusBadge>
            <span>{error}</span>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title={`Feuille de présence (${rows.length})`}
        description="Statuts, temps de jeu, décisions et notes par membre de la réunion."
        icon={Users}
      >
        {rows.length === 0 ? (
          <EmptyState
            icon={<Users className="h-12 w-12" />}
            title="Aucun membre chargé"
            description="Aucune ligne membre n'est disponible pour cette réunion."
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.03]">
            <table className="min-w-full border-collapse text-sm">
              <thead>
                <tr className="bg-white/[0.03] text-left">
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Nom</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Statut</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Playtime (min)</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Décision</th>
                  <th className="px-4 py-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Note</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const attendanceTone = getAttendanceTone(row.status);
                  const decisionTone = getDecisionTone(row.decisionType);

                  return (
                    <tr key={row.discordId} className="border-t border-white/8 align-top">
                      <td className="px-4 py-3">
                        <div className="font-semibold text-slate-100">{row.name || "Inconnu"}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                          <span>{fmtDateTime(row.updatedAt)}</span>
                          {row.sanctionType ? <StatusBadge tone="warning">Sanction: {row.sanctionType}</StatusBadge> : null}
                          {row.justified ? <StatusBadge tone="info">Justifié</StatusBadge> : null}
                        </div>
                        {row.sanctionReason ? <div className="mt-2 text-xs text-slate-400">{row.sanctionReason}</div> : null}
                      </td>
                      <td className="px-4 py-3">
                        {meeting?.locked ? (
                          <StatusBadge tone={attendanceTone}>{getAttendanceLabel(row.status)}</StatusBadge>
                        ) : (
                          <StyledSelect
                            value={row.status}
                            onChange={(event) => {
                              const value = event.target.value as AttendanceStatus;
                              updateRow(row.discordId, { status: value });
                              queueRowUpdate(row.discordId, { status: value });
                            }}
                            disabled={Boolean(meeting?.locked)}
                            className={`min-w-[170px] rounded-xl border px-3 py-2 text-sm font-medium focus:outline-none ${getSelectClass(attendanceTone)}`}
                          >
                            {STATUS_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value} className="bg-slate-950 text-slate-100">
                                {option.label}
                              </option>
                            ))}
                          </StyledSelect>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={Number.isFinite(row.playtimeMinutes) ? row.playtimeMinutes : 0}
                          onChange={(event) => {
                            const value = Math.max(0, Math.round(Number(event.target.value || 0)));
                            updateRow(row.discordId, { playtimeMinutes: value });
                            queueRowUpdate(row.discordId, { playtimeMinutes: value });
                          }}
                          disabled={Boolean(meeting?.locked)}
                          className="w-28 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                        />
                        {row.playtimeRequiredMinutes ? (
                          <div
                            className="mt-1.5 inline-flex items-center gap-1 rounded border border-cyan-500/35 bg-cyan-500/12 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200"
                            title={`Exception : ${row.playtimeRequiredMinutes} min requis pour ce membre (au lieu de 300).`}
                          >
                            seuil perso {row.playtimeRequiredMinutes}m
                          </div>
                        ) : (
                          <div className="mt-1.5 text-[10px] text-slate-500">seuil 300m</div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {meeting?.locked ? (
                          <StatusBadge tone={decisionTone}>{decisionLabel(row.decisionType)}</StatusBadge>
                        ) : (
                          <StyledSelect
                            value={row.decisionType || "MAINTAIN"}
                            onChange={(event) => {
                              const value = event.target.value;
                              updateRow(row.discordId, { decisionType: value });
                              queueRowUpdate(row.discordId, { decisionType: value });
                            }}
                            disabled={Boolean(meeting?.locked)}
                            className={`min-w-[220px] rounded-xl border px-3 py-2 text-sm font-semibold focus:outline-none ${getSelectClass(decisionTone)}`}
                          >
                            {DECISION_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value} className="bg-slate-950 text-slate-100">
                                {option.label}
                              </option>
                            ))}
                          </StyledSelect>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <input
                          value={row.note ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            updateRow(row.discordId, { note: value });
                            queueRowUpdate(row.discordId, { note: value });
                          }}
                          disabled={Boolean(meeting?.locked)}
                          className="w-[260px] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/40 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                          placeholder="Ajouter une note staff"
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>

      <MotionSection delay={0.05} className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Clock3 className="h-4 w-4" />
        <span>Autosynchronisation active toutes les 1.5 secondes tant qu'aucune modification locale n'est en attente.</span>
      </MotionSection>
    </div>
  );
}