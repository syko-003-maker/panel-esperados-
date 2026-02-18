"use client";

import { useState, useEffect, useCallback } from "react";
import { format, subDays } from "date-fns";
import { fr } from "date-fns/locale";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type MetricCount = {
  type: string;
  count: number;
  date: string;
};

type MetricEvent = {
  id: string;
  familyId: string;
  source: string;
  type: string;
  ref: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

type AlertEvent = {
  id: string;
  type: string;
  severity: string;
  message: string;
  resolvedAt: string | null;
  createdAt: string;
};

type WorkerStatus = {
  online: boolean;
  lastSeenAt: string | null;
  name: string | null;
};

type MetricsData = {
  counts: MetricCount[];
  recentMetrics: MetricEvent[];
  alerts: AlertEvent[];
  worker: WorkerStatus;
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function MetricsClient() {
  const [data, setData] = useState<MetricsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState(7);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/staff/metrics?days=${days}`);
      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error ?? "Failed to fetch metrics");
      }

      setData(json.data);
    } catch (err: any) {
      setError(err.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }, [days]);

  useEffect(() => {
    fetchData();
    // Refresh every 30 seconds
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="space-y-8">
      {/* Worker Status & Alerts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <WorkerStatusCard worker={data.worker} />
        <ActiveAlertsCard alerts={data.alerts} />
      </div>

      {/* Charts */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-foreground">Activité (derniers {days} jours)</h2>
          <select
            value={days}
            onChange={(e) => setDays(parseInt(e.target.value, 10))}
            className="border border-slate-800 rounded px-3 py-1 text-sm bg-slate-900/40 text-foreground"
          >
            <option value={7}>7 jours</option>
            <option value={14}>14 jours</option>
            <option value={30}>30 jours</option>
          </select>
        </div>
        <MetricsChart counts={data.counts} days={days} />
      </div>

      {/* Recent Events Table */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4 text-foreground">Événements récents</h2>
        <RecentEventsTable events={data.recentMetrics} />
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────
// Sub Components
// ─────────────────────────────────────────────────────────────

function WorkerStatusCard({ worker }: { worker: WorkerStatus }) {
  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4 text-foreground">Status Worker</h2>
      <div className="flex items-center gap-3">
        <div
          className={`w-4 h-4 rounded-full ${
            worker.online ? "bg-green-500" : "bg-red-500"
          }`}
        ></div>
        <span className="font-medium text-foreground">
          {worker.online ? "En ligne" : "Hors ligne"}
        </span>
      </div>
      {worker.name && (
        <p className="text-sm text-muted-foreground mt-2">Worker: {worker.name}</p>
      )}
      {worker.lastSeenAt && (
        <p className="text-sm text-muted-foreground">
          Dernier signal:{" "}
          {format(new Date(worker.lastSeenAt), "dd/MM HH:mm:ss", { locale: fr })}
        </p>
      )}
    </div>
  );
}

function ActiveAlertsCard({ alerts }: { alerts: AlertEvent[] }) {
  const activeAlerts = alerts.filter((a) => !a.resolvedAt);

  return (
    <div className="bg-slate-900/40 border border-slate-800 rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold mb-4 text-foreground">
        Alertes actives{" "}
        {activeAlerts.length > 0 && (
          <span className="text-red-400">({activeAlerts.length})</span>
        )}
      </h2>
      {activeAlerts.length === 0 ? (
        <p className="text-green-400">✓ Aucune alerte active</p>
      ) : (
        <ul className="space-y-2">
          {activeAlerts.map((alert) => (
            <li
              key={alert.id}
              className={`p-3 rounded text-sm ${
                alert.severity === "critical"
                  ? "bg-red-500/10 border border-red-500/20 text-red-400"
                  : "bg-yellow-500/10 border border-yellow-500/20 text-yellow-400"
              }`}
            >
              <span className="font-medium">{alert.type}</span>
              <p>{alert.message}</p>
              <p className="text-xs mt-1 opacity-70">
                {format(new Date(alert.createdAt), "dd/MM HH:mm", { locale: fr })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MetricsChart({ counts, days }: { counts: MetricCount[]; days: number }) {
  // Generate date labels
  const dateLabels: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    dateLabels.push(format(subDays(new Date(), i), "yyyy-MM-dd"));
  }

  // Aggregate by type
  const typeMap: Record<string, Record<string, number>> = {};
  for (const c of counts) {
    if (!typeMap[c.type]) typeMap[c.type] = {};
    typeMap[c.type][c.date] = c.count;
  }

  // Metric types to display
  const metricTypes = [
    { key: "ticket.create", label: "Tickets créés", color: "bg-blue-500" },
    { key: "ticket.close", label: "Tickets fermés", color: "bg-green-500" },
    { key: "ingest.ok", label: "Ingest OK", color: "bg-emerald-500" },
    { key: "ingest.ko", label: "Ingest KO", color: "bg-red-500" },
    { key: "sanction.create", label: "Sanctions", color: "bg-orange-500" },
  ];

  // Calculate max value for scaling
  let maxValue = 0;
  for (const type of metricTypes) {
    for (const date of dateLabels) {
      const val = typeMap[type.key]?.[date] ?? 0;
      if (val > maxValue) maxValue = val;
    }
  }
  maxValue = Math.max(maxValue, 1);

  return (
    <div className="space-y-6">
      {/* Legend */}
      <div className="flex flex-wrap gap-4">
        {metricTypes.map((type) => (
          <div key={type.key} className="flex items-center gap-2 text-sm">
            <div className={`w-3 h-3 rounded ${type.color}`}></div>
            <span>{type.label}</span>
          </div>
        ))}
      </div>

      {/* Simple bar chart */}
      <div className="overflow-x-auto">
        <div className="min-w-[600px]">
          <div className="flex gap-1">
            {dateLabels.map((date) => (
              <div key={date} className="flex-1 min-w-[40px]">
                <div className="h-40 flex flex-col justify-end gap-0.5">
                  {metricTypes.map((type) => {
                    const value = typeMap[type.key]?.[date] ?? 0;
                    const height = (value / maxValue) * 100;
                    return (
                      <div
                        key={type.key}
                        className={`${type.color} opacity-80 hover:opacity-100 transition-opacity rounded-t`}
                        style={{ height: `${height}%`, minHeight: value > 0 ? "4px" : "0" }}
                        title={`${type.label}: ${value}`}
                      ></div>
                    );
                  })}
                </div>
                <p className="text-xs text-center text-gray-500 mt-1">
                  {format(new Date(date), "dd/MM")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 pt-4 border-t">
        {metricTypes.map((type) => {
          const total = dateLabels.reduce(
            (sum, date) => sum + (typeMap[type.key]?.[date] ?? 0),
            0
          );
          return (
            <div key={type.key} className="text-center">
              <p className="text-2xl font-bold">{total}</p>
              <p className="text-sm text-gray-500">{type.label}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function RecentEventsTable({ events }: { events: MetricEvent[] }) {
  const [filter, setFilter] = useState("");

  const filtered = filter
    ? events.filter(
        (e) =>
          e.type.toLowerCase().includes(filter.toLowerCase()) ||
          e.source.toLowerCase().includes(filter.toLowerCase()) ||
          e.ref?.toLowerCase().includes(filter.toLowerCase())
      )
    : events;

  return (
    <div>
      <input
        type="text"
        placeholder="Filtrer..."
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        className="w-full max-w-xs px-3 py-2 border rounded mb-4 text-sm"
      />

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-900/20">
            <tr>
              <th className="px-4 py-2 text-left">Date</th>
              <th className="px-4 py-2 text-left">Source</th>
              <th className="px-4 py-2 text-left">Type</th>
              <th className="px-4 py-2 text-left">Ref</th>
              <th className="px-4 py-2 text-left">Meta</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.slice(0, 50).map((event) => (
              <tr key={event.id} className="hover:bg-slate-900/30">
                <td className="px-4 py-2 whitespace-nowrap">
                  {format(new Date(event.createdAt), "dd/MM HH:mm:ss", {
                    locale: fr,
                  })}
                </td>
                <td className="px-4 py-2">
                  <span
                    className={`px-2 py-0.5 rounded text-xs ${
                      event.source === "panel"
                        ? "bg-blue-100 text-blue-800"
                        : "bg-purple-100 text-purple-800"
                    }`}
                  >
                    {event.source}
                  </span>
                </td>
                <td className="px-4 py-2 font-mono text-xs">{event.type}</td>
                <td className="px-4 py-2 font-mono text-xs text-gray-500">
                  {event.ref ?? "-"}
                </td>
                <td className="px-4 py-2 max-w-xs truncate text-xs text-gray-500">
                  {event.meta ? JSON.stringify(event.meta).slice(0, 60) : "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {filtered.length === 0 && (
        <p className="text-center py-8 text-gray-500">Aucun événement trouvé</p>
      )}
    </div>
  );
}
