"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  CalendarDays,
  Clock3,
  FileText,
  Filter,
  Gavel,
  Megaphone,
  Save,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Users,
} from "lucide-react";
import { DataTile } from "@/components/staff/ui/DataTile";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { LoadingState } from "@/components/staff/ui/LoadingState";
import { MotionButtonFrame, MotionSection } from "@/components/staff/ui/motion";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { StyledSelect } from "@/components/staff/ui/StyledSelect";
import { getDiscordAvatarUrl } from "@/lib/discord/getDiscordAvatarUrl";
import { getDiscordGradeMappings } from "@/lib/discord-grade";

// ─── Types ────────────────────────────────────────────────────────────────────

type AttendanceStatus =
  | "UNKNOWN"
  | "PRESENT"
  | "LATE"
  | "EXCUSED"
  | "ABSENT_JUSTIFIED"
  | "ABSENT_UNJUSTIFIED";

type MeetingStatus = "DRAFT" | "IN_PROGRESS" | "CLOSED" | "CANCELED" | "FINAL";

type MeetingDecisionType =
  | "MAINTAIN"
  | "DEMOTE"
  | "EXCLUDE"
  | "REMOVE_TEST_RANK"
  | "WARN_LIGHT"
  | "WARN_HEAVY"
  | "BLACKLIST"
  | "RESERVIST"
  | "PLAYTIME_WARN"
  | "UP"
  | "DOUBLE_UP"
  | "WEEK_VALID_1"
  | "WEEK_VALID_2"
  | "WEEK_VALID_3"
  | "WEEK_INVALID";

type MeetingRow = {
  id: string | null;
  discordId: string;
  name: string;
  gradeLabel?: string | null;
  targetGrade?: string | null;
  discordAvatarHash?: string | null;
  status: AttendanceStatus;
  note: string;
  playtimeMinutes: number;
  decisionType: MeetingDecisionType;
  sanctionReason: string;
  updatedAt: string;
  continuity?: {
    lastMeetingAt: string | null;
    lastDecision: string | null;
    lastDecisionLabel: string | null;
    lastSanctionAt: string | null;
    currentSanctionStatus: string | null;
    validatedWeeksCount: number;
    invalidatedWeeksCount: number;
    continuityIndicator: string | null;
    recentMeetingHistory: Array<{
      meetingId: string;
      meetingTitle: string;
      weekKey: string;
      scheduledAt: string;
      decision: string;
      decisionLabel: string;
      targetGrade: string | null;
      sanctionReason: string | null;
    }>;
  } | null;
};

type AttendanceCounts = {
  total: number;
  present: number;
  late: number;
  excused: number;
  absentJustified: number;
  absentUnjustified: number;
  unknown: number;
};

type MeetingMeta = {
  id: string;
  title: string;
  weekKey: string;
  scheduledAt: string;
  status: MeetingStatus;
  locked: boolean;
  meetingNote: string | null;
  counts: AttendanceCounts;
  updatedAt: string;
  discord?: {
    channelId?: string | null;
    messageId?: string | null;
    lastPublishedAt?: string | null;
  };
};

type MeetingDetailResponse = {
  ok: boolean;
  meeting?: MeetingMeta & { rows: MeetingRow[] };
  error?: string;
};

// ─── Constants ────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: Array<{ value: AttendanceStatus; label: string }> = [
  { value: "UNKNOWN",            label: "Inconnu" },
  { value: "PRESENT",            label: "Présent" },
  { value: "LATE",               label: "En retard" },
  { value: "EXCUSED",            label: "Excusé" },
  { value: "ABSENT_JUSTIFIED",   label: "Absent justifié" },
  { value: "ABSENT_UNJUSTIFIED", label: "Absent injustifié" },
];

const MEETING_STATUS_LABELS_FR: Record<MeetingStatus, string> = {
  DRAFT: "Brouillon",
  IN_PROGRESS: "En cours",
  CLOSED: "Clôturée",
  CANCELED: "Annulée",
  FINAL: "Finalisée",
};

const GRADE_LEVEL_BY_NAME = new Map(
  getDiscordGradeMappings().map((entry, index, arr) => [entry.grade.toLowerCase(), arr.length - index])
);
const TARGET_GRADE_OPTIONS = Array.from(
  new Map(
    getDiscordGradeMappings()
      .map((entry) => String(entry.grade ?? "").trim())
      .filter(Boolean)
      .map((grade) => [grade.toLowerCase(), { value: grade, label: grade }])
  ).values()
);
const TARGET_GRADE_INDEX = new Map(TARGET_GRADE_OPTIONS.map((option, index) => [option.value.toLowerCase(), index]));

const DECISION_OPTIONS: Array<{ value: MeetingDecisionType; label: string; color: string; bg: string }> = [
  { value: "MAINTAIN",      label: "Maintenir",           color: "#475569", bg: "#f1f5f9" },
  { value: "UP",            label: "Up",                  color: "#166534", bg: "#dcfce7" },
  { value: "DOUBLE_UP",     label: "Double Up",           color: "#166534", bg: "#bbf7d0" },
  { value: "WEEK_VALID_1",  label: "Semaine validée (1)", color: "#1d4ed8", bg: "#dbeafe" },
  { value: "WEEK_VALID_2",  label: "Semaine validée (2)", color: "#1d4ed8", bg: "#dbeafe" },
  { value: "WEEK_VALID_3",  label: "Semaine validée (3)", color: "#1d4ed8", bg: "#dbeafe" },
  { value: "WEEK_INVALID",  label: "Semaine non validée", color: "#b91c1c", bg: "#fee2e2" },
  { value: "WARN_LIGHT",    label: "Avertissement léger", color: "#92400e", bg: "#fef3c7" },
  { value: "WARN_HEAVY",    label: "Avertissement lourd", color: "#b45309", bg: "#fde68a" },
  { value: "DEMOTE",        label: "Démote",              color: "#b91c1c", bg: "#fee2e2" },
  { value: "REMOVE_TEST_RANK", label: "Retirer rang En test", color: "#0369a1", bg: "#e0f2fe" },
  { value: "BLACKLIST",     label: "Blacklist",           color: "#7f1d1d", bg: "#fecaca" },
  { value: "RESERVIST",     label: "Réserviste",          color: "#166534", bg: "#dcfce7" },
  { value: "PLAYTIME_WARN", label: "Averto playtime",     color: "#c2410c", bg: "#ffedd5" },
  { value: "EXCLUDE",       label: "Exclusion",           color: "#7f1d1d", bg: "#fecaca" },
];

function getDecisionMeta(value: string | null | undefined) {
  return DECISION_OPTIONS.find((o) => o.value === value) ?? DECISION_OPTIONS[0];
}

function isStrongDecision(value: MeetingDecisionType | "NONE") {
  return value === "UP" || value === "WARN_LIGHT" || value === "WARN_HEAVY" || value === "BLACKLIST" || value === "DEMOTE";
}

function isPromotionDecision(value: MeetingDecisionType | "NONE") {
  return value === "UP" || value === "DOUBLE_UP";
}

function normalizeTargetGrade(value: string | null | undefined) {
  const normalized = String(value ?? "").trim().toLowerCase();
  if (!normalized) return null;
  return TARGET_GRADE_OPTIONS.find((option) => option.value.toLowerCase() === normalized)?.value ?? null;
}

function getPromotionTargetOptions(currentGradeLabel: string | null | undefined) {
  const normalizedCurrent = normalizeTargetGrade(currentGradeLabel);
  if (!normalizedCurrent) return TARGET_GRADE_OPTIONS;
  const currentIndex = TARGET_GRADE_INDEX.get(normalizedCurrent.toLowerCase());
  if (typeof currentIndex !== "number") return TARGET_GRADE_OPTIONS;
  return TARGET_GRADE_OPTIONS.slice(0, currentIndex);
}

function getDefaultPromotionTargetGrade(
  currentGradeLabel: string | null | undefined,
  decisionType: MeetingDecisionType
) {
  const normalizedCurrent = normalizeTargetGrade(currentGradeLabel);
  if (!normalizedCurrent) return null;
  const currentIndex = TARGET_GRADE_INDEX.get(normalizedCurrent.toLowerCase());
  if (typeof currentIndex !== "number") return null;
  const offset = decisionType === "DOUBLE_UP" ? 2 : 1;
  const targetIndex = currentIndex - offset;
  if (targetIndex < 0) return null;
  return TARGET_GRADE_OPTIONS[targetIndex]?.value ?? null;
}

// ─── Progression / Sanction split ─────────────────────────────────────────────

const PROGRESSION_VALUES = new Set<MeetingDecisionType>([
  "MAINTAIN", "UP", "DOUBLE_UP", "WEEK_VALID_1", "WEEK_VALID_2", "WEEK_VALID_3", "WEEK_INVALID",
  "REMOVE_TEST_RANK",
]);

const SANCTION_VALUES = new Set<MeetingDecisionType>([
  "WARN_LIGHT", "WARN_HEAVY", "DEMOTE", "BLACKLIST", "RESERVIST", "PLAYTIME_WARN", "EXCLUDE",
]);

const PROGRESSION_OPTIONS = DECISION_OPTIONS.filter((o) => PROGRESSION_VALUES.has(o.value));
const SANCTION_OPTIONS    = DECISION_OPTIONS.filter((o) => SANCTION_VALUES.has(o.value));

/** Split a stored decisionType into its two UI fields. */
function splitDecision(decisionType: MeetingDecisionType): {
  progressionValue: MeetingDecisionType;
  sanctionValue: MeetingDecisionType | "NONE";
} {
  if (SANCTION_VALUES.has(decisionType)) {
    return { progressionValue: "MAINTAIN", sanctionValue: decisionType };
  }
  return { progressionValue: decisionType, sanctionValue: "NONE" };
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-BE");
}

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString("fr-BE");
}

function fmtShortDate(iso: string | null | undefined) {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString("fr-BE", { day: "2-digit", month: "2-digit" });
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

function getMeetingTone(status: MeetingStatus, locked: boolean) {
  if (locked) return "accent" as const;
  if (status === "FINAL") return "success" as const;
  if (status === "CLOSED") return "info" as const;
  if (status === "DRAFT") return "warning" as const;
  if (status === "CANCELED") return "danger" as const;
  return "neutral" as const;
}

function getDecisionTone(value: MeetingDecisionType | "NONE") {
  if (["UP", "DOUBLE_UP", "WEEK_VALID_1", "WEEK_VALID_2", "WEEK_VALID_3"].includes(value)) {
    return "success" as const;
  }
  if (["WARN_LIGHT", "WARN_HEAVY", "PLAYTIME_WARN", "WEEK_INVALID", "RESERVIST"].includes(value)) {
    return "warning" as const;
  }
  if (["DEMOTE", "BLACKLIST", "EXCLUDE"].includes(value)) {
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

// ─── Component ────────────────────────────────────────────────────────────────

export function MeetingDecisionsClient({
  meetingId,
  meetingStatus,
  onStatusChange,
}: {
  meetingId: string;
  meetingStatus: MeetingStatus;
  onStatusChange?: () => void;
}) {
  const router = useRouter();

  // Data state
  const [rows, setRows] = useState<MeetingRow[]>([]);
  const [meta, setMeta] = useState<MeetingMeta | null>(null);
  const [meetingNote, setMeetingNote] = useState("");

  // Loading / status state
  const [loading, setLoading] = useState(true);
  const [currentMeetingStatus, setCurrentMeetingStatus] = useState<MeetingStatus>(meetingStatus);

  // Operation state
  const [saving, setSaving] = useState(false);
  const [savingRows, setSavingRows] = useState(false);
  const [savingNote, setSavingNote] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [closing, setClosing] = useState(false);

  // Feedback
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // UI filters
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAction, setFilterAction] = useState<string>("ALL");

  // Pending decision/motif changes (manual save)
  const [localRows, setLocalRows] = useState<
    Map<string, { decisionType: MeetingDecisionType; sanctionReason: string; targetGrade: string }>
  >(new Map());
  // Ref mirror so the polling interval can check without closing over stale state
  const localRowsSizeRef = useRef(0);

  // Pending status/playtime/note changes (debounced auto-save)
  const pendingRowRef = useRef<
    Record<string, Partial<Pick<MeetingRow, "status" | "note" | "playtimeMinutes">>>
  >({});
  const inflightRowRef = useRef<
    Record<string, Partial<Pick<MeetingRow, "status" | "note" | "playtimeMinutes">>>
  >({});
  const rowTimerRef = useRef<number | null>(null);
  const noteTimerRef = useRef<number | null>(null);

  // ── Computed flags ─────────────────────────────────────────────────────────

  const isLocked = meta?.locked ?? false;
  const canEditDecisions =
    currentMeetingStatus === "DRAFT" || currentMeetingStatus === "IN_PROGRESS";
  const canFinalize = currentMeetingStatus === "CLOSED";
  const isReadOnly =
    currentMeetingStatus === "FINAL" || currentMeetingStatus === "CANCELED";
  const canClose =
    currentMeetingStatus === "DRAFT" || currentMeetingStatus === "IN_PROGRESS";
  const canPublish =
    currentMeetingStatus === "CLOSED" || currentMeetingStatus === "FINAL";

  // ── Data loading ───────────────────────────────────────────────────────────

  function applyResponse(meeting: MeetingDetailResponse["meeting"]) {
    if (!meeting) return;
    setCurrentMeetingStatus(meeting.status);
    setMeta({
      id: meeting.id,
      title: meeting.title,
      weekKey: meeting.weekKey,
      scheduledAt: meeting.scheduledAt,
      status: meeting.status,
      locked: meeting.locked,
      meetingNote: meeting.meetingNote,
      counts: meeting.counts,
      updatedAt: meeting.updatedAt,
      discord: meeting.discord,
    });
    setMeetingNote(meeting.meetingNote ?? "");
    setRows(
      (meeting.rows ?? []).map((row) => {
        const inflight = row.discordId ? inflightRowRef.current[row.discordId] : undefined;
        return {
        ...row,
        status: ((inflight?.status ?? row.status ?? "UNKNOWN") as AttendanceStatus),
        note: (inflight?.note ?? row.note ?? ""),
        decisionType: (row.decisionType ?? "MAINTAIN") as MeetingDecisionType,
        targetGrade: normalizeTargetGrade(row.targetGrade) ?? null,
        sanctionReason: row.sanctionReason ?? "",
        playtimeMinutes:
          typeof inflight?.playtimeMinutes === "number"
            ? inflight.playtimeMinutes
            : row.playtimeMinutes,
      };
      })
    );
  }

  useEffect(() => {
    setCurrentMeetingStatus(meetingStatus);
  }, [meetingStatus]);

  // Keep ref in sync so the polling interval always sees the latest size
  useEffect(() => {
    localRowsSizeRef.current = localRows.size;
  }, [localRows]);

  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const res = await fetch(`/api/staff/meetings/${meetingId}`, { cache: "no-store" });
        const data = (await res.json()) as MeetingDetailResponse;
        if (!res.ok || !data?.ok || !data.meeting) {
          throw new Error(data?.error ?? "Failed to load");
        }
        applyResponse(data.meeting);
      } catch (err: any) {
        setError(err.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [meetingId]);

  // Polling every 3 s (best-effort, skip if pending saves or unsaved local decision changes)
  useEffect(() => {
    const timer = window.setInterval(async () => {
      if (
        saving ||
        savingRows ||
        savingNote ||
        Object.keys(pendingRowRef.current).length > 0 ||
        localRowsSizeRef.current > 0
      )
        return;
      try {
        const res = await fetch(`/api/staff/meetings/${meetingId}`, { cache: "no-store" });
        const data = (await res.json()) as MeetingDetailResponse;
        if (res.ok && data?.ok && data?.meeting) {
          applyResponse(data.meeting);
        }
      } catch {
        // best-effort
      }
    }, 3000);
    return () => window.clearInterval(timer);
  }, [meetingId, saving, savingRows, savingNote]);

  // ── Per-row auto-save (status / playtime / note) ───────────────────────────

  function updateRowLocal(
    discordId: string,
    patch: Partial<Pick<MeetingRow, "status" | "note" | "playtimeMinutes">>
  ) {
    setRows((prev) =>
      prev.map((r) => (r.discordId === discordId ? { ...r, ...patch } : r))
    );
    if (isLocked) return;
    pendingRowRef.current[discordId] = {
      ...pendingRowRef.current[discordId],
      ...patch,
    };
    if (rowTimerRef.current) window.clearTimeout(rowTimerRef.current);
    rowTimerRef.current = window.setTimeout(() => void flushRowUpdates(), 600);
  }

  async function flushRowUpdates() {
    const entries = Object.entries(pendingRowRef.current);
    if (entries.length === 0) return;
    inflightRowRef.current = { ...inflightRowRef.current, ...pendingRowRef.current };
    pendingRowRef.current = {};
    setSavingRows(true);
    try {
      const savedDiscordIds = await Promise.all(
        entries.map(async ([discordId, patch]) => {
          const res = await fetch(`/api/staff/meetings/${meetingId}/row`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ discordId, ...patch }),
          });
          const json = await res.json().catch(() => ({}));
          if (!res.ok || !json?.ok) {
            throw new Error(json?.error ?? `Échec pour ${discordId}`);
          }
          return discordId;
        })
      );

      for (const discordId of savedDiscordIds) {
        delete inflightRowRef.current[discordId];
      }
    } catch (err: any) {
      setError(err.message ?? "Erreur de sauvegarde");
      // Keep local values visible if server save fails; they can be retried by user edits.
    } finally {
      setSavingRows(false);
    }
  }

  // ── Meeting note auto-save ─────────────────────────────────────────────────

  function queueMeetingNote(note: string) {
    setMeetingNote(note);
    if (isLocked) return;
    if (noteTimerRef.current) window.clearTimeout(noteTimerRef.current);
    noteTimerRef.current = window.setTimeout(async () => {
      setSavingNote(true);
      try {
        const res = await fetch(`/api/staff/meetings/${meetingId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ meetingNote: note }),
        });
        const json = (await res.json().catch(() => ({}))) as MeetingDetailResponse;
        if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Save failed");
        if (json.meeting)
          setMeta((prev) =>
            prev ? { ...prev, meetingNote: note, updatedAt: json.meeting!.updatedAt } : prev
          );
      } catch (err: any) {
        setError(err.message ?? "Erreur note");
      } finally {
        setSavingNote(false);
      }
    }, 600);
  }

  // ── Close meeting ──────────────────────────────────────────────────────────

  async function closeMeeting() {
    if (!canClose || closing) return;
    setClosing(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/meetings/${meetingId}/close`, { method: "POST" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Close failed");
      setCurrentMeetingStatus("CLOSED");
      setMeta((prev) => (prev ? { ...prev, status: "CLOSED", locked: true } : prev));
      onStatusChange?.();
    } catch (err: any) {
      setError(err.message ?? "Erreur fermeture");
    } finally {
      setClosing(false);
    }
  }

  // ── Publish Discord ────────────────────────────────────────────────────────

  async function publishMeeting() {
    if (!canPublish || publishing) return;
    setPublishing(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/meetings/${meetingId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error ?? "Publish failed");
      setSuccess("Publication Discord envoyée");
    } catch (err: any) {
      setError(err.message ?? "Erreur publication");
    } finally {
      setPublishing(false);
    }
  }

  // ── Decision changes (local state, manual save) ────────────────────────────

  const mergedRows = useMemo(() => {
    return rows.map((row) => {
      const local = row.id ? localRows.get(row.id) : null;
      return {
        ...row,
        decisionType: local ? local.decisionType : row.decisionType,
        targetGrade: local ? local.targetGrade : row.targetGrade,
        sanctionReason: local ? local.sanctionReason : row.sanctionReason,
        isModified: Boolean(local),
      };
    });
  }, [rows, localRows]);

  const filteredRows = useMemo(() => {
    let result = mergedRows;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (row) =>
          row.name.toLowerCase().includes(q) ||
          row.discordId.toLowerCase().includes(q) ||
          String(row.sanctionReason ?? "").toLowerCase().includes(q)
      );
    }
    if (filterAction !== "ALL") {
      result = result.filter((row) => row.decisionType === filterAction);
    }

    return result
      .map((row, index) => ({ row, index }))
      .sort((left, right) => {
        const levelLeft = GRADE_LEVEL_BY_NAME.get((left.row.gradeLabel ?? "").toLowerCase()) ?? -1;
        const levelRight = GRADE_LEVEL_BY_NAME.get((right.row.gradeLabel ?? "").toLowerCase()) ?? -1;
        if (levelLeft !== levelRight) return levelRight - levelLeft;

        const byName = (left.row.name ?? "").localeCompare(right.row.name ?? "", "fr");
        if (byName !== 0) return byName;

        return left.index - right.index;
      })
      .map(({ row }) => row);
  }, [mergedRows, searchQuery, filterAction]);

  const stats = useMemo(() => {
    const c = {
      total: mergedRows.length, maintien: 0, up: 0, doubleUp: 0,
      weekValid1: 0, weekValid2: 0, weekValid3: 0, weekInvalid: 0,
      warnLight: 0, warnHeavy: 0, demote: 0, blacklist: 0, reservist: 0, playtimeWarn: 0,
    };
    mergedRows.forEach((row) => {
      switch (row.decisionType) {
        case "UP":            c.up++;           break;
        case "DOUBLE_UP":     c.doubleUp++;     break;
        case "WEEK_VALID_1":  c.weekValid1++;   break;
        case "WEEK_VALID_2":  c.weekValid2++;   break;
        case "WEEK_VALID_3":  c.weekValid3++;   break;
        case "WEEK_INVALID":  c.weekInvalid++;  break;
        case "WARN_LIGHT":    c.warnLight++;    break;
        case "WARN_HEAVY":    c.warnHeavy++;    break;
        case "DEMOTE":        c.demote++;       break;
        case "BLACKLIST":     c.blacklist++;    break;
        case "RESERVIST":     c.reservist++;    break;
        case "PLAYTIME_WARN": c.playtimeWarn++; break;
        default:              c.maintien++;     break;
      }
    });
    return c;
  }, [mergedRows]);

  function handleDecisionChange(
    rowId: string,
    field: "decisionType" | "sanctionReason" | "targetGrade",
    value: string
  ) {
    if (!canEditDecisions) return;
    setLocalRows((prev) => {
      const next = new Map(prev);
      const sourceRow = rows.find((item) => item.id === rowId) ?? null;
      // FIX: seed the fallback from the server row's actual values so that
      // changing targetGrade on an already-UP row doesn't silently reset
      // decisionType to "MAINTAIN".
      const current = next.get(rowId) ?? {
        decisionType: (sourceRow?.decisionType ?? "MAINTAIN") as MeetingDecisionType,
        sanctionReason: sourceRow?.sanctionReason ?? "",
        targetGrade: normalizeTargetGrade(sourceRow?.targetGrade) ?? "",
      };
      if (field === "decisionType") {
        const nextDecisionType = (value || "MAINTAIN") as MeetingDecisionType;
        const wasPromotion = isPromotionDecision(current.decisionType);
        current.decisionType = nextDecisionType;
        if (isPromotionDecision(nextDecisionType)) {
          // Only compute the default target when entering a promotion decision
          // from a non-promotion one, or when no grade is set yet.
          // This preserves a manually-chosen grade when toggling UP ↔ DOUBLE_UP.
          if (!wasPromotion || !current.targetGrade) {
            current.targetGrade = getDefaultPromotionTargetGrade(sourceRow?.gradeLabel, nextDecisionType) ?? "";
          }
        } else {
          current.targetGrade = "";
        }
      } else if (field === "targetGrade") {
        current.targetGrade = normalizeTargetGrade(value) ?? "";
      } else {
        current.sanctionReason = value;
      }
      next.set(rowId, current);
      return next;
    });
  }

  async function handleSaveDecisions() {
    if (!canEditDecisions) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const toSave = mergedRows.filter((row) => row.isModified && row.id);
      if (toSave.length === 0) {
        setSuccess("Aucune décision à enregistrer");
        return;
      }
      const missingTargetRows = toSave.filter(
        (row) => isPromotionDecision(row.decisionType) && !normalizeTargetGrade(row.targetGrade)
      );
      if (missingTargetRows.length > 0) {
        throw new Error(`Rang cible requis pour: ${missingTargetRows.map((row) => row.name).join(", ")}`);
      }
      for (const row of toSave) {
        const res = await fetch(`/api/staff/meetings/${meetingId}/row`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            rowId: row.id,
            decisionType: row.decisionType,
            targetGrade: row.targetGrade ?? null,
            sanctionReason: row.sanctionReason,
          }),
        });
        const data = await res.json();
        if (!res.ok || !data?.ok) {
          throw new Error(data?.error ?? `Échec pour ${row.name}`);
        }
      }
      setSuccess(`${toSave.length} décision(s) enregistrée(s)`);
      // Refresh from server first, then clear local state so the UI immediately
      // shows saved values without a flash of "old" server data.
      const refreshRes = await fetch(`/api/staff/meetings/${meetingId}`, { cache: "no-store" });
      const refreshData = (await refreshRes.json()) as MeetingDetailResponse;
      if (refreshRes.ok && refreshData?.ok && refreshData.meeting) {
        applyResponse(refreshData.meeting);
      }
      // Clear local overrides only after server data has been applied
      setLocalRows(new Map());
    } catch (err: any) {
      setError(err.message ?? "Erreur réseau");
    } finally {
      setSaving(false);
    }
  }

  // ── Finalize ───────────────────────────────────────────────────────────────

  async function handleFinalize() {
    if (!canFinalize) return;
    const confirmed = window.confirm(
      "Êtes-vous sûr de vouloir finaliser cette réunion ?\n\n" +
        "Cette action va appliquer les décisions enregistrées (promotions, démotes, sanctions) et verrouiller définitivement la réunion.\n\n" +
        "Cette action est irréversible."
    );
    if (!confirmed) return;
    setFinalizing(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/staff/meetings/${meetingId}/finalize`, { method: "POST" });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Erreur lors de la finalisation");
        return;
      }
      setSuccess(data.summary ?? "Réunion finalisée");
      setCurrentMeetingStatus("FINAL");
      setMeta((prev) => (prev ? { ...prev, status: "FINAL", locked: true } : prev));
      onStatusChange?.();
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "Erreur réseau");
    } finally {
      setFinalizing(false);
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <LoadingState
        title="Chargement de la réunion"
        description="Récupération des présences, décisions, notes et continuité staff."
      />
    );
  }

  if (!meta) {
    return (
      <EmptyState
        icon={<CalendarDays className="h-12 w-12" />}
        title="Réunion introuvable"
        description={error || "La réunion demandée n'a pas pu être chargée."}
      />
    );
  }

  const counts = meta?.counts;
  const modifiedRowsCount = localRows.size;
  const attendanceData = [
    { label: "Membres", value: counts?.total ?? 0, tone: "default" as const },
    { label: "Présents", value: counts?.present ?? 0, tone: "success" as const },
    { label: "Retards", value: counts?.late ?? 0, tone: "info" as const },
    { label: "Excusés", value: counts?.excused ?? 0, tone: "warning" as const },
    { label: "Absents justifiés", value: counts?.absentJustified ?? 0, tone: "warning" as const },
    { label: "Absents injustifiés", value: counts?.absentUnjustified ?? 0, tone: "danger" as const },
    { label: "Inconnus", value: counts?.unknown ?? 0, tone: "default" as const },
  ];
  const decisionData = [
    { label: "Décisions modifiées", value: modifiedRowsCount, tone: modifiedRowsCount > 0 ? ("info" as const) : ("default" as const) },
    { label: "Up", value: stats.up, tone: "success" as const },
    { label: "Double up", value: stats.doubleUp, tone: "success" as const },
    { label: "Avertissements", value: stats.warnLight + stats.warnHeavy + stats.playtimeWarn, tone: "warning" as const },
    { label: "Démotes / blacklist", value: stats.demote + stats.blacklist, tone: "danger" as const },
    { label: "Maintiens", value: stats.maintien, tone: "default" as const },
  ];

  return (
    <div className="grid gap-6">
      <SectionCard
        title={meta.title ?? "Réunion staff"}
        description="Pilotage des présences, décisions, continuité et publication Discord de la réunion en cours."
        icon={CalendarDays}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {(savingRows || savingNote) ? <StatusBadge tone="info">Sauvegarde auto en cours</StatusBadge> : null}
            {isReadOnly ? <StatusBadge tone="success">{MEETING_STATUS_LABELS_FR[currentMeetingStatus]}</StatusBadge> : null}

            {canPublish ? (
              <MotionButtonFrame>
                <button
                  onClick={publishMeeting}
                  disabled={publishing}
                  className="inline-flex items-center gap-2 rounded-xl border border-cyan-500/20 bg-cyan-500/10 px-3 py-2 text-sm font-medium text-cyan-100 transition-colors hover:bg-cyan-500/15 disabled:opacity-50"
                >
                  <Megaphone className="h-4 w-4" />
                  {publishing ? "Publication..." : "Publier Discord"}
                </button>
              </MotionButtonFrame>
            ) : null}

            {canClose ? (
              <MotionButtonFrame>
                <button
                  onClick={closeMeeting}
                  disabled={closing}
                  className="inline-flex items-center gap-2 rounded-xl border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-100 transition-colors hover:bg-amber-500/15 disabled:opacity-50"
                >
                  <ShieldCheck className="h-4 w-4" />
                  {closing ? "Fermeture..." : "Clore et verrouiller"}
                </button>
              </MotionButtonFrame>
            ) : null}

            {canFinalize ? (
              <MotionButtonFrame>
                <button
                  onClick={handleFinalize}
                  disabled={finalizing}
                  className="inline-flex items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-3 py-2 text-sm font-medium text-emerald-100 transition-colors hover:bg-emerald-500/15 disabled:opacity-50"
                >
                  <Sparkles className="h-4 w-4" />
                  {finalizing ? "Finalisation..." : "Finaliser la réunion"}
                </button>
              </MotionButtonFrame>
            ) : null}

            {canEditDecisions ? (
              <MotionButtonFrame>
                <button
                  onClick={handleSaveDecisions}
                  disabled={saving || modifiedRowsCount === 0}
                  className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.06] px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.1] disabled:opacity-50"
                >
                  <Save className="h-4 w-4" />
                  {saving ? "Enregistrement..." : `Enregistrer les décisions${modifiedRowsCount > 0 ? ` (${modifiedRowsCount})` : ""}`}
                </button>
              </MotionButtonFrame>
            ) : null}
          </div>
        }
      >
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <DataTile label="Semaine" value={meta.weekKey ?? "—"} tone="info" />
          <DataTile label="Date" value={meta.scheduledAt ? fmtDate(meta.scheduledAt) : "—"} />
          <DataTile
            label="Statut"
            value={<StatusBadge tone={getMeetingTone(currentMeetingStatus, isLocked)}>{MEETING_STATUS_LABELS_FR[currentMeetingStatus]}{isLocked ? " • verrouillée" : ""}</StatusBadge>}
          />
          <DataTile label="Mise à jour" value={fmtDateTime(meta.updatedAt)} />
          <DataTile
            label="Dernière publication"
            value={meta.discord?.lastPublishedAt ? fmtDateTime(meta.discord.lastPublishedAt) : "Non publiée"}
            tone={meta.discord?.lastPublishedAt ? "success" : "warning"}
          />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          {modifiedRowsCount > 0 ? <StatusBadge tone="info">{modifiedRowsCount} décision(s) locale(s) en attente</StatusBadge> : null}
          {isLocked ? <StatusBadge tone="accent">Réunion verrouillée</StatusBadge> : null}
          {canEditDecisions ? <StatusBadge>Édition manuelle des décisions active</StatusBadge> : null}
        </div>
      </SectionCard>

      <MotionSection delay={0.03}>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-7">
          {attendanceData.map((item) => (
            <DataTile key={item.label} label={item.label} value={item.value} tone={item.tone} />
          ))}
        </div>
      </MotionSection>

      <MotionSection delay={0.05}>
        <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-6">
          {decisionData.map((item) => (
            <DataTile key={item.label} label={item.label} value={item.value} tone={item.tone} />
          ))}
        </div>
      </MotionSection>

      <SectionCard
        title="Notes de réunion"
        description="Observations globales et contexte staff associés à cette réunion."
        icon={FileText}
      >
        <textarea
          value={meetingNote}
          onChange={(e) => queueMeetingNote(e.target.value)}
          disabled={isLocked}
          rows={3}
          placeholder="Observations générales de réunion..."
          className="min-h-[110px] w-full rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/40 focus:outline-none disabled:opacity-50"
        />
      </SectionCard>

      {error ? (
        <SectionCard title="Erreur" description="Une opération réunion a échoué." icon={AlertTriangle}>
          <div className="flex items-center gap-2 text-sm text-red-200">
            <StatusBadge tone="danger">Erreur</StatusBadge>
            <span>{error}</span>
          </div>
        </SectionCard>
      ) : null}

      {success ? (
        <SectionCard title="Confirmation" description="Dernière action réunion confirmée." icon={ShieldCheck}>
          <div className="flex items-center gap-2 text-sm text-emerald-200">
            <StatusBadge tone="success">Succès</StatusBadge>
            <span>{success}</span>
          </div>
        </SectionCard>
      ) : null}

      <SectionCard
        title="Filtres et recherche"
        description="Recherche rapide par membre ou motif, plus filtrage direct par décision." 
        icon={Filter}
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Rechercher un membre, un Discord ID ou un motif..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-slate-950/70 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/40 focus:outline-none"
            />
          </div>

          <StyledSelect
            value={filterAction}
            onChange={(e) => setFilterAction(e.target.value)}
          >
            <option value="ALL" className="bg-slate-950">Toutes les décisions</option>
            {DECISION_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value} className="bg-slate-950">
                {opt.label}
              </option>
            ))}
          </StyledSelect>

          <StatusBadge>{filteredRows.length} / {mergedRows.length} visible(s)</StatusBadge>
        </div>
      </SectionCard>

      <SectionCard
        title={`Décisions membres (${filteredRows.length})`}
        description="Présence, playtime, progression, sanctions et continuité par membre."
        icon={Gavel}
      >
        {filteredRows.length === 0 ? (
          <EmptyState
            icon={<Users className="h-12 w-12" />}
            title="Aucun membre visible"
            description="Aucune ligne ne correspond aux filtres actuels."
          />
        ) : (
          <>
            {/* ── Mobile cards ── */}
            <div className="md:hidden flex flex-col gap-4">
              {filteredRows.map((row) => {
                const { progressionValue, sanctionValue } = splitDecision(row.decisionType);
                const progMeta  = getDecisionMeta(progressionValue);
                const sanctMeta = sanctionValue !== "NONE" ? getDecisionMeta(sanctionValue) : null;
                const targetOptions = getPromotionTargetOptions(row.gradeLabel);
                const showTargetGrade = isPromotionDecision(progressionValue);
                const selectedTargetGrade = normalizeTargetGrade(row.targetGrade) ?? "";
                return (
                  <div key={row.id ?? row.discordId} className="rounded-2xl border border-white/8 bg-white/[0.03] p-4 flex flex-col gap-3">
                    {/* Header */}
                    <div className="flex items-center gap-3">
                      <MemberAvatar name={row.name ?? "Membre inconnu"} discordId={row.discordId} discordAvatarHash={row.discordAvatarHash ?? null} />
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-slate-100 truncate">{row.name ?? "—"}</div>
                        <div className="text-xs text-slate-400">{row.gradeLabel ?? "Grade inconnu"}</div>
                      </div>
                      <StatusBadge tone={getAttendanceTone(row.status)}>{getAttendanceLabel(row.status)}</StatusBadge>
                    </div>

                    {/* Continuity */}
                    {row.continuity?.continuityIndicator && (
                      <div className="text-[11px] text-slate-500">{row.continuity.continuityIndicator}</div>
                    )}
                    {row.continuity && row.continuity.recentMeetingHistory.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 text-[11px]">
                        {row.continuity.recentMeetingHistory.map((item) => {
                          const label = fmtShortDate(item.scheduledAt) ?? item.weekKey;
                          const tg = item.targetGrade ? ` -> ${item.targetGrade}` : "";
                          return (
                            <span key={`${item.meetingId}:${item.weekKey}`} className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-slate-300" title={`${item.meetingTitle} • ${item.decisionLabel}${tg}`}>
                              {label} · {item.decisionLabel}{tg}
                            </span>
                          );
                        })}
                      </div>
                    )}

                    {/* Fields */}
                    <div className="grid grid-cols-2 gap-3">
                      {/* Présence */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Présence</label>
                        {isLocked ? (
                          <StatusBadge tone={getAttendanceTone(row.status)}>{getAttendanceLabel(row.status)}</StatusBadge>
                        ) : (
                          <StyledSelect value={row.status} onChange={(e) => updateRowLocal(row.discordId, { status: e.target.value as AttendanceStatus })} className={`w-full rounded-xl border px-3 py-2 text-sm font-medium focus:outline-none ${getSelectClass(getAttendanceTone(row.status))}`}>
                            {STATUS_OPTIONS.map((opt) => <option key={opt.value} value={opt.value} className="bg-slate-950 text-slate-100">{opt.label}</option>)}
                          </StyledSelect>
                        )}
                      </div>

                      {/* Playtime */}
                      <div className="flex flex-col gap-1">
                        <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Playtime (min)</label>
                        {isLocked ? (
                          <StatusBadge>{row.playtimeMinutes} min</StatusBadge>
                        ) : (
                          <input type="number" min={0} step={1} value={Number.isFinite(row.playtimeMinutes) ? row.playtimeMinutes : 0} onChange={(e) => updateRowLocal(row.discordId, { playtimeMinutes: Math.max(0, Math.round(Number(e.target.value || 0))) })} className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/40 focus:outline-none" />
                        )}
                      </div>
                    </div>

                    {/* Note */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Note</label>
                      {isLocked ? (
                        <span className="text-sm text-slate-400">{row.note || "—"}</span>
                      ) : (
                        <input type="text" value={row.note ?? ""} onChange={(e) => updateRowLocal(row.discordId, { note: e.target.value })} placeholder="Note..." className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/40 focus:outline-none" />
                      )}
                    </div>

                    {/* Progression */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Progression</label>
                      {isReadOnly || !canEditDecisions ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <StatusBadge tone={getDecisionTone(progressionValue)}>{progMeta.label}</StatusBadge>
                          {showTargetGrade && <span className="text-xs text-slate-400">→ {selectedTargetGrade || "—"}</span>}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <StyledSelect value={progressionValue} onChange={(e) => { if (!row.id) return; handleDecisionChange(row.id, "decisionType", e.target.value); }} className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold focus:outline-none ${getSelectClass(getDecisionTone(progressionValue))}`}>
                            {PROGRESSION_OPTIONS.map((opt) => <option key={opt.value} value={opt.value} className="bg-slate-950 text-slate-100">{opt.label}</option>)}
                          </StyledSelect>
                          {showTargetGrade && (
                            targetOptions.length > 0 ? (
                              <StyledSelect value={selectedTargetGrade} onChange={(e) => row.id && handleDecisionChange(row.id, "targetGrade", e.target.value)} className="w-full rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 focus:outline-none">
                                <option value="" className="bg-slate-950 text-slate-100">Rang cible</option>
                                {targetOptions.map((option) => <option key={option.value} value={option.value} className="bg-slate-950 text-slate-100">{option.label}</option>)}
                              </StyledSelect>
                            ) : (
                              <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-2.5 py-2 text-xs text-amber-300">Aucun rang supérieur disponible.</div>
                            )
                          )}
                        </div>
                      )}
                    </div>

                    {/* Sanction */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Sanction</label>
                      {isReadOnly || !canEditDecisions ? (
                        sanctMeta ? <StatusBadge tone={getDecisionTone(sanctionValue)}>{sanctMeta.label}</StatusBadge> : <StatusBadge>Aucune sanction</StatusBadge>
                      ) : (
                        <StyledSelect value={sanctionValue} onChange={(e) => { if (!row.id) return; const val = e.target.value as MeetingDecisionType | "NONE"; if (val === "NONE") { handleDecisionChange(row.id, "decisionType", progressionValue); } else { handleDecisionChange(row.id, "decisionType", val); } }} className={`w-full rounded-xl border px-3 py-2 text-sm font-semibold focus:outline-none ${getSelectClass(getDecisionTone(sanctionValue))}`}>
                          <option value="NONE" className="bg-slate-950 text-slate-100">Aucune sanction</option>
                          {SANCTION_OPTIONS.map((opt) => <option key={opt.value} value={opt.value} className="bg-slate-950 text-slate-100">{opt.label}</option>)}
                        </StyledSelect>
                      )}
                    </div>

                    {/* Motif */}
                    <div className="flex flex-col gap-1">
                      <label className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Motif</label>
                      {isReadOnly || !canEditDecisions ? (
                        <span className="text-sm text-slate-400">{row.sanctionReason || "—"}</span>
                      ) : (
                        <input type="text" value={row.sanctionReason ?? ""} onChange={(e) => row.id && handleDecisionChange(row.id, "sanctionReason", e.target.value)} placeholder="Motif de la sanction..." className="w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/40 focus:outline-none" />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* ── Desktop table ── */}
            <div className="hidden md:block overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.03]">
            <table className="min-w-[700px] text-sm">
              <thead className="border-b border-white/8 bg-white/[0.03] text-slate-200">
                <tr>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Membre</th>
                  <th className="w-[170px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Présence</th>
                  <th className="w-[130px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Playtime</th>
                  <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Note</th>
                  <th className="w-[220px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Progression</th>
                  <th className="w-[220px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Sanction</th>
                  <th className="w-[260px] px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Motif</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/8">
                {filteredRows.map((row, index) => {
                const { progressionValue, sanctionValue } = splitDecision(row.decisionType);
                const progMeta  = getDecisionMeta(progressionValue);
                const sanctMeta = sanctionValue !== "NONE" ? getDecisionMeta(sanctionValue) : null;
                return (
                  <tr
                    key={row.id ?? row.discordId}
                    className={`${index % 2 === 0 ? "bg-slate-950/20" : "bg-slate-900/20"} align-top hover:bg-white/[0.04]`}
                  >

                    {/* Membre */}
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-2.5">
                        <MemberAvatar
                          name={row.name ?? "Membre inconnu"}
                          discordId={row.discordId}
                          discordAvatarHash={row.discordAvatarHash ?? null}
                        />
                        <div>
                          <div className="font-medium text-slate-100" title={row.discordId}>{row.name ?? "—"}</div>
                          <div className="text-xs text-slate-400">{row.gradeLabel ?? "Grade inconnu"}</div>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px]">
                            <StatusBadge tone={getAttendanceTone(row.status)}>{getAttendanceLabel(row.status)}</StatusBadge>
                            <StatusBadge>{row.playtimeMinutes} min</StatusBadge>
                          </div>
                          {row.continuity?.continuityIndicator && (
                            <div className="mt-1 text-[11px] leading-4 text-slate-500">
                              {row.continuity.continuityIndicator}
                            </div>
                          )}
                          {row.continuity && row.continuity.recentMeetingHistory.length > 0 && (
                            <div className="mt-1 flex flex-wrap gap-1.5 text-[11px]">
                              {row.continuity.recentMeetingHistory.map((item) => {
                                const label = fmtShortDate(item.scheduledAt) ?? item.weekKey;
                                const targetGrade = item.targetGrade ? ` -> ${item.targetGrade}` : "";
                                return (
                                  <span
                                    key={`${item.meetingId}:${item.weekKey}`}
                                    className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-slate-300"
                                    title={`${item.meetingTitle} • ${item.decisionLabel}${targetGrade}${item.sanctionReason ? ` • ${item.sanctionReason}` : ""}`}
                                  >
                                    {label} · {item.decisionLabel}{targetGrade}
                                  </span>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Présence */}
                    <td className="px-4 py-3 align-middle">
                      {isLocked ? (
                        <StatusBadge tone={getAttendanceTone(row.status)}>{getAttendanceLabel(row.status)}</StatusBadge>
                      ) : (
                        <StyledSelect
                          value={row.status}
                          onChange={(e) =>
                            updateRowLocal(row.discordId, {
                              status: e.target.value as AttendanceStatus,
                            })
                          }
                          className={`w-[170px] rounded-xl border px-3 py-2 text-sm font-medium focus:outline-none ${getSelectClass(getAttendanceTone(row.status))}`}
                        >
                          {STATUS_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value} className="bg-slate-950 text-slate-100">
                              {opt.label}
                            </option>
                          ))}
                        </StyledSelect>
                      )}
                    </td>

                    {/* Playtime */}
                    <td className="px-4 py-3 align-middle">
                      {isLocked ? (
                        <StatusBadge>{row.playtimeMinutes} min</StatusBadge>
                      ) : (
                        <input
                          type="number"
                          min={0}
                          step={1}
                          value={Number.isFinite(row.playtimeMinutes) ? row.playtimeMinutes : 0}
                          onChange={(e) =>
                            updateRowLocal(row.discordId, {
                              playtimeMinutes: Math.max(0, Math.round(Number(e.target.value || 0))),
                            })
                          }
                          className="w-24 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 focus:border-cyan-500/40 focus:outline-none"
                        />
                      )}
                    </td>

                    {/* Note */}
                    <td className="px-4 py-3 align-middle">
                      {isLocked ? (
                        <span className="text-slate-400">{row.note || "—"}</span>
                      ) : (
                        <input
                          type="text"
                          value={row.note ?? ""}
                          onChange={(e) =>
                            updateRowLocal(row.discordId, { note: e.target.value })
                          }
                          placeholder="Note..."
                          className="w-full min-w-[180px] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/40 focus:outline-none"
                        />
                      )}
                    </td>

                    {/* Décision */}
                    {/* Up / Progression */}
                    <td className="px-4 py-3 align-middle">
                      {(() => {
                        const targetOptions = getPromotionTargetOptions(row.gradeLabel);
                        const showTargetGrade = isPromotionDecision(progressionValue);
                        const selectedTargetGrade = normalizeTargetGrade(row.targetGrade) ?? "";

                        if (isReadOnly || !canEditDecisions) {
                          return (
                            <div className="space-y-2">
                              <StatusBadge tone={getDecisionTone(progressionValue)}>{progMeta.label}</StatusBadge>
                              {showTargetGrade ? (
                                <div className="text-xs text-slate-400">
                                  Rang cible : <span className="text-slate-200">{selectedTargetGrade || "—"}</span>
                                </div>
                              ) : null}
                            </div>
                          );
                        }

                        return (
                          <div className="space-y-2">
                            <StyledSelect
                              value={progressionValue}
                              onChange={(e) => {
                                if (!row.id) return;
                                handleDecisionChange(row.id, "decisionType", e.target.value);
                              }}
                              className={`w-[190px] rounded-xl border px-3 py-2 text-sm font-semibold focus:outline-none ${getSelectClass(getDecisionTone(progressionValue))}`}
                            >
                              {PROGRESSION_OPTIONS.map((opt) => (
                                <option key={opt.value} value={opt.value} className="bg-slate-950 text-slate-100">
                                  {opt.label}
                                </option>
                              ))}
                            </StyledSelect>
                            {showTargetGrade ? (
                              targetOptions.length > 0 ? (
                                <div className="space-y-1">
                                  <label className="block text-[11px] font-medium uppercase tracking-[0.06em] text-slate-400">
                                    Rang cible
                                  </label>
                                  <StyledSelect
                                    value={selectedTargetGrade}
                                    onChange={(e) => row.id && handleDecisionChange(row.id, "targetGrade", e.target.value)}
                                    className="w-[190px] rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-100 focus:outline-none"
                                  >
                                    <option value="" className="bg-slate-950 text-slate-100">Choisir le rang cible</option>
                                    {targetOptions.map((option) => (
                                      <option key={option.value} value={option.value} className="bg-slate-950 text-slate-100">
                                        {option.label}
                                      </option>
                                    ))}
                                  </StyledSelect>
                                </div>
                              ) : (
                                <div className="rounded-lg border border-amber-700/40 bg-amber-950/30 px-2.5 py-2 text-xs text-amber-300">
                                  Aucun rang supérieur disponible pour cette décision.
                                </div>
                              )
                            ) : null}
                          </div>
                        );
                      })()}
                    </td>

                    {/* Sanction */}
                    <td className="px-4 py-3 align-middle">
                      {isReadOnly || !canEditDecisions ? (
                        sanctMeta ? (
                          <StatusBadge tone={getDecisionTone(sanctionValue)}>{sanctMeta.label}</StatusBadge>
                        ) : (
                          <StatusBadge>Aucune sanction</StatusBadge>
                        )
                      ) : (
                        <StyledSelect
                          value={sanctionValue}
                          onChange={(e) => {
                            if (!row.id) return;
                            const val = e.target.value as MeetingDecisionType | "NONE";
                            if (val === "NONE") {
                              // Sanction cleared → revert to current progression value
                              handleDecisionChange(row.id, "decisionType", progressionValue);
                            } else {
                              // Sanction takes over (progression resets to MAINTAIN implicitly)
                              handleDecisionChange(row.id, "decisionType", val);
                            }
                          }}
                          className={`w-[190px] rounded-xl border px-3 py-2 text-sm font-semibold focus:outline-none ${getSelectClass(getDecisionTone(sanctionValue))}`}
                        >
                          <option value="NONE" className="bg-slate-950 text-slate-100">Aucune sanction</option>
                          {SANCTION_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value} className="bg-slate-950 text-slate-100">
                              {opt.label}
                            </option>
                          ))}
                        </StyledSelect>
                      )}
                    </td>

                    {/* Motif */}
                    <td className="px-4 py-3 align-middle">
                      {isReadOnly || !canEditDecisions ? (
                        <span className="text-slate-400">{row.sanctionReason || "—"}</span>
                      ) : (
                        <input
                          type="text"
                          value={row.sanctionReason ?? ""}
                          onChange={(e) =>
                            row.id &&
                            handleDecisionChange(row.id, "sanctionReason", e.target.value)
                          }
                          placeholder="Motif de la sanction..."
                          className="w-full min-w-[220px] rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-cyan-500/40 focus:outline-none"
                        />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          </div>
          </>
        )}
      </SectionCard>

      {!isReadOnly ? (
        <SectionCard title="Workflow réunion" description="Rappel du cycle de vie pour éviter les erreurs de manipulation." icon={Target}>
          <div className="flex flex-col gap-3 text-sm text-slate-300 lg:flex-row lg:items-center lg:justify-between">
            <p>
              Clore verrouille la réunion sans appliquer les décisions. Finaliser applique ensuite les promotions, démotes et sanctions déjà enregistrées.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone="warning">Clore = verrouiller</StatusBadge>
              <StatusBadge tone="success">Finaliser = appliquer</StatusBadge>
            </div>
          </div>
        </SectionCard>
      ) : null}

      <MotionSection delay={0.07} className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Clock3 className="h-4 w-4" />
        <span>Synchronisation live toutes les 3 secondes lorsque rien n'est en attente de sauvegarde.</span>
      </MotionSection>
    </div>
  );
}

function MemberAvatar({
  name,
  discordId,
  discordAvatarHash,
}: {
  name: string;
  discordId: string;
  discordAvatarHash: string | null;
}) {
  const [imageErrored, setImageErrored] = useState(false);
  const avatarUrl = getDiscordAvatarUrl(discordId, discordAvatarHash);
  if (avatarUrl && !imageErrored) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className="h-8 w-8 shrink-0 rounded-full border border-slate-700 object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setImageErrored(true)}
      />
    );
  }

  const fallback = (name ?? "?").trim().charAt(0).toUpperCase() || "?";
  return (
    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-slate-700 bg-slate-800 text-xs font-semibold text-slate-200">
      {fallback}
    </div>
  );
}
