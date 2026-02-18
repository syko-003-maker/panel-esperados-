"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { StaffPage } from "../ui/StaffPage";
import { StatCards } from "../ui/StatCards";
import { StaffTable } from "../ui/StaffTable";
import { Badge } from "../ui/Badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Search, Download, ArrowRight } from "lucide-react";
import { PageHeader, Section } from "@/components/staff/ui-components";

type Ticket = {
  id: string;
  channelId: string;
  status: "OPEN" | "TREATED" | "UNTREATED" | "CLOSED";
  createdAtDiscord: string;
  closedAtDiscord: string | null;
  lastMessageAtDiscord: string | null;
  messagesCount: number;
};

const STATUSES: Ticket["status"][] = ["OPEN", "TREATED", "UNTREATED", "CLOSED"];

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function statusBadge(status: Ticket["status"]) {
  const styles = {
    OPEN: { background: "#fef3c7", color: "#b45309", label: "🔴 Ouvert" },
    TREATED: { background: "#d1fae5", color: "#065f46", label: "✅ Traité" },
    UNTREATED: { background: "#fee2e2", color: "#991b1b", label: "❌ Refusé" },
    CLOSED: { background: "#e5e7eb", color: "#374151", label: "⊘ Clôturé" },
  };
  return styles[status];
}

export default function ComplaintsClient() {
  const [items, setItems] = useState<Ticket[]>([]);
  const [statusFilter, setStatusFilter] = useState<"" | "OPEN" | "TREATED" | "UNTREATED" | "CLOSED">("");
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (statusFilter) qs.set("status", statusFilter);
      if (q.trim()) qs.set("q", q.trim());
      const res = await fetch(`/api/staff/complaints?${qs.toString()}`, { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Failed to load");
      
      // Sort: OPEN first, then by lastMessageAtDiscord or createdAtDiscord
      const sorted = (data.data ?? []).sort((a: Ticket, b: Ticket) => {
        if (a.status === "OPEN" && b.status !== "OPEN") return -1;
        if (a.status !== "OPEN" && b.status === "OPEN") return 1;
        const aTime = (a.lastMessageAtDiscord || a.createdAtDiscord) ? new Date(a.lastMessageAtDiscord || a.createdAtDiscord).getTime() : 0;
        const bTime = (b.lastMessageAtDiscord || b.createdAtDiscord) ? new Date(b.lastMessageAtDiscord || b.createdAtDiscord).getTime() : 0;
        return bTime - aTime;
      });
      setItems(sorted);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setItems([]);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [statusFilter]);

  function exportToCSV() {
    if (items.length === 0) return;

    const headers = ["ID", "Canal", "Statut", "Créé", "Clôturé", "Dernier message", "Messages"];
    const rows = items.map((it) => [
      it.id,
      it.channelId,
      it.status,
      fmtDate(it.createdAtDiscord),
      fmtDate(it.closedAtDiscord),
      fmtDate(it.lastMessageAtDiscord),
      it.messagesCount.toString(),
    ]);

    const csvContent = [headers, ...rows]
      .map((row) => row.map((cell) => `"${cell}"`).join(","))
      .join("\n");

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", `plaintes_${new Date().toISOString().split("T")[0]}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  const stats = {
    total: items.length,
    open: items.filter((i) => i.status === "OPEN").length,
    treated: items.filter((i) => i.status === "TREATED").length,
    untreated: items.filter((i) => i.status === "UNTREATED").length,
    closed: items.filter((i) => i.status === "CLOSED").length,
  };

  return (
    <div className="space-y-8">
      {/* Page Header */}
      <PageHeader 
        title="Plaintes"
        description="Gestion des plaintes Discord et tickets"
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">Total</p>
          <p className="text-2xl font-bold mt-1">{loading ? <Skeleton className="h-8 w-12" /> : stats.total}</p>
        </div>
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">🔴 Ouvertes</p>
          <p className="text-2xl font-bold text-amber-600 mt-1">{loading ? <Skeleton className="h-8 w-12" /> : stats.open}</p>
        </div>
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">✅ Traitées</p>
          <p className="text-2xl font-bold text-green-600 mt-1">{loading ? <Skeleton className="h-8 w-12" /> : stats.treated}</p>
        </div>
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">❌ Refusées</p>
          <p className="text-2xl font-bold text-red-600 mt-1">{loading ? <Skeleton className="h-8 w-12" /> : stats.untreated}</p>
        </div>
        <div className="rounded-lg border border-border bg-card/50 p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">⊘ Clôturées</p>
          <p className="text-2xl font-bold text-slate-500 mt-1">{loading ? <Skeleton className="h-8 w-12" /> : stats.closed}</p>
        </div>
      </div>

      {/* Filters & Search */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Rechercher un canal..."
            className="pl-10 bg-card border-border"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as any)}
          className="text-sm bg-card border border-border rounded-md px-3 py-2 text-foreground"
        >
          <option value="">Tous les statuts</option>
          <option value="OPEN">🔴 Ouverts</option>
          <option value="TREATED">✅ Traités</option>
          <option value="UNTREATED">❌ Refusés</option>
          <option value="CLOSED">⊘ Clôturés</option>
        </select>
        <Button onClick={load} variant="default" size="sm">
          Chercher
        </Button>
        <Button
          onClick={exportToCSV}
          disabled={items.length === 0}
          variant="outline"
          size="sm"
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          <span className="hidden sm:inline">CSV</span>
        </Button>
      </div>

      {/* Error State */}
      {error && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">❌ Erreur: {error}</p>
        </div>
      )}

      {/* Loading State */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
      )}

      {/* Table Section */}
      {!loading && (
        <Section title="Liste des plaintes">
          <div className="rounded-lg border border-border overflow-hidden bg-card/30">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border bg-card/50">
                    <th className="px-4 py-3 text-left font-semibold">Canal</th>
                    <th className="px-4 py-3 text-left font-semibold">Statut</th>
                    <th className="px-4 py-3 text-left font-semibold">Créé</th>
                    <th className="px-4 py-3 text-left font-semibold">Clôturé</th>
                    <th className="px-4 py-3 text-left font-semibold">Dernier msg</th>
                    <th className="px-4 py-3 text-center font-semibold">Msgs</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="px-4 py-12 text-center text-muted-foreground">
                        Aucune plainte trouvée
                      </td>
                    </tr>
                  ) : (
                    items.map((it) => {
                      const badge = statusBadge(it.status);
                      const badgeClasses = {
                        OPEN: "bg-amber-500/10 text-amber-700 border-amber-200",
                        TREATED: "bg-green-500/10 text-green-700 border-green-200",
                        UNTREATED: "bg-red-500/10 text-red-700 border-red-200",
                        CLOSED: "bg-slate-500/10 text-slate-700 border-slate-200",
                      };
                      return (
                        <tr key={it.id} className="hover:bg-muted/30 transition-colors">
                          <td className="px-4 py-4 font-medium">
                            <Link
                              href={`/staff/complaints/${it.id}`}
                              className="text-primary hover:underline"
                            >
                              #{it.channelId.slice(-6)}
                            </Link>
                          </td>
                          <td className="px-4 py-4">
                            <span
                              className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold border ${badgeClasses[it.status]}`}
                            >
                              {badge.label}
                            </span>
                          </td>
                          <td className="px-4 py-4 text-xs text-muted-foreground whitespace-nowrap">
                            {fmtDate(it.createdAtDiscord)}
                          </td>
                          <td className={`px-4 py-4 text-xs whitespace-nowrap ${it.closedAtDiscord ? "text-foreground" : "text-muted-foreground"}`}>
                            {fmtDate(it.closedAtDiscord) || "—"}
                          </td>
                          <td className="px-4 py-4 text-xs text-muted-foreground whitespace-nowrap">
                            {fmtDate(it.lastMessageAtDiscord)}
                          </td>
                          <td className="px-4 py-4 text-center font-semibold text-foreground">
                            {it.messagesCount}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </Section>
      )}
    </div>
  );
}
