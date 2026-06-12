"use client";

import { getErrorMessage } from "@/lib/errors";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  AlertCircle,
  Ban,
  Banknote,
  CalendarClock,
  CalendarOff,
  CheckCircle2,
  ChevronDown,
  Clock3,
  Gavel,
  Inbox,
  MessageSquare,
  MessageSquareWarning,
  RefreshCw,
  Scale,
  Send,
  UserMinus,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageShell } from "@/components/staff/ui/PageShell";
import { useConfirm } from "@/components/staff/ui/use-confirm";

// fmtDate centralisé via @/lib/app-date-formatter (DD/MM/YYYY HH:MM Bruxelles)
import { formatAppDate as fmtDate } from "@/lib/app-date-formatter";

type Job = {
  id: string;
  familyId: string;
  type: string;
  status: "PENDING" | "SENDING" | "SENT" | "FAILED" | "CANCELED";
  attempt: number;
  maxAttempts: number;
  nextAttemptAt: string;
  lastError: string | null;
  channelId: string | null;
  content: string | null;
  guildId: string | null;
  userDiscordId: string | null;
  roleId: string | null;
  meta: Record<string, unknown> | null;
  payload?: Record<string, unknown> | null;
  actorLabel: string | null;
  targetLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

type JobStatus = Job["status"];

// Traduction des types techniques en labels lisibles
const TYPE_LABELS: Record<string, string> = {
  SEND_MESSAGE:                    "Message Discord",
  ASSIGN_ROLE:                     "Attribution de rôle",
  REMOVE_ROLE:                     "Retrait de rôle",
  ME_ABSENCE_CREATED:              "Absence créée (membre)",
  ME_ABSENCE_JUSTIFIED:            "Justificatif d'absence (membre)",
  ME_SANCTION_JUSTIFIED:           "Justificatif de sanction (membre)",
  BANK_DEBT_PING_SINGLE:           "Rappel de dette",
  BANK_DEBT_PING_BATCH:            "Rappel de dettes (groupe)",
  ABSENCE_JUSTIFICATION_CREATED:   "Justificatif d'absence",
  SANCTION_JUSTIFICATION_CREATED:  "Justificatif de sanction",
  SANCTION_NOTIFY:                 "Notification de sanction",
  SANCTION_APPLY:                  "Application de sanction",
  RECRUITMENT_DECISION:            "Décision de recrutement",
  COMPLAINT_DECISION:              "Décision de plainte",
  MEETING_NOTIFY_UPSERT:           "Réunion programmée",
  MEETING_NOTIFY_RECAP:            "Compte-rendu de réunion",
  ACTIVITY_ALERT_INACTIVE:         "Alerte inactivité",
  ACTIVITY_ALERT_LOW:              "Alerte activité faible",
  ACTIVITY_ALERT_RECOMMEND_KICK:   "Recommandation d'exclusion",
  ACTIVITY_ACTION_NOTIFY:          "Notification d'action activité",
  ACTIVITY_DIGEST:                 "Résumé d'activité",
};

function getTypeLabel(type: string): string {
  return TYPE_LABELS[type] ?? type;
}

// Icône lucide par type d'action (fallback : Send)
const TYPE_ICONS: Record<string, LucideIcon> = {
  SEND_MESSAGE:                    MessageSquare,
  ASSIGN_ROLE:                     UserPlus,
  REMOVE_ROLE:                     UserMinus,
  ME_ABSENCE_CREATED:              CalendarOff,
  ME_ABSENCE_JUSTIFIED:            CalendarOff,
  ME_SANCTION_JUSTIFIED:           Scale,
  BANK_DEBT_PING_SINGLE:           Banknote,
  BANK_DEBT_PING_BATCH:            Banknote,
  ABSENCE_JUSTIFICATION_CREATED:   CalendarOff,
  SANCTION_JUSTIFICATION_CREATED:  Scale,
  SANCTION_NOTIFY:                 Gavel,
  SANCTION_APPLY:                  Gavel,
  RECRUITMENT_DECISION:            Users,
  COMPLAINT_DECISION:              MessageSquareWarning,
  MEETING_NOTIFY_UPSERT:           CalendarClock,
  MEETING_NOTIFY_RECAP:            CalendarClock,
  ACTIVITY_ALERT_INACTIVE:         Activity,
  ACTIVITY_ALERT_LOW:              Activity,
  ACTIVITY_ALERT_RECOMMEND_KICK:   Activity,
  ACTIVITY_ACTION_NOTIFY:          Activity,
  ACTIVITY_DIGEST:                 Activity,
};

function getTypeIcon(type: string): LucideIcon {
  return TYPE_ICONS[type] ?? Send;
}

// Traduction des statuts + couleurs des badges
const STATUS_CONFIG: Record<JobStatus, { label: string; badge: string; dot: string }> = {
  PENDING:  { label: "En attente", badge: "border-amber-500/30 bg-amber-500/15 text-amber-300",   dot: "bg-amber-400"   },
  SENDING:  { label: "En cours",   badge: "border-blue-500/30 bg-blue-500/15 text-blue-300",      dot: "bg-blue-400"    },
  SENT:     { label: "Envoyé",     badge: "border-emerald-500/30 bg-emerald-500/15 text-emerald-300", dot: "bg-emerald-400" },
  FAILED:   { label: "Échec",      badge: "border-red-500/30 bg-red-500/15 text-red-300",         dot: "bg-red-400"     },
  CANCELED: { label: "Annulé",     badge: "border-slate-500/30 bg-slate-500/15 text-slate-400",   dot: "bg-slate-400"   },
};

// Options de filtre statut (pilules)
const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "",         label: "Tous"       },
  { value: "PENDING",  label: "En attente" },
  { value: "SENDING",  label: "En cours"   },
  { value: "SENT",     label: "Envoyé"     },
  { value: "FAILED",   label: "Échec"      },
  { value: "CANCELED", label: "Annulé"     },
];

// Options de filtre type (uniquement ceux acceptés par l'API)
const TYPE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "",                               label: "Tous"                             },
  { value: "SEND_MESSAGE",                   label: "Message Discord"                  },
  { value: "ASSIGN_ROLE",                    label: "Attribution de rôle"              },
  { value: "REMOVE_ROLE",                    label: "Retrait de rôle"                  },
  { value: "ME_ABSENCE_CREATED",             label: "Absence créée (membre)"           },
  { value: "ME_ABSENCE_JUSTIFIED",           label: "Justificatif d'absence"           },
  { value: "ME_SANCTION_JUSTIFIED",          label: "Justificatif de sanction"         },
  { value: "BANK_DEBT_PING_SINGLE",          label: "Rappel de dette"                  },
  { value: "BANK_DEBT_PING_BATCH",           label: "Rappel de dettes (groupe)"        },
  { value: "ABSENCE_JUSTIFICATION_CREATED",  label: "Justificatif d'absence (staff)"   },
  { value: "SANCTION_JUSTIFICATION_CREATED", label: "Justificatif de sanction (staff)" },
];

// Mini-cartes compteurs (cliquables → filtre statut)
const COUNTER_CARDS: Array<{
  status: JobStatus;
  label: string;
  icon: LucideIcon;
  iconBox: string;
  activeCard: string;
}> = [
  {
    status: "PENDING",
    label: "En attente",
    icon: Clock3,
    iconBox: "border-amber-500/30 bg-amber-500/10 text-amber-300",
    activeCard: "border-amber-500/45 bg-amber-500/[0.08] shadow-[0_0_22px_-8px_rgba(245,158,11,0.45)]",
  },
  {
    status: "SENT",
    label: "Envoyés",
    icon: CheckCircle2,
    iconBox: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
    activeCard: "border-emerald-500/45 bg-emerald-500/[0.08] shadow-[0_0_22px_-8px_rgba(16,185,129,0.45)]",
  },
  {
    status: "FAILED",
    label: "Échoués",
    icon: AlertCircle,
    iconBox: "border-red-500/30 bg-red-500/10 text-red-300",
    activeCard: "border-red-500/45 bg-red-500/[0.08] shadow-[0_0_22px_-8px_rgba(239,68,68,0.45)]",
  },
  {
    status: "CANCELED",
    label: "Annulés",
    icon: Ban,
    iconBox: "border-slate-500/30 bg-slate-500/10 text-slate-300",
    activeCard: "border-slate-400/40 bg-slate-500/[0.08] shadow-[0_0_22px_-8px_rgba(148,163,184,0.35)]",
  },
];

const AUTO_REFRESH_MS = 15_000;

function fmtDateShort(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

/** Date relative ("il y a 5 min") — bascule en date courte au-delà de 30 jours. */
function relativeTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const diffMs = Date.now() - d.getTime();
  const future = diffMs < 0;
  const sec = Math.round(Math.abs(diffMs) / 1000);
  if (sec < 45) return future ? "dans un instant" : "à l'instant";
  const min = Math.round(sec / 60);
  if (min < 60) return future ? `dans ${min} min` : `il y a ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return future ? `dans ${h} h` : `il y a ${h} h`;
  const days = Math.round(h / 24);
  if (days < 30) return future ? `dans ${days} j` : `il y a ${days} j`;
  return fmtDateShort(iso);
}

/** Badge de statut coloré avec point lumineux */
function StatusBadge({ status }: { status: JobStatus }) {
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.CANCELED;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium ${cfg.badge}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

/** Pilule de filtre segmentée — active en ambre, inactive en white/5 */
function FilterPill({ active, label, onClick }: { active: boolean; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`btn-press rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "border-amber-500/45 bg-amber-500/15 text-amber-200 shadow-[0_0_14px_-5px_rgba(245,158,11,0.55)]"
          : "border-white/10 bg-white/5 text-slate-300 hover:bg-white/10 hover:text-slate-100"
      }`}
    >
      {label}
    </button>
  );
}

/** Message d'erreur tronqué, dépliable au clic */
function ErrorDetail({ message, expanded, onToggle }: { message: string; expanded: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      data-no-press
      className="group flex w-full items-start gap-1.5 text-left"
      title={expanded ? "Replier" : "Voir le message complet"}
    >
      <span className={`min-w-0 text-xs text-red-300/90 ${expanded ? "whitespace-pre-wrap break-words" : "truncate"}`}>
        {message}
      </span>
      <ChevronDown
        className={`mt-0.5 h-3 w-3 shrink-0 text-red-400/60 transition-transform group-hover:text-red-300 ${expanded ? "rotate-180" : ""}`}
      />
    </button>
  );
}

export default function DiscordOutboxClient() {
  const [items, setItems] = useState<Job[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [expandedErrorId, setExpandedErrorId] = useState<string | null>(null);
  const { confirm, dialog } = useConfirm();

  async function load(opts?: { silent?: boolean }) {
    const silent = opts?.silent ?? false;
    if (silent) {
      setRefreshing(true);
    } else {
      setLoading(true);
      setError(null);
    }
    try {
      const qs = new URLSearchParams();
      qs.set("familyId", "esperados");
      qs.set("page", String(page));
      qs.set("pageSize", String(pageSize));
      if (statusFilter) qs.set("status", statusFilter);
      if (typeFilter) qs.set("type", typeFilter);
      const res = await fetch(`/api/staff/discord/outbox?${qs.toString()}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Chargement échoué");
      setItems(json.data ?? []);
      setTotal(json.total ?? 0);
    } catch (err: unknown) {
      // En refresh silencieux on garde la liste affichée — pas de flash d'erreur
      if (!silent) {
        setItems([]);
        setError(getErrorMessage(err));
      }
    } finally {
      if (silent) setRefreshing(false);
      else setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter, typeFilter, page]);

  // Auto-refresh toutes les 15 s — en pause quand l'onglet est caché
  const loadRef = useRef(load);
  useEffect(() => { loadRef.current = load; });
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        loadRef.current({ silent: true });
      }
    }, AUTO_REFRESH_MS);
    return () => window.clearInterval(id);
  }, []);

  async function cancelJob(id: string) {
    setCancellingId(id);
    try {
      const res = await fetch("/api/staff/discord/outbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Annulation échouée");
      await load();
    } catch (err: unknown) {
      setError(getErrorMessage(err));
      setTimeout(() => setError(null), 5000);
    } finally {
      setCancellingId(null);
    }
  }

  async function onCancelClick(job: Job) {
    const ok = await confirm({
      title: `Annuler « ${getTypeLabel(job.type)} » ?`,
      description: "L'action ne sera pas envoyée sur Discord.",
      confirmLabel: "Annuler l'envoi",
      cancelLabel: "Garder",
      tone: "danger",
    });
    if (!ok) return;
    cancelJob(job.id);
  }

  function toggleStatusFilter(status: JobStatus) {
    setStatusFilter((current) => (current === status ? "" : status));
    setPage(1);
  }

  // Compteurs calculés depuis les jobs chargés
  const counts: Record<JobStatus, number> = { PENDING: 0, SENDING: 0, SENT: 0, FAILED: 0, CANCELED: 0 };
  for (const job of items) counts[job.status] = (counts[job.status] ?? 0) + 1;

  const hasFilters = Boolean(statusFilter || typeFilter);

  return (
    <PageShell
      title="File d'envoi Discord"
      description="Suivi des messages et actions en attente d'envoi vers Discord"
      icon={Inbox}
      actions={
        <>
          <span
            className="hidden items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-400 sm:inline-flex"
            title="La liste se rafraîchit automatiquement toutes les 15 secondes (en pause quand l'onglet est caché)."
          >
            <span className={`h-1.5 w-1.5 rounded-full ${refreshing ? "bg-amber-400" : "bg-emerald-400/80"} animate-pulse`} />
            Auto · 15 s
          </span>
          <button
            type="button"
            onClick={() => load()}
            disabled={loading}
            className="btn-press btn-press-amber inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 px-3.5 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/15 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading || refreshing ? "animate-spin" : ""}`} />
            Rafraîchir
          </button>
        </>
      }
    >
      {dialog}

      <div className="space-y-4">
        {/* Mini-cartes compteurs — cliquer = filtrer par statut (toggle) */}
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {COUNTER_CARDS.map((card) => {
            const CardIcon = card.icon;
            const active = statusFilter === card.status;
            return (
              <button
                key={card.status}
                type="button"
                onClick={() => toggleStatusFilter(card.status)}
                title={active ? "Retirer le filtre" : `Filtrer : ${card.label.toLowerCase()}`}
                className={`btn-press premium-surface-elevated relative overflow-hidden rounded-2xl border p-4 text-left transition-colors ${
                  active
                    ? card.activeCard
                    : "border-white/8 bg-white/[0.03] hover:border-white/15 hover:bg-white/[0.06]"
                }`}
              >
                <div className="relative flex items-center gap-3">
                  <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${card.iconBox}`}>
                    <CardIcon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-2xl font-bold leading-tight tracking-tight text-slate-50">
                      {counts[card.status]}
                    </div>
                    <div className="truncate text-xs text-slate-400">{card.label}</div>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Filtres en pilules segmentées */}
        <div className="premium-surface-elevated relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-4">
          <div className="relative space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Statut
              </span>
              {STATUS_FILTER_OPTIONS.map((o) => (
                <FilterPill
                  key={o.value || "all"}
                  active={statusFilter === o.value}
                  label={o.label}
                  onClick={() => { setStatusFilter(o.value); setPage(1); }}
                />
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="w-14 shrink-0 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Type
              </span>
              {TYPE_FILTER_OPTIONS.map((o) => (
                <FilterPill
                  key={o.value || "all"}
                  active={typeFilter === o.value}
                  label={o.label}
                  onClick={() => { setTypeFilter(o.value); setPage(1); }}
                />
              ))}
            </div>
            {total > 0 && (
              <div className="text-right text-xs text-slate-500">
                {total} action{total > 1 ? "s" : ""} au total
              </div>
            )}
          </div>
        </div>

        {/* Erreur */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {/* Liste */}
        {loading && items.length === 0 ? (
          <div className="premium-surface-elevated relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] px-6 py-14 text-center text-sm text-slate-400">
            Chargement…
          </div>
        ) : items.length === 0 ? (
          <div className="premium-surface-elevated relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] px-6 py-14 text-center">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.07),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(155,35,53,0.07),transparent_38%)]" />
            <div className="relative space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl border border-[#9b2335]/40 bg-gradient-to-br from-[#9b2335]/30 to-[#5a1620]/15 shadow-[0_10px_28px_-8px_rgba(155,35,53,0.5)]">
                <Inbox className="h-6 w-6 text-amber-300" />
              </div>
              {hasFilters ? (
                <>
                  <p className="text-sm text-slate-300">Aucun résultat pour ces filtres.</p>
                  <button
                    type="button"
                    onClick={() => { setStatusFilter(""); setTypeFilter(""); setPage(1); }}
                    className="btn-press inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/10 hover:text-slate-100"
                  >
                    <X className="h-3 w-3" />
                    Réinitialiser les filtres
                  </button>
                </>
              ) : (
                <p className="text-sm text-slate-300">Aucun message en file — tout est parti ✉️</p>
              )}
            </div>
          </div>
        ) : (
          <>
            {/* Table premium (desktop) */}
            <div className="premium-surface-elevated relative hidden overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] md:block">
              <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#9b2335]/60 to-transparent" />
              <div className="relative overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-white/8 bg-white/[0.03]">
                    <tr>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Action
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Statut
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Auteur
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Cible
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Créé
                      </th>
                      <th className="whitespace-nowrap px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                        Détail
                      </th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((job) => {
                      const TypeIcon = getTypeIcon(job.type);
                      const isCancelling = cancellingId === job.id;
                      const errorExpanded = expandedErrorId === job.id;

                      return (
                        <tr key={job.id} className="border-b border-white/[0.04] transition-colors last:border-b-0 hover:bg-white/[0.03]">
                          {/* Action */}
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#7a1f2b]/40 bg-gradient-to-br from-[#7a1f2b]/30 to-[#4a0f18]/15">
                                <TypeIcon className="h-4 w-4 text-amber-300/90" />
                              </div>
                              <span className="font-medium text-slate-100">{getTypeLabel(job.type)}</span>
                            </div>
                          </td>

                          {/* Statut */}
                          <td className="px-4 py-3">
                            <StatusBadge status={job.status} />
                          </td>

                          {/* Auteur */}
                          <td className="whitespace-nowrap px-4 py-3">
                            {job.actorLabel && job.actorLabel !== "Système" ? (
                              <span className="font-medium text-slate-200">{job.actorLabel}</span>
                            ) : (
                              <span className="text-xs italic text-slate-500">Système</span>
                            )}
                          </td>

                          {/* Cible */}
                          <td className="max-w-[180px] px-4 py-3 text-slate-300">
                            <span className="block truncate" title={job.targetLabel ?? undefined}>
                              {job.targetLabel || "—"}
                            </span>
                          </td>

                          {/* Date relative + absolue au survol + tentatives */}
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-400">
                            <span title={fmtDate(job.createdAt)} className="cursor-default underline decoration-dotted decoration-white/15 underline-offset-2">
                              {relativeTime(job.createdAt)}
                            </span>
                            {job.attempt > 0 && (
                              <div className="mt-0.5 text-[11px] text-slate-500">
                                {job.attempt}/{job.maxAttempts} tentative{job.attempt > 1 ? "s" : ""}
                              </div>
                            )}
                            {job.status === "PENDING" && job.nextAttemptAt && (
                              <div className="mt-0.5 text-[11px] text-amber-400/70" title={fmtDate(job.nextAttemptAt)}>
                                Prochain essai {relativeTime(job.nextAttemptAt)}
                              </div>
                            )}
                          </td>

                          {/* Erreur tronquée dépliable */}
                          <td className="max-w-[260px] px-4 py-3">
                            {job.lastError ? (
                              <ErrorDetail
                                message={job.lastError}
                                expanded={errorExpanded}
                                onToggle={() => setExpandedErrorId(errorExpanded ? null : job.id)}
                              />
                            ) : (
                              <span className="text-xs text-slate-600">—</span>
                            )}
                          </td>

                          {/* Annuler (PENDING uniquement) */}
                          <td className="px-4 py-3 text-right">
                            {job.status === "PENDING" ? (
                              <button
                                type="button"
                                disabled={isCancelling}
                                onClick={() => onCancelClick(job)}
                                className="btn-press btn-press-bordeaux inline-flex items-center gap-1 rounded-lg border border-red-500/25 bg-red-500/[0.06] px-2.5 py-1.5 text-xs font-medium text-red-300 hover:border-red-500/45 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                              >
                                {isCancelling ? (
                                  "Annulation…"
                                ) : (
                                  <>
                                    <X className="h-3 w-3" />
                                    Annuler
                                  </>
                                )}
                              </button>
                            ) : (
                              <span className="text-xs text-slate-600">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Cartes (mobile) */}
            <div className="space-y-3 md:hidden">
              {items.map((job) => {
                const TypeIcon = getTypeIcon(job.type);
                const isCancelling = cancellingId === job.id;
                const errorExpanded = expandedErrorId === job.id;

                return (
                  <div
                    key={job.id}
                    className="premium-surface-elevated relative overflow-hidden rounded-2xl border border-white/8 bg-white/[0.03] p-4"
                  >
                    <div className="relative space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#7a1f2b]/40 bg-gradient-to-br from-[#7a1f2b]/30 to-[#4a0f18]/15">
                            <TypeIcon className="h-4 w-4 text-amber-300/90" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-slate-100">{getTypeLabel(job.type)}</div>
                            <div className="text-[11px] text-slate-500" title={fmtDate(job.createdAt)}>
                              {relativeTime(job.createdAt)}
                            </div>
                          </div>
                        </div>
                        <StatusBadge status={job.status} />
                      </div>

                      <div className="space-y-1 text-xs text-slate-400">
                        <div>
                          <span className="text-slate-500">Par : </span>
                          {job.actorLabel && job.actorLabel !== "Système" ? (
                            <span className="font-medium text-slate-200">{job.actorLabel}</span>
                          ) : (
                            <span className="italic">Système</span>
                          )}
                        </div>
                        {job.targetLabel && job.targetLabel !== "—" && (
                          <div>
                            <span className="text-slate-500">Cible : </span>
                            <span className="text-slate-300">{job.targetLabel}</span>
                          </div>
                        )}
                        {job.attempt > 0 && (
                          <div>
                            <span className="text-slate-500">Tentatives : </span>
                            {job.attempt}/{job.maxAttempts}
                          </div>
                        )}
                        {job.status === "PENDING" && job.nextAttemptAt && (
                          <div className="text-amber-400/70" title={fmtDate(job.nextAttemptAt)}>
                            Prochain essai {relativeTime(job.nextAttemptAt)}
                          </div>
                        )}
                      </div>

                      {job.lastError && (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/[0.06] px-2.5 py-2">
                          <ErrorDetail
                            message={job.lastError}
                            expanded={errorExpanded}
                            onToggle={() => setExpandedErrorId(errorExpanded ? null : job.id)}
                          />
                        </div>
                      )}

                      {job.status === "PENDING" && (
                        <button
                          type="button"
                          disabled={isCancelling}
                          onClick={() => onCancelClick(job)}
                          className="btn-press btn-press-bordeaux inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-red-500/25 bg-red-500/[0.06] px-3 py-2 text-xs font-medium text-red-300 hover:border-red-500/45 hover:bg-red-500/15 disabled:cursor-not-allowed disabled:opacity-50"
                        >
                          {isCancelling ? (
                            "Annulation…"
                          ) : (
                            <>
                              <X className="h-3.5 w-3.5" />
                              Annuler l&apos;envoi
                            </>
                          )}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between text-xs text-slate-400">
            <span>
              Page {page} / {totalPages} · {total} élément{total > 1 ? "s" : ""}
            </span>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                className="btn-press btn-press-neutral rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Précédent
              </button>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                className="btn-press btn-press-neutral rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
              >
                Suivant
              </button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}
