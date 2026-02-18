"use client";

import { useState, useEffect } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge-new";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Filter, Clock, Zap } from "lucide-react";
import { PageHeader, StatCard, Section } from "@/components/staff/ui-components";

type ActivityLog = {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  entityName: string | null;
  actorType: string;
  actorName: string | null;
  actorDiscordId?: string;
  details?: string;
  createdAt: string;
};

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getActionBadge(action: string) {
  const badges: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; icon: string }> = {
    CREATE: { variant: "secondary", icon: "✨" },
    UPDATE: { variant: "outline", icon: "📝" },
    DELETE: { variant: "destructive", icon: "🗑️" },
    VIEW: { variant: "outline", icon: "👁️" },
    EXPORT: { variant: "secondary", icon: "📤" },
    IMPORT: { variant: "secondary", icon: "📥" },
    APPROVE: { variant: "secondary", icon: "✓" },
    REJECT: { variant: "destructive", icon: "✕" },
    ARCHIVE: { variant: "outline", icon: "📦" },
  };
  return badges[action] || { variant: "outline", icon: "📋" };
}

function getActorColor(actorType: string) {
  switch (actorType) {
    case "USER":
      return "bg-blue-500/20 border-blue-500/30";
    case "SYSTEM":
      return "bg-slate-900/20 border-slate-800";
    case "BOT":
      return "bg-purple-500/20 border-purple-500/30";
    default:
      return "bg-slate-900/20 border-slate-800";
  }
}

export default function StaffLogsClient() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(true);
  const [actionFilter, setActionFilter] = useState<string>("");
  const [entityFilter, setEntityFilter] = useState<string>("");

  useEffect(() => {
    async function fetchLogs() {
      setLoading(true);
      try {
        const qs = new URLSearchParams();
        qs.set("page", String(page));
        qs.set("pageSize", "50");
        if (actionFilter) qs.set("action", actionFilter);
        if (entityFilter) qs.set("entity", entityFilter);
        
        const res = await fetch(`/api/staff/logs?${qs.toString()}`);
        if (!res.ok) throw new Error("Failed to fetch");
        const data = await res.json();
        if (data.ok) {
          setLogs(data.data.logs);
          setHasMore(data.data.hasMore);
        } else {
          setError(data.error || "Unknown error");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchLogs();
  }, [page, actionFilter, entityFilter]);

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
      <PageHeader
        title="Logs & Activité"
        description="Historique complet des actions effectuées sur le panel"
      />

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
              {["", "CREATE", "UPDATE", "DELETE", "VIEW", "EXPORT", "APPROVE"].map((f) => (
                <button
                  key={f}
                  onClick={() => setActionFilter(f)}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    actionFilter === f
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {!f ? "Toutes" : f}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm font-medium text-gray-700 mb-2">Type d'entité</p>
            <div className="flex flex-wrap gap-2">
              {["", "Member", "Sanction", "Recruitment", "BankLog", "Complaint"].map((f) => (
                <button
                  key={f}
                  onClick={() => setEntityFilter(f)}
                  className={`px-3 py-1 rounded-lg text-sm transition-colors ${
                    entityFilter === f
                      ? "bg-blue-500 text-white"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {!f ? "Toutes" : f}
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Activity Timeline */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Historique d'activité
          </CardTitle>
          <CardDescription>Dernières actions du panel</CardDescription>
        </CardHeader>
        <CardContent>
          {logs.length === 0 ? (
            <div className="py-8 text-center">
              <p className="text-muted-foreground">📭 Aucune activité</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => {
                const actionBadge = getActionBadge(log.action);
                const actorColor = getActorColor(log.actorType);
                return (
                  <div
                    key={log.id}
                    className={`border rounded-lg p-4 ${actorColor} transition-colors hover:shadow-md`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap">
                          <Badge variant={actionBadge.variant}>
                            {actionBadge.icon} {log.action}
                          </Badge>
                          <span className="font-medium text-sm text-gray-700">{log.entity}</span>
                          {log.entityName && (
                            <span className="text-sm text-gray-600 truncate">
                              "{log.entityName}"
                            </span>
                          )}
                        </div>
                        {log.details && (
                          <p className="text-sm text-gray-600 mt-2">{log.details}</p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xs font-mono text-gray-500">
                          {formatDate(log.createdAt)}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 mt-3 pt-3 border-t border-opacity-20">
                      <span className="text-xs text-gray-500">
                        {log.actorType === "USER" ? "👤" : log.actorType === "BOT" ? "🤖" : "⚙️"}
                        {log.actorName ? ` ${log.actorName}` : ` ${log.actorType}`}
                      </span>
                      {log.actorDiscordId && (
                        <span className="text-xs font-mono text-gray-400">
                          ({log.actorDiscordId})
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      <div className="flex justify-between items-center">
        <button
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page === 1}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 transition-colors"
        >
          ← Précédent
        </button>
        <span className="text-sm text-gray-600 font-medium">Page {page}</span>
        <button
          onClick={() => setPage((p) => p + 1)}
          disabled={!hasMore}
          className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 transition-colors"
        >
          Suivant →
        </button>
      </div>
    </div>
  );
}
