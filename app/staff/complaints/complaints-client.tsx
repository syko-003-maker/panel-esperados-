"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { AlertCircle, Search } from "lucide-react";
import { DataTile } from "@/components/staff/ui/DataTile";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { MotionButtonFrame } from "@/components/staff/ui/motion";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { SkeletonTable } from "@/components/staff/ui/Skeletons";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

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
  IN_REVIEW: "info",
  RESOLVED: "success",
  REJECTED: "warning",
  CLOSED: "neutral",
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
            <div className="flex flex-col sm:flex-row gap-3 items-end">
              <div className="flex-1 flex gap-2">
                <Input
                  type="text"
                  value={pendingQ}
                  onChange={(e) => setPendingQ(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") { setQ(pendingQ); setPage(1); }
                  }}
                  placeholder="Rechercher ticket, auteur, cible..."
                  className="bg-card/70 border-white/8"
                />
                <MotionButtonFrame>
                  <Button
                    variant="outline"
                    onClick={() => { setQ(pendingQ); setPage(1); }}
                    className="rounded-2xl border-white/10 bg-white/[0.04]"
                  >
                    Chercher
                  </Button>
                </MotionButtonFrame>
              </div>
              <select
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
                className="px-3 py-2 rounded-lg bg-card/70 border border-white/8 text-foreground text-sm focus:outline-none"
              >
                <option value="">Tous les statuts</option>
                {VALID_STATUSES.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
              {(statusFilter || q) && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setStatusFilter(""); setQ(""); setPendingQ(""); setPage(1); }}
                  className="rounded-2xl"
                >
                  Réinitialiser
                </Button>
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
              <>
                {/* Mobile cards */}
                <div className="md:hidden flex flex-col gap-3">
                  {items.map((c) => (
                    <div key={c.id} className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3 flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-xs text-amber-400">{c.ticketKey ?? c.id.slice(0, 8)}</span>
                        <StatusBadge tone={STATUS_TONES[c.status]}>{STATUS_LABELS[c.status]}</StatusBadge>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">{c.authorRpName ?? c.authorTag ?? "—"}</span>
                        {c.authorRpName && c.authorTag && (
                          <span className="text-[11px] text-muted-foreground">{c.authorTag}</span>
                        )}
                        {c.targetName && (
                          <span className="text-xs text-muted-foreground">→ {c.targetName}</span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground line-clamp-2">{c.reason ?? c.title ?? "—"}</div>
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[11px] text-muted-foreground">{fmtDate(c.createdAt)}</span>
                        <Link href={`/staff/complaints/${c.id}`} className="text-xs text-primary hover:underline">
                          Voir →
                        </Link>
                      </div>
                    </div>
                  ))}
                </div>

                {/* Desktop table */}
                <div className="hidden md:block overflow-x-auto rounded-xl border border-white/8">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-white/8 bg-card/40">
                        {["Ticket", "Auteur", "Cible", "Raison", "Statut", "Créée le", ""].map((h, i) => (
                          <th
                            key={h || i}
                            className={`px-3 md:px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-muted-foreground whitespace-nowrap ${
                              h === "Cible" ? "hidden sm:table-cell" : h === "Créée le" ? "hidden lg:table-cell" : ""
                            }`}
                          >
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {items.map((c, idx) => (
                        <tr
                          key={c.id}
                          className={`border-b border-white/5 hover:bg-white/[0.03] transition-colors ${idx % 2 === 0 ? "bg-white/[0.015]" : ""}`}
                        >
                          <td className="px-4 py-3">
                            <span className="font-mono text-xs text-amber-400">
                              {c.ticketKey ?? c.id.slice(0, 8)}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="text-foreground text-sm">{c.authorRpName ?? c.authorTag ?? "—"}</div>
                            {c.authorRpName && c.authorTag && (
                              <div className="text-[11px] text-muted-foreground">{c.authorTag}</div>
                            )}
                          </td>
                          <td className="hidden sm:table-cell px-3 md:px-4 py-3 text-sm text-muted-foreground">
                            {c.targetName ?? "—"}
                          </td>
                          <td className="px-3 md:px-4 py-3 max-w-[140px] md:max-w-[220px]">
                            <div className="text-xs text-foreground truncate" title={c.reason ?? undefined}>
                              {c.reason ?? c.title ?? "—"}
                            </div>
                          </td>
                          <td className="px-3 md:px-4 py-3">
                            <StatusBadge tone={STATUS_TONES[c.status]}>
                              {STATUS_LABELS[c.status]}
                            </StatusBadge>
                          </td>
                          <td className="hidden lg:table-cell px-3 md:px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                            {fmtDate(c.createdAt)}
                          </td>
                          <td className="px-4 py-3">
                            <Link
                              href={`/staff/complaints/${c.id}`}
                              className="text-xs text-primary hover:underline whitespace-nowrap"
                            >
                              Voir →
                            </Link>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
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
