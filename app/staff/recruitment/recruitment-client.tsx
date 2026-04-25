"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge-new";
import { RefreshCw, Search, Trash2, Users } from "lucide-react";

type DbStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "ARCHIVED";

type Ticket = {
  id: string;
  status: DbStatus;
  isClaimed: boolean;
  candidateRpName: string;
  candidateSteamId: string | null;
  candidateDiscordId: string | null;
  ticketKey: string | null;
  discordThreadId: string | null;
  createdAt: string;
  updatedAt: string;
  claimedAt: string | null;
  claimedBy: { id: string; name: string | null } | null;
};

// Mapping direct statut DB → badge
const STATUS_CONFIG: Record<DbStatus, { label: string; color: string }> = {
  PENDING:  { label: "🟡 En attente",    color: "bg-yellow-500/10 text-yellow-200 border-yellow-500/30" },
  ACCEPTED: { label: "✅ Accepté",        color: "bg-green-500/10  text-green-200  border-green-500/30"  },
  REJECTED: { label: "❌ Refusé",         color: "bg-red-500/10    text-red-200    border-red-500/30"    },
  ARCHIVED: { label: "📦 Archivé",        color: "bg-gray-500/10   text-gray-200   border-gray-500/30"   },
};

const CLAIMED_CONFIG = { label: "🔵 Pris en charge", color: "bg-blue-500/10 text-blue-200 border-blue-500/30" };

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: "",         label: "Tous les statuts"  },
  { value: "PENDING",  label: "🟡 En attente"     },
  { value: "ACCEPTED", label: "✅ Accepté"         },
  { value: "REJECTED", label: "❌ Refusé"          },
  { value: "ARCHIVED", label: "📦 Archivé"         },
];

const GUILD_ID = "1312845998753710151";

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-BE", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function statusBadge(ticket: Ticket) {
  if (ticket.status === "PENDING" && ticket.isClaimed) return CLAIMED_CONFIG;
  return STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.PENDING;
}

export default function RecruitmentClient() {
  const [items, setItems] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      if (searchQuery.trim()) qs.set("q", searchQuery.trim());
      const res = await fetch(`/api/staff/recruitment?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Échec du chargement");
      setItems(data.data ?? []);
    } catch (err: any) {
      setItems([]);
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  async function handleDelete(ticketId: string) {
    setDeletingId(ticketId);
    setError(null);
    try {
      const res = await fetch(`/api/staff/recruitment/${ticketId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Suppression échouée");
      setConfirmDeleteId(null);
      setItems((prev) => prev.filter((t) => t.id !== ticketId));
    } catch (err: any) {
      const msg = String(err?.message ?? err);
      setError(msg);
      setTimeout(() => setError(null), 5000);
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    load();
    const id = setInterval(() => { load(); }, 30_000);
    return () => clearInterval(id);
  }, [statusFilter, searchQuery]);

  // Stats
  const totalCount    = items.length;
  const pendingCount  = items.filter((i) => i.status === "PENDING" && !i.isClaimed).length;
  const claimedCount  = items.filter((i) => i.status === "PENDING" &&  i.isClaimed).length;
  const acceptedCount = items.filter((i) => i.status === "ACCEPTED").length;
  const rejectedCount = items.filter((i) => i.status === "REJECTED").length;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4 bg-slate-900/40 border-slate-800">
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total</div>
          <div className="text-2xl font-bold text-foreground mt-2">{totalCount}</div>
        </Card>
        <Card className="p-4 bg-slate-900/40 border-slate-800">
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">En attente</div>
          <div className="text-2xl font-bold text-yellow-400 mt-2">{pendingCount}</div>
        </Card>
        <Card className="p-4 bg-slate-900/40 border-slate-800">
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Pris en charge</div>
          <div className="text-2xl font-bold text-blue-400 mt-2">{claimedCount}</div>
        </Card>
        <Card className="p-4 bg-slate-900/40 border-slate-800">
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Acceptés</div>
          <div className="text-2xl font-bold text-green-400 mt-2">{acceptedCount}</div>
        </Card>
        <Card className="p-4 bg-slate-900/40 border-slate-800">
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Refusés</div>
          <div className="text-2xl font-bold text-red-400 mt-2">{rejectedCount}</div>
        </Card>
      </div>

      {/* Filters */}
      <Card className="p-4 bg-slate-900/40 border-slate-800">
        <div className="flex flex-col md:flex-row gap-3 items-start md:items-center">
          <div className="flex-1">
            <Input
              placeholder="Rechercher par nom, Steam ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-slate-950 border-slate-800"
            />
          </div>
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-2 bg-slate-950 border border-slate-800 rounded-md text-sm text-foreground"
            >
              {FILTER_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </Card>

      {/* Error */}
      {error && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && items.length === 0 && (
        <Card className="p-12 bg-slate-900/20 border-slate-800 text-center">
          <Users className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
          <h3 className="text-lg font-semibold text-foreground mb-2">Aucun recrutement</h3>
          <p className="text-muted-foreground text-sm mb-4">
            {searchQuery || statusFilter
              ? "Aucun résultat ne correspond à vos filtres"
              : "Les recrutements viennent de Discord"}
          </p>
          {!searchQuery && !statusFilter && (
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Rafraîchir
            </Button>
          )}
        </Card>
      )}

      {/* Table */}
      {!loading && items.length > 0 && (
        <Card className="overflow-hidden bg-slate-900/40 border-slate-800">
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-slate-800/50">
            {items.map((ticket) => {
              const badge = statusBadge(ticket);
              const isConfirming = confirmDeleteId === ticket.id;
              const isDeleting = deletingId === ticket.id;
              return (
                <div key={ticket.id} className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <Link href={`/staff/recruitment/${ticket.id}`} className="font-medium text-primary hover:underline text-sm">
                      {ticket.candidateRpName}
                    </Link>
                    <Badge className={`${badge.color} border text-xs shrink-0`}>{badge.label}</Badge>
                  </div>
                  {ticket.candidateSteamId && (
                    <code className="text-xs bg-slate-800 px-2 py-1 rounded font-mono block w-fit">
                      {ticket.candidateSteamId}
                    </code>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {ticket.claimedBy && <span>Par : {ticket.claimedBy.name ?? ticket.claimedBy.id}</span>}
                    <span>{fmtDate(ticket.createdAt)}</span>
                  </div>
                  <div className="flex items-center gap-2 pt-1">
                    {!isConfirming ? (
                      <>
                        {ticket.discordThreadId && (
                          <a
                            href={`https://discord.com/channels/${GUILD_ID}/${ticket.discordThreadId}`}
                            target="_blank" rel="noopener noreferrer"
                            className="text-xs px-2 py-1 rounded border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-colors"
                          >
                            Discord
                          </a>
                        )}
                        <Link href={`/staff/recruitment/${ticket.id}`} className="text-xs px-2 py-1 rounded border border-white/10 bg-white/[0.04] text-foreground hover:bg-white/[0.08] transition-colors">
                          Ouvrir
                        </Link>
                        <button onClick={() => setConfirmDeleteId(ticket.id)} className="text-xs px-2 py-1 rounded border border-red-500/20 bg-red-500/[0.06] text-red-400 hover:bg-red-500/15 transition-colors">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-muted-foreground">Supprimer ?</span>
                        <button onClick={() => handleDelete(ticket.id)} disabled={isDeleting} className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50">
                          {isDeleting ? "…" : "Confirmer"}
                        </button>
                        <button onClick={() => setConfirmDeleteId(null)} disabled={isDeleting} className="text-xs px-2 py-1 rounded border border-white/10 bg-white/[0.04] text-foreground hover:bg-white/[0.08] transition-colors">
                          Annuler
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/60 border-b border-slate-800">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Candidat</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Steam ID</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Statut</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recruté par</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Créé</th>
                  <th className="text-right py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Actions</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ticket) => {
                  const badge = statusBadge(ticket);
                  const isConfirming = confirmDeleteId === ticket.id;
                  const isDeleting = deletingId === ticket.id;

                  return (
                    <tr
                      key={ticket.id}
                      className="border-b border-slate-800/50 hover:bg-slate-800/20 transition-colors"
                    >
                      <td className="py-3 px-4">
                        <Link
                          href={`/staff/recruitment/${ticket.id}`}
                          className="font-medium text-primary hover:underline"
                        >
                          {ticket.candidateRpName}
                        </Link>
                      </td>
                      <td className="py-3 px-4">
                        <code className="text-xs bg-slate-800 px-2 py-1 rounded font-mono">
                          {ticket.candidateSteamId ?? "-"}
                        </code>
                      </td>
                      <td className="py-3 px-4">
                        <Badge className={`${badge.color} border`}>
                          {badge.label}
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {ticket.claimedBy?.name ?? ticket.claimedBy?.id ?? "-"}
                      </td>
                      <td className="py-3 px-4 text-sm text-muted-foreground">
                        {fmtDate(ticket.createdAt)}
                      </td>
                      <td className="py-3 px-4">
                        <div className="flex items-center justify-end gap-2">
                          {!isConfirming ? (
                            <>
                              {ticket.discordThreadId && (
                                <a
                                  href={`https://discord.com/channels/${GUILD_ID}/${ticket.discordThreadId}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs px-2 py-1 rounded border border-indigo-500/30 bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/20 transition-colors"
                                >
                                  Discord
                                </a>
                              )}
                              <Link
                                href={`/staff/recruitment/${ticket.id}`}
                                className="text-xs px-2 py-1 rounded border border-white/10 bg-white/[0.04] text-foreground hover:bg-white/[0.08] transition-colors"
                              >
                                Ouvrir
                              </Link>
                              <button
                                onClick={() => setConfirmDeleteId(ticket.id)}
                                className="text-xs px-2 py-1 rounded border border-red-500/20 bg-red-500/[0.06] text-red-400 hover:bg-red-500/15 transition-colors"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </>
                          ) : (
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-muted-foreground">Supprimer ?</span>
                              <button
                                onClick={() => handleDelete(ticket.id)}
                                disabled={isDeleting}
                                className="text-xs px-2 py-1 rounded bg-red-600 hover:bg-red-700 text-white transition-colors disabled:opacity-50"
                              >
                                {isDeleting ? "…" : "Confirmer"}
                              </button>
                              <button
                                onClick={() => setConfirmDeleteId(null)}
                                disabled={isDeleting}
                                className="text-xs px-2 py-1 rounded border border-white/10 bg-white/[0.04] text-foreground hover:bg-white/[0.08] transition-colors"
                              >
                                Annuler
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
