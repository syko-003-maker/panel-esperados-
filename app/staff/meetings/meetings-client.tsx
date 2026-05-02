"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDays,
  addMonths,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { fr } from "date-fns/locale";
import { CalendarDays, PlusCircle } from "lucide-react";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { LoadingState } from "@/components/staff/ui/LoadingState";
import { MotionButtonFrame, MotionListItem } from "@/components/staff/ui/motion";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";

type MeetingItem = {
  id: string;
  scheduledAt: string;
  weekKey: string;
  title: string;
  type: string;
  status: string;
  locked: boolean;
  finalizedAt: string | null;
  summary: string | null;
  decisionsCount: number;
  attendancesCount: number;
  createdAt?: string;
  counts: {
    total: number;
    present: number;
    late: number;
    excused: number;
    absentJustified: number;
    absentUnjustified: number;
    unknown: number;
  };
  updatedAt: string;
};

type MeetingsResponse = {
  ok: boolean;
  data: MeetingItem[];
};

const STATUS_META: Record<string, { label: string }> = {
  DRAFT: { label: "Brouillon" },
  IN_PROGRESS: { label: "En cours" },
  CLOSED: { label: "Clôturée" },
  CANCELED: { label: "Annulée" },
  FINAL: { label: "Finalisée" },
};

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

export default function MeetingsClient() {
  const router = useRouter();
  const [items, setItems] = useState<MeetingItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createTitle, setCreateTitle] = useState("");
  const [createDate, setCreateDate] = useState<Date | null>(null);
  const [pickerMonth, setPickerMonth] = useState<Date>(new Date());
  const [pickerOpen, setPickerOpen] = useState(false);
  const loadingRef = useRef(false);

  async function load() {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/meetings", { cache: "no-store" });
      const json = (await res.json().catch(() => ({}))) as MeetingsResponse;
      if (!res.ok || !json?.ok) throw new Error((json as { error?: string }).error || "Failed to load");
      setItems(json.data ?? []);
    } catch (err: unknown) {
      setItems([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      loadingRef.current = false;
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return;
      void load();
    };
    const intervalId = window.setInterval(tick, 30000);
    const onVisibility = () => {
      if (!document.hidden) void load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(intervalId);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  async function onCreate() {
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/meetings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: createTitle || undefined,
          scheduledAt: createDate ? createDate.toISOString() : undefined,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Create failed");
      const meetingId = String(json?.meeting?.id ?? json?.meetingId ?? "");
      if (meetingId) {
        router.push(`/staff/meetings/${meetingId}`);
        return;
      }
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  function fmtCounts(counts: MeetingItem["counts"]) {
    if (!counts || counts.total === 0) return "—";
    const attended = counts.present + counts.late;
    const absent = counts.absentJustified + counts.absentUnjustified;
    if (attended === 0 && absent === 0) {
      return `${counts.total} membre${counts.total > 1 ? "s" : ""}`;
    }
    const parts: string[] = [];
    if (attended > 0) parts.push(`${attended} présent${attended > 1 ? "s" : ""}`);
    if (counts.excused > 0) parts.push(`${counts.excused} excusé${counts.excused > 1 ? "s" : ""}`);
    if (absent > 0) parts.push(`${absent} absent${absent > 1 ? "s" : ""}`);
    return `${parts.join(" · ")} / ${counts.total}`;
  }

  function getCreateDateLabel() {
    if (!createDate) return "Choisir date et heure";
    return format(createDate, "EEEE d MMMM yyyy 'à' HH:mm", { locale: fr });
  }

  const pickerStart = startOfWeek(startOfMonth(pickerMonth), { weekStartsOn: 1 });
  const pickerEnd = endOfWeek(endOfMonth(pickerMonth), { weekStartsOn: 1 });
  const pickerDays: Date[] = [];
  for (let day = pickerStart; day <= pickerEnd; day = addDays(day, 1)) {
    pickerDays.push(day);
  }

  function setHour(hour: number) {
    const base = createDate ?? new Date();
    const next = new Date(base);
    next.setHours(hour, next.getMinutes(), 0, 0);
    setCreateDate(next);
  }

  function setMinute(minute: number) {
    const base = createDate ?? new Date();
    const next = new Date(base);
    next.setMinutes(minute, 0, 0);
    setCreateDate(next);
  }

  function getStatusBadge(item: MeetingItem) {
    const key = String(item.status || "").toUpperCase();
    const meta = STATUS_META[key] ?? { label: item.status };
    const tone = key === "FINAL" ? "success" : key === "DRAFT" ? "warning" : key === "IN_PROGRESS" ? "info" : "neutral";
    return <StatusBadge tone={tone}>{meta.label}</StatusBadge>;
  }

  async function onDelete(meeting: MeetingItem) {
    const confirmed = window.confirm("Supprimer cette réunion ? Cette action est irréversible.");
    if (!confirmed) return;

    setError(null);
    try {
      const res = await fetch(`/api/staff/meetings/${meeting.id}`, { method: "DELETE" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Delete failed");
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  return (
    <div className="grid gap-5">
      <SectionCard
        title="Créer une réunion"
        description="Planifiez une nouvelle réunion staff puis ouvrez-la pour saisir présences et décisions."
        icon={PlusCircle}
        className={pickerOpen ? "z-30 overflow-visible" : "overflow-visible"}
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="grid gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Titre</span>
            <input
              type="text"
              placeholder="Titre (optionnel)"
              value={createTitle}
              onChange={(event) => setCreateTitle(event.target.value)}
              className="min-w-[240px] rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-white/25"
            />
          </label>

          <label className="grid gap-1">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-400">Date</span>
            <div className="relative z-20">
              <button
                type="button"
                onClick={() => setPickerOpen((current) => !current)}
                className="w-full min-w-[280px] rounded-lg border border-white/10 bg-card/60 px-3 py-2 text-left text-sm text-slate-100 hover:bg-white/[0.06] sm:min-w-[320px] transition-colors"
              >
                {getCreateDateLabel()}
              </button>

              {pickerOpen ? (
                <div className="absolute left-0 top-full z-[90] mt-2 w-[min(92vw,22rem)] rounded-xl border border-white/12 bg-[rgba(14,5,7,0.96)] p-3 shadow-[0_20px_50px_-12px_rgba(0,0,0,0.9)] backdrop-blur-xl">
                  <div className="mb-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setPickerMonth((prev) => subMonths(prev, 1))}
                      className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/[0.06]"
                    >
                      {"<"}
                    </button>
                    <div className="text-sm font-medium text-slate-200">{format(pickerMonth, "MMMM yyyy", { locale: fr })}</div>
                    <button
                      type="button"
                      onClick={() => setPickerMonth((prev) => addMonths(prev, 1))}
                      className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-300 hover:bg-white/[0.06]"
                    >
                      {">"}
                    </button>
                  </div>

                  <div className="mb-2 grid grid-cols-7 gap-1 text-center text-[11px] uppercase tracking-wide text-slate-500">
                    {["L", "M", "M", "J", "V", "S", "D"].map((dayLabel, index) => (
                      <div key={`${dayLabel}-${index}`}>{dayLabel}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {pickerDays.map((day) => {
                      const inMonth = isSameMonth(day, pickerMonth);
                      const selected = createDate ? isSameDay(day, createDate) : false;
                      return (
                        <button
                          key={day.toISOString()}
                          type="button"
                          onClick={() => {
                            const next = new Date(day);
                            const h = createDate ? createDate.getHours() : 21;
                            const m = createDate ? createDate.getMinutes() : 0;
                            next.setHours(h, m, 0, 0);
                            setCreateDate(next);
                          }}
                          className={`rounded-md px-2 py-1 text-xs transition-colors ${selected
                            ? "bg-[#7a1f2b] text-white"
                            : inMonth
                              ? "text-slate-200 hover:bg-white/[0.06]"
                              : "text-slate-600 hover:bg-white/[0.04]"
                          }`}
                        >
                          {format(day, "d")}
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex items-center gap-2">
                    <select
                      value={createDate ? createDate.getHours() : 21}
                      onChange={(event) => setHour(Number(event.target.value))}
                      className="rounded-md border border-slate-700 bg-card/60 px-2 py-1 text-sm text-slate-100"
                    >
                      {Array.from({ length: 24 }, (_, hour) => (
                        <option key={hour} value={hour}>{String(hour).padStart(2, "0")}</option>
                      ))}
                    </select>
                    <span className="text-slate-400">:</span>
                    <select
                      value={createDate ? createDate.getMinutes() : 0}
                      onChange={(event) => setMinute(Number(event.target.value))}
                      className="rounded-md border border-slate-700 bg-card/60 px-2 py-1 text-sm text-slate-100"
                    >
                      {[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map((minute) => (
                        <option key={minute} value={minute}>{String(minute).padStart(2, "0")}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => setPickerOpen(false)}
                      className="ml-auto rounded-md bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-900 hover:bg-white"
                    >
                      OK
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </label>

          <MotionButtonFrame>
            <button
              type="button"
              onClick={onCreate}
              disabled={saving}
              className="rounded-xl bg-gradient-to-r from-[#7a1f2b] to-[#9b2335] px-5 py-2 text-sm font-semibold text-white shadow-[0_8px_20px_-8px_rgba(155,35,53,0.55)] transition-all hover:-translate-y-px hover:shadow-[0_10px_24px_-8px_rgba(155,35,53,0.75)] disabled:opacity-50"
            >
              {saving ? "Création..." : "Créer réunion"}
            </button>
          </MotionButtonFrame>

          <MotionButtonFrame>
            <button
              type="button"
              onClick={() => void load()}
              disabled={loading}
              className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2 text-sm font-medium text-slate-400 hover:bg-white/[0.06] hover:text-slate-200 disabled:opacity-50 transition-colors"
            >
              {loading ? "…" : "↻ Actualiser"}
            </button>
          </MotionButtonFrame>
        </div>
      </SectionCard>

      {error ? <div className="rounded-lg border border-red-800/60 bg-red-950/40 px-4 py-2 text-sm text-red-300">{error}</div> : null}

      <SectionCard
        title="Réunions existantes"
        description="Accès direct aux réunions en cours, finalisées ou en brouillon."
        icon={CalendarDays}
      >
        {loading ? (
          <LoadingState title="Chargement des réunions" description="Les réunions staff sont en cours de récupération." />
        ) : items.length === 0 ? (
          <EmptyState
            icon={<CalendarDays className="h-12 w-12" />}
            title="Aucune réunion"
            description="Aucune réunion staff n'a encore été créée."
          />
        ) : (
          <div className="space-y-3">
            {items.map((item, index) => (
              <MotionListItem key={item.id} delay={index * 0.015} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0 space-y-1">
                    <Link href={`/staff/meetings/${item.id}`} className="block truncate text-sm font-semibold text-slate-100 hover:text-white">
                      {item.title || "Réunion staff"}
                    </Link>
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                      <span>{fmtDate(item.scheduledAt)}</span>
                      <span>•</span>
                      <span>Créée le {fmtDateTime(item.createdAt ?? item.updatedAt)}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 lg:justify-end">
                    {getStatusBadge(item)}
                    <StatusBadge>{fmtCounts(item.counts)}</StatusBadge>

                    <MotionButtonFrame>
                      <Link
                        href={`/staff/meetings/${item.id}`}
                        className="rounded-md border border-white/10 bg-card/60 px-2.5 py-1 text-xs font-medium text-slate-200 hover:bg-white/[0.06]"
                      >
                        Ouvrir
                      </Link>
                    </MotionButtonFrame>

                    <MotionButtonFrame>
                      <button
                        type="button"
                        onClick={() => void onDelete(item)}
                        disabled={!(["DRAFT", "IN_PROGRESS", "CANCELED"] as string[]).includes(String(item.status).toUpperCase())}
                        className="rounded-md border border-red-700/60 bg-red-900/30 px-2.5 py-1 text-xs font-medium text-red-300 hover:bg-red-900/50 disabled:opacity-40"
                        title="Suppression autorisée pour Brouillon/En cours/Annulée"
                      >
                        Supprimer
                      </button>
                    </MotionButtonFrame>
                  </div>
                </div>
              </MotionListItem>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
