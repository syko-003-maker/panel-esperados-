"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge-new";
import { RefreshCw, Search, Users } from "lucide-react";

type Ticket = {
  id: string;
  status: "OPEN" | "CLAIMED" | "CLOSED_ACCEPTED" | "CLOSED_REJECTED";
  candidateRpName: string;
  candidateSteamId: string | null;
  candidateDiscordId: string | null;
  createdAt: string;
  updatedAt: string;
  claimedAt: string | null;
  claimedBy: { id: string; name: string | null } | null;
};

const STATUSES: Ticket["status"][] = ["OPEN", "CLAIMED", "CLOSED_ACCEPTED", "CLOSED_REJECTED"];

const STATUS_CONFIG: Record<Ticket["status"], { label: string; color: string }> = {
  OPEN: { label: "🟡 En attente", color: "bg-yellow-500/10 text-yellow-200 border-yellow-500/30" },
  CLAIMED: { label: "🔵 Pris en charge", color: "bg-blue-500/10 text-blue-200 border-blue-500/30" },
  CLOSED_ACCEPTED: { label: "✅ Accepté", color: "bg-green-500/10 text-green-200 border-green-500/30" },
  CLOSED_REJECTED: { label: "❌ Refusé", color: "bg-red-500/10 text-red-200 border-red-500/30" },
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-BE", { 
    year: "numeric", 
    month: "2-digit", 
    day: "2-digit", 
    hour: "2-digit", 
    minute: "2-digit" 
  });
}

function fmtClaimedBy(ticket: Ticket) {
  if (!ticket.claimedBy && !ticket.claimedAt) return "-";
  const name = ticket.claimedBy?.name ?? ticket.claimedBy?.id ?? "Inconnu";
  return ticket.claimedAt ? `${name}` : name;
}

export default function RecruitmentClient() {
  const [items, setItems] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  useEffect(() => {
    load();
    const id = setInterval(() => {
      load();
    }, 5000); // Augmenter l'intervalle pour réduire les requêtes
    return () => clearInterval(id);
  }, [statusFilter, searchQuery]);

  // Stats
  const totalCount = items.length;
  const openCount = items.filter(i => i.status === "OPEN").length;
  const claimedCount = items.filter(i => i.status === "CLAIMED").length;
  const acceptedCount = items.filter(i => i.status === "CLOSED_ACCEPTED").length;
  const rejectedCount = items.filter(i => i.status === "CLOSED_REJECTED").length;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
        <Card className="p-4 bg-slate-900/40 border-slate-800">
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">Total</div>
          <div className="text-2xl font-bold text-foreground mt-2">{totalCount}</div>
        </Card>
        <Card className="p-4 bg-slate-900/40 border-slate-800">
          <div className="text-xs text-muted-foreground uppercase tracking-wide font-medium">En attente</div>
          <div className="text-2xl font-bold text-yellow-400 mt-2">{openCount}</div>
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
              <option value="">Tous les statuts</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {STATUS_CONFIG[s].label}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              size="sm"
              onClick={load}
              disabled={loading}
            >
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

      {/* Empty State */}
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
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-slate-900/60 border-b border-slate-800">
                <tr>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Candidat</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Steam ID</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Statut</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Recruté par</th>
                  <th className="text-left py-3 px-4 text-xs font-semibold text-muted-foreground uppercase tracking-wide">Créé</th>
                </tr>
              </thead>
              <tbody>
                {items.map((ticket) => (
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
                      <Badge className={`${STATUS_CONFIG[ticket.status].color} border`}>
                        {STATUS_CONFIG[ticket.status].label}
                      </Badge>
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {fmtClaimedBy(ticket)}
                    </td>
                    <td className="py-3 px-4 text-sm text-muted-foreground">
                      {fmtDate(ticket.createdAt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}
