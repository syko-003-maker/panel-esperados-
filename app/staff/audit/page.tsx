"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge-new";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Filter, Clock } from "lucide-react";

type AuditLog = {
  id: string;
  action: "SANCTION_CREATED" | "SANCTION_CLEARED" | "MEMBER_LINKED" | "MEMBER_UNLINKED" | "DISCORD_ROLE_ADDED" | "DISCORD_ROLE_REMOVED" | "MEMBER_DELETED" | "DATA_EXPORTED";
  subject: string;
  actor: string;
  actorDiscordId: string;
  targetMemberId?: string;
  targetMemberName?: string;
  details?: Record<string, any>;
  createdAt: string;
  source: "PANEL" | "DISCORD" | "SYSTEM";
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function getActionLabel(action: string) {
  const labels: Record<string, { icon: string; color: "blue" | "red" | "yellow" | "green" | "purple" }> = {
    SANCTION_CREATED: { icon: "⚠️", color: "red" },
    SANCTION_CLEARED: { icon: "✓", color: "green" },
    MEMBER_LINKED: { icon: "🔗", color: "blue" },
    MEMBER_UNLINKED: { icon: "🔓", color: "yellow" },
    DISCORD_ROLE_ADDED: { icon: "👤", color: "green" },
    DISCORD_ROLE_REMOVED: { icon: "👤", color: "red" },
    MEMBER_DELETED: { icon: "🗑️", color: "red" },
    DATA_EXPORTED: { icon: "📊", color: "purple" },
  };
  return labels[action] || { icon: "📝", color: "blue" };
}

function getSourceVariant(source: string): "default" | "secondary" | "outline" {
  switch (source) {
    case "PANEL":
      return "secondary";
    case "DISCORD":
      return "outline";
    case "SYSTEM":
      return "default";
    default:
      return "outline";
  }
}

export default function StaffAuditPage() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [sourceFilter, setSourceFilter] = useState<string>("");

  useEffect(() => {
    async function fetchLogs() {
      try {
        const qs = new URLSearchParams();
        if (actionFilter) qs.set("action", actionFilter);
        if (sourceFilter) qs.set("source", sourceFilter);
        const res = await fetch(`/api/staff/audit?${qs.toString()}`, { cache: "no-store" });
        if (!res.ok) throw new Error(`API error: ${res.status}`);
        const data = await res.json();
        setLogs(Array.isArray(data) ? data : data.logs || []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Erreur de chargement");
      } finally {
        setLoading(false);
      }
    }

    fetchLogs();
  }, [actionFilter, sourceFilter]);

  const filtered = logs.filter((log) => {
    if (actionFilter && log.action !== actionFilter) return false;
    if (sourceFilter && log.source !== sourceFilter) return false;
    return true;
  });

  const stats = {
    total: logs.length,
    sanctions: logs.filter((l) => l.action.includes("SANCTION")).length,
    links: logs.filter((l) => l.action.includes("LINKED")).length,
    roles: logs.filter((l) => l.action.includes("ROLE")).length,
  };

  if (loading) {
    return (
      <div className="space-y-8">
        <Skeleton className="h-10 w-96" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="h-32" />
          ))}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive/50 bg-destructive/5">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            Erreur
          </CardTitle>
        </CardHeader>
        <CardContent>{error}</CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Audit & Traçabilité</h1>
        <p className="text-muted-foreground mt-2">
          Historique complet de toutes les actions du panel et du Discord
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Total</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold">📋 {stats.total}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Sanctions</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-red-600">⚠️ {stats.sanctions}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Liaisons</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-green-600">🔗 {stats.links}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">Rôles Discord</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-purple-600">👤 {stats.roles}</p>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Filter className="h-5 w-5" />
            Filtres
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Type d'action</p>
            <div className="flex flex-wrap gap-2">
              {["", "SANCTION_CREATED", "SANCTION_CLEARED", "MEMBER_LINKED", "MEMBER_UNLINKED", "DISCORD_ROLE_ADDED", "DISCORD_ROLE_REMOVED", "MEMBER_DELETED"].map((f) => (
                <button
                  key={f}
                  onClick={() => setActionFilter(f)}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    actionFilter === f
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {!f ? "Tous" : f === "SANCTION_CREATED" ? "Sanction créée" : f === "SANCTION_CLEARED" ? "Sanction levée" : f === "MEMBER_LINKED" ? "Membre lié" : f === "MEMBER_UNLINKED" ? "Membre délié" : f === "DISCORD_ROLE_ADDED" ? "Rôle ajouté" : f === "DISCORD_ROLE_REMOVED" ? "Rôle retiré" : f === "MEMBER_DELETED" ? "Membre supprimé" : "Export de données"}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Source</p>
            <div className="flex flex-wrap gap-2">
              {["", "PANEL", "DISCORD", "SYSTEM"].map((f) => (
                <button
                  key={f}
                  onClick={() => setSourceFilter(f)}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    sourceFilter === f
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {!f ? "Toutes" : f === "PANEL" ? "Panel" : f === "DISCORD" ? "Discord" : "Système"}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Audit Log Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Historique complet
          </CardTitle>
          <CardDescription>{filtered.length} log(s)</CardDescription>
        </CardHeader>
        <CardContent>
          {filtered.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">📭 Aucun log audit</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-800 text-left">
                    <th className="pb-3 font-semibold text-muted-foreground">Action</th>
                    <th className="pb-3 font-semibold text-muted-foreground">Acteur</th>
                    <th className="pb-3 font-semibold text-muted-foreground">Sujet</th>
                    <th className="pb-3 font-semibold text-muted-foreground">Source</th>
                    <th className="pb-3 font-semibold text-muted-foreground">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {filtered.map((log) => {
                    const actionLabel = getActionLabel(log.action);
                    const sourceVariant = getSourceVariant(log.source);
                    return (
                      <tr key={log.id} className="hover:bg-gray-50">
                        <td className="py-3">
                          <Badge variant="outline">
                            {actionLabel.icon} {log.action.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="py-3">
                          <span className="font-medium text-sm">{log.actor}</span>
                          <p className="text-xs text-gray-500 font-mono">{log.actorDiscordId}</p>
                        </td>
                        <td className="py-3 max-w-xs">
                          <p className="font-medium">{log.subject}</p>
                          {log.targetMemberName && (
                            <p className="text-xs text-gray-500">{log.targetMemberName}</p>
                          )}
                        </td>
                        <td className="py-3">
                          <Badge variant={sourceVariant}>{log.source}</Badge>
                        </td>
                        <td className="py-3 text-xs text-gray-500 whitespace-nowrap">
                          {formatDate(log.createdAt)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
