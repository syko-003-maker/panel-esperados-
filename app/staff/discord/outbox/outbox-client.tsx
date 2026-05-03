"use client";

import { useEffect, useState } from "react";
import { RefreshCw, AlertCircle, Inbox, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge-new";
import { Card } from "@/components/ui/card";
import { PageShell } from "@/components/staff/ui/PageShell";
import { StyledSelect } from "@/components/staff/ui/StyledSelect";

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

// Traduction des statuts
type JobStatus = Job["status"];

const STATUS_CONFIG: Record<JobStatus, { label: string; tone: "warning" | "info" | "success" | "danger" | "neutral" }> = {
  PENDING:  { label: "En attente",  tone: "warning" },
  SENDING:  { label: "En cours",    tone: "info"    },
  SENT:     { label: "Envoyé",      tone: "success" },
  FAILED:   { label: "Échec",       tone: "danger"  },
  CANCELED: { label: "Annulé",      tone: "neutral" },
};

// Options de filtre statut
const STATUS_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "",         label: "Tous les statuts" },
  { value: "PENDING",  label: "En attente"        },
  { value: "SENDING",  label: "En cours"           },
  { value: "SENT",     label: "Envoyé"             },
  { value: "FAILED",   label: "Échec"              },
  { value: "CANCELED", label: "Annulé"             },
];

// Options de filtre type (uniquement ceux acceptés par l'API)
const TYPE_FILTER_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "",                             label: "Tous les types"              },
  { value: "SEND_MESSAGE",                 label: "Message Discord"             },
  { value: "ASSIGN_ROLE",                  label: "Attribution de rôle"         },
  { value: "REMOVE_ROLE",                  label: "Retrait de rôle"             },
  { value: "ME_ABSENCE_CREATED",           label: "Absence créée (membre)"      },
  { value: "ME_ABSENCE_JUSTIFIED",         label: "Justificatif d'absence"      },
  { value: "ME_SANCTION_JUSTIFIED",        label: "Justificatif de sanction"    },
  { value: "BANK_DEBT_PING_SINGLE",        label: "Rappel de dette"             },
  { value: "BANK_DEBT_PING_BATCH",         label: "Rappel de dettes (groupe)"   },
  { value: "ABSENCE_JUSTIFICATION_CREATED",  label: "Justificatif d'absence (staff)"  },
  { value: "SANCTION_JUSTIFICATION_CREATED", label: "Justificatif de sanction (staff)" },
];

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function fmtDateShort(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
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
  const [error, setError] = useState<string | null>(null);
  const [cancellingId, setCancellingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
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
    } catch (err: any) {
      setItems([]);
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [statusFilter, typeFilter, page]);

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
    } catch (err: any) {
      setError(String(err?.message ?? err));
      setTimeout(() => setError(null), 5000);
    } finally {
      setCancellingId(null);
    }
  }

  const pendingCount  = items.filter((j) => j.status === "PENDING").length;
  const failedCount   = items.filter((j) => j.status === "FAILED").length;

  return (
    <PageShell
      title="File d'envoi Discord"
      description="Suivi des messages et actions en attente d'envoi vers Discord"
      icon={Inbox}
    >
      <div className="space-y-4">
        {/* Résumé rapide */}
        {(pendingCount > 0 || failedCount > 0) && (
          <div className="flex flex-wrap gap-3">
            {pendingCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-amber-500/30 bg-amber-500/10 text-sm text-amber-200">
                <span className="font-semibold">{pendingCount}</span>
                <span>en attente sur cette page</span>
              </div>
            )}
            {failedCount > 0 && (
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-sm text-red-200">
                <AlertCircle className="h-4 w-4" />
                <span className="font-semibold">{failedCount}</span>
                <span>en échec sur cette page</span>
              </div>
            )}
          </div>
        )}

        {/* Filtres */}
        <Card className="p-4 bg-slate-900/40 border-slate-800">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-col gap-1 min-w-[160px]">
              <label className="text-xs font-medium text-muted-foreground">Statut</label>
              <StyledSelect
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
              >
                {STATUS_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </StyledSelect>
            </div>
            <div className="flex flex-col gap-1 min-w-[200px]">
              <label className="text-xs font-medium text-muted-foreground">Type d'action</label>
              <StyledSelect
                value={typeFilter}
                onChange={(e) => { setTypeFilter(e.target.value); setPage(1); }}
              >
                {TYPE_FILTER_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </StyledSelect>
            </div>
            <div className="flex flex-col gap-1 mt-auto">
              <label className="text-xs font-medium text-muted-foreground invisible">.</label>
              <Button variant="outline" size="sm" onClick={load} disabled={loading} className="rounded-xl border-white/10 bg-white/[0.04]">
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
                Actualiser
              </Button>
            </div>
            <div className="ml-auto text-xs text-muted-foreground self-end pb-1">
              {total > 0 ? `${total} action${total > 1 ? "s" : ""} au total` : ""}
            </div>
          </div>
        </Card>

        {/* Erreur */}
        {error && (
          <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>{error}</div>
          </div>
        )}

        {/* Liste */}
        {loading && items.length === 0 ? (
          <div className="text-center py-10 text-sm text-muted-foreground">Chargement...</div>
        ) : items.length === 0 ? (
          <Card className="p-12 bg-slate-900/20 border-slate-800 text-center">
            <Inbox className="h-10 w-10 mx-auto mb-3 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {statusFilter || typeFilter ? "Aucun résultat pour ces filtres." : "La file d'envoi est vide."}
            </p>
          </Card>
        ) : (
          <Card className="overflow-hidden bg-slate-900/40 border-slate-800">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-900/60 border-b border-slate-800">
                  <tr>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      Action
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      Statut
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      Auteur
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      Cible
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      Tentatives
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      Créé le
                    </th>
                    <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide whitespace-nowrap">
                      Détail
                    </th>
                    <th className="py-3 px-4" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((job, idx) => {
                    const statusCfg = STATUS_CONFIG[job.status] ?? { label: job.status, tone: "neutral" as const };
                    const isCancelling = cancellingId === job.id;

                    return (
                      <tr
                        key={job.id}
                        className={`border-b border-slate-800/40 hover:bg-slate-800/20 transition-colors ${idx % 2 === 0 ? "bg-slate-900/10" : ""}`}
                      >
                        {/* Action */}
                        <td className="py-3 px-4">
                          <div className="font-medium text-foreground">{getTypeLabel(job.type)}</div>
                        </td>

                        {/* Statut */}
                        <td className="py-3 px-4">
                          <StatusBadgeSimple status={job.status} label={statusCfg.label} />
                        </td>

                        {/* Auteur */}
                        <td className="py-3 px-4 text-sm text-muted-foreground whitespace-nowrap">
                          {job.actorLabel && job.actorLabel !== "Système" ? (
                            <span className="text-foreground font-medium">{job.actorLabel}</span>
                          ) : (
                            <span className="text-muted-foreground italic text-xs">Système</span>
                          )}
                        </td>

                        {/* Cible */}
                        <td className="py-3 px-4 text-sm text-muted-foreground max-w-[180px]">
                          <span className="truncate block">{job.targetLabel || "—"}</span>
                        </td>

                        {/* Tentatives */}
                        <td className="py-3 px-4 text-sm text-muted-foreground whitespace-nowrap">
                          {job.attempt}/{job.maxAttempts}
                          {job.status === "PENDING" && job.nextAttemptAt && (
                            <div className="text-[11px] text-amber-400/70 mt-0.5">
                              Prochain : {fmtDateShort(job.nextAttemptAt)}
                            </div>
                          )}
                        </td>

                        {/* Date */}
                        <td className="py-3 px-4 text-xs text-muted-foreground whitespace-nowrap">
                          {fmtDate(job.createdAt)}
                        </td>

                        {/* Détail / erreur */}
                        <td className="py-3 px-4 max-w-[240px]">
                          {job.lastError ? (
                            <div className="text-xs text-red-300 truncate" title={job.lastError}>
                              {job.lastError}
                            </div>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="py-3 px-4 text-right">
                          {job.status === "PENDING" ? (
                            <Button
                              variant="outline"
                              size="sm"
                              disabled={isCancelling}
                              onClick={() => cancelJob(job.id)}
                              className="h-7 px-2 text-xs border-red-500/20 text-red-400 hover:bg-red-500/10 hover:border-red-500/40"
                            >
                              {isCancelling ? (
                                "..."
                              ) : (
                                <><X className="h-3 w-3 mr-1" />Annuler</>
                              )}
                            </Button>
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

        {/* Pagination */}
        {total > pageSize && (
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Page {page} / {totalPages} · {total} élément{total > 1 ? "s" : ""}</span>
            <div className="flex gap-2">
              <Button
                variant="outline" size="sm"
                className="rounded-xl border-white/10 bg-white/[0.04]"
                disabled={page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Précédent
              </Button>
              <Button
                variant="outline" size="sm"
                className="rounded-xl border-white/10 bg-white/[0.04]"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              >
                Suivant
              </Button>
            </div>
          </div>
        )}
      </div>
    </PageShell>
  );
}

// Badge de statut inline (sans importer StatusBadge pour éviter les dépendances circulaires)
function StatusBadgeSimple({ status, label }: { status: JobStatus; label: string }) {
  const colors: Record<JobStatus, string> = {
    PENDING:  "bg-amber-500/15 text-amber-300 border-amber-500/30",
    SENDING:  "bg-blue-500/15 text-blue-300 border-blue-500/30",
    SENT:     "bg-green-500/15 text-green-300 border-green-500/30",
    FAILED:   "bg-red-500/15 text-red-300 border-red-500/30",
    CANCELED: "bg-slate-500/15 text-slate-400 border-slate-500/30",
  };
  return (
    <span className={`inline-flex items-center text-xs font-medium px-2 py-0.5 rounded-full border ${colors[status]}`}>
      {label}
    </span>
  );
}
