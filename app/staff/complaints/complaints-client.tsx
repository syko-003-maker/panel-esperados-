"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Search } from "lucide-react";
import { DataTile } from "@/components/staff/ui/DataTile";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { MotionButtonFrame } from "@/components/staff/ui/motion";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { SkeletonTable } from "@/components/staff/ui/Skeletons";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { StyledSelect } from "@/components/staff/ui/StyledSelect";
import { Button } from "@/components/ui/button";

type Complaint = {
  id: string;
  ticketKey: string | null;
  title: string;
  status: "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED" | "CLOSED";
  authorDiscordId: string | null;
  authorTag: string | null;
  authorRpName: string | null;
  targetName: string | null;
  reason: string | null;
  discordThreadId: string | null;
  closedAt: string | null;
  closedByDiscordId: string | null;
  closeReason: string | null;
  createdAt: string;
  updatedAt: string;
};

const VALID_STATUSES: Complaint["status"][] = ["OPEN", "IN_REVIEW", "RESOLVED", "REJECTED", "CLOSED"];

const STATUS_LABELS: Record<Complaint["status"], string> = {
  OPEN: "Ouverte",
  IN_REVIEW: "En cours",
  RESOLVED: "Résolue",
  REJECTED: "Refusée",
  CLOSED: "Fermée",
};

const STATUS_TONES: Record<Complaint["status"], "danger" | "info" | "success" | "warning" | "neutral"> = {
  OPEN: "danger",
  IN_REVIEW: "warning",
  RESOLVED: "success",
  REJECTED: "neutral",
  CLOSED: "neutral",
};

const STATUS_ACCENT: Record<Complaint["status"], string> = {
  OPEN: "border-l-red-500/60",
  IN_REVIEW: "border-l-amber-500/60",
  RESOLVED: "border-l-emerald-500/50",
  REJECTED: "border-l-white/20",
  CLOSED: "border-l-white/20",
};

const STATUS_DOT: Record<Complaint["status"], string> = {
  OPEN: "bg-red-400",
  IN_REVIEW: "bg-amber-400",
  RESOLVED: "bg-emerald-400",
  REJECTED: "bg-slate-500",
  CLOSED: "bg-slate-600",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export default function ComplaintsClient() {
  const [items, setItems] = useState<Complaint[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | Complaint["status"]>("");
  const [q, setQ] = useState("");
  const [pendingQ, setPendingQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(20);
  const [total, setTotal] = useState(0);
  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      if (q) qs.set("q", q);
      qs.set("page", String(page));
      qs.set("pageSize", String(pageSize));
      const res = await fetch(`/api/staff/complaints?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Échec du chargement");
      setItems(data.data ?? []);
      setTotal(data.total ?? 0);
    } catch (err: unknown) {
      setItems([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, q, page]);

  const stats = {
    total,
    open: items.filter((i) => i.status === "OPEN").length,
    inReview: items.filter((i) => i.status === "IN_REVIEW").length,
    resolved: items.filter((i) => i.status === "RESOLVED").length,
    closed: items.filter((i) => i.status === "REJECTED" || i.status === "CLOSED").length,
  };

  return (
    <div className="grid gap-6">
      <div className="flex justify-end">
        <MotionButtonFrame>
          <Button onClick={() => load()} variant="outline" size="sm" className="rounded-2xl border-white/10 bg-white/[0.04]">
            Recharger
          </Button>
        </MotionButtonFrame>
      </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {[
            { label: "Total", value: total, tone: "default" as const },
            { label: "Ouvertes", value: stats.open, tone: "danger" as const },
            { label: "En cours", value: stats.inReview, tone: "info" as const },
            { label: "Résolues", value: stats.resolved, tone: "success" as const },
          ].map(({ label, value, tone }) => (
            <DataTile key={label} label={label} value={<span className="text-2xl font-semibold">{value}</span>} tone={tone} />
          ))}
        </div>

        {/* Filters */}
        <SectionCard
          title="Liste des plaintes"
          description={`${total} plainte${total !== 1 ? "s" : ""} au total`}
          icon={Search}
          actions={statusFilter || q ? <StatusBadge tone="info">Filtres actifs</StatusBadge> : <StatusBadge>{pageSize} / page</StatusBadge>}
        >
          <div className="space-y-4">
            <div className="flex flex-col sm:flex-row gap-3 items-center">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  type="text"
                  value={pendingQ}
                  onChange={(e) => setPendingQ(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { setQ(pendingQ); setPage(1); } }}
                  placeholder="Ticket, auteur, cible..."
                  className="w-full rounded-xl border border-white/10 bg-[rgba(10,4,6,0.85)] pl-9 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
                />
              </div>
              <StyledSelect
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
                className="w-full sm:w-auto min-w-[160px]"
              >
                <option value="">Tous les statuts</option>
                {VALID_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </StyledSelect>
              {(statusFilter || q) && (
                <button
                  onClick={() => { setStatusFilter(""); setQ(""); setPendingQ(""); setPage(1); }}
                  className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300 hover:bg-white/[0.08] transition-colors"
                >
                  Réinitialiser
                </button>
              )}
              {(pendingQ !== q) && (
                <button
                  onClick={() => { setQ(pendingQ); setPage(1); }}
                  className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-200 hover:bg-amber-500/20 transition-colors"
                >
                  Chercher
                </button>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
                <span className="shrink-0">❌</span>
                <div>{error}</div>
              </div>
            )}

            {loading ? (
              <SkeletonTable rows={5} cols={6} />
            ) : items.length === 0 ? (
              <EmptyState
                title="Aucune plainte"
                description="Aucune plainte trouvée pour les filtres actuels"
                icon="⚠️"
              />
            ) : (
              <div className="mt-4 flex flex-col gap-1.5">
                {items.map((c) => (
                  <Link
                    key={c.id}
                    href={`/staff/complaints/${c.id}`}
                    className={`group flex items-center gap-3 rounded-xl border border-white/8 border-l-2 ${STATUS_ACCENT[c.status]} bg-white/[0.02] pl-3 pr-4 py-3 transition-all hover:border-white/15 hover:bg-white/[0.05]`}
                  >
                    {/* Status dot */}
                    <span className={`w-2 h-2 rounded-full shrink-0 ${STATUS_DOT[c.status]}`} />

                    {/* Author + target + reason */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline gap-1.5 flex-wrap">
                        <span className="text-sm font-semibold text-slate-100">
                          {c.authorRpName ?? c.authorTag ?? "—"}
                        </span>
                        {c.targetName && (
                          <>
                            <span className="text-slate-600 text-[11px]">contre</span>
                            <span className="text-xs font-medium text-rose-300/80">{c.targetName}</span>
                          </>
                        )}
                      </div>
                      {(c.reason || c.title) && (
                        <p className="mt-0.5 text-xs text-slate-500 truncate">
                          {c.reason ?? c.title}
                        </p>
                      )}
                    </div>

                    {/* Status badge + date */}
                    <div className="shrink-0 flex flex-col items-end gap-1.5">
                      <StatusBadge tone={STATUS_TONES[c.status]} className="text-[11px] px-2 py-0.5">
                        {STATUS_LABELS[c.status]}
                      </StatusBadge>
                      <span className="text-[10px] text-slate-600 tabular-nums">{fmtDate(c.createdAt)}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {total > 0 && (
              <div className="flex items-center justify-between pt-2 text-xs text-muted-foreground">
                <span>
                  Page {page} / {totalPages} · {total} plainte{total !== 1 ? "s" : ""}
                </span>
                <div className="flex gap-2">
                  <MotionButtonFrame>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage((p) => Math.max(1, p - 1))}
                      className="rounded-2xl border-white/10 bg-white/[0.04]"
                    >
                      Précédent
                    </Button>
                  </MotionButtonFrame>
                  <MotionButtonFrame>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={page >= totalPages}
                      onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                      className="rounded-2xl border-white/10 bg-white/[0.04]"
                    >
                      Suivant
                    </Button>
                  </MotionButtonFrame>
                </div>
              </div>
            )}
          </div>
        </SectionCard>
    </div>
  );
}
