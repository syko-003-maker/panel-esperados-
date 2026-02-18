"use client";

import { useEffect, useState } from "react";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

interface HealthSummary {
  ok: boolean;
  healthy: boolean;
  timestamp: string;
  issues: string[];
  metrics: {
    system: {
      responseTimeMs: number;
      databaseConnected: boolean;
    };
    members: {
      total: number;
    };
    sanctions: {
      activeCount: number;
    };
    tickets: {
      recruitmentsPending: number;
      complaintsPending: number;
      totalPending: number;
    };
    queue: {
      outboxPendingCount: number;
    };
    integration: {
      usersWithDiscordOAuth: number;
      discordAccountsLinked: number;
    };
  };
}

export function DiagnosticsHealthClient() {
  const [health, setHealth] = useState<HealthSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const fetchHealth = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/health/summary");
      const data = await res.json();
      if (data.ok) {
        setHealth(data);
        setLastUpdated(new Date());
      } else {
        setError(data.error ?? "Failed to fetch health");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Network error");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    // Refresh every 30 seconds
    const interval = setInterval(fetchHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  if (loading && !health) {
    return <div className="text-slate-400">⏳ Loading health metrics...</div>;
  }

  if (error && !health) {
    return <div className="text-red-400">❌ Error: {error}</div>;
  }

  if (!health) {
    return null;
  }

  const statusColor = health.healthy ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400";
  const statusIcon = health.healthy ? "✅" : "⚠️";

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className={`border rounded p-4 ${statusColor}`}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{statusIcon}</span>
            <span className="font-semibold">System {health.healthy ? "Healthy" : "Needs Attention"}</span>
          </div>
          <button
            onClick={fetchHealth}
            disabled={loading}
            className="bg-white/10 px-3 py-1 rounded text-xs hover:bg-white/20 transition disabled:opacity-50"
          >
            {loading ? "..." : "Refresh"}
          </button>
        </div>
        {lastUpdated && (
          <div className="text-xs opacity-75 mt-2">
            Last updated {formatDistanceToNow(lastUpdated, { locale: fr, addSuffix: true })}
          </div>
        )}
      </div>

      {/* Issues */}
      {health.issues.length > 0 && (
        <div className="border border-red-500/30 bg-red-500/10 rounded p-4">
          <h3 className="font-semibold text-red-400 mb-2">Issues</h3>
          <ul className="space-y-1">
            {health.issues.map((issue, idx) => (
              <li key={idx} className="text-sm text-red-300">
                • {issue}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* System */}
        <div className="border rounded p-4">
          <h3 className="font-semibold mb-3 text-xs uppercase tracking-wide opacity-75">System</h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="opacity-75">Database</dt>
              <dd className="font-mono">
                {health.metrics.system.databaseConnected ? "✅ Connected" : "❌ Disconnected"}
              </dd>
            </div>
            <div>
              <dt className="opacity-75">Response Time</dt>
              <dd className="font-mono">{health.metrics.system.responseTimeMs}ms</dd>
            </div>
          </dl>
        </div>

        {/* Members */}
        <div className="border rounded p-4">
          <h3 className="font-semibold mb-3 text-xs uppercase tracking-wide opacity-75">Members</h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="opacity-75">Active</dt>
              <dd className="font-mono text-lg font-bold">{health.metrics.members.total}</dd>
            </div>
          </dl>
        </div>

        {/* Sanctions */}
        <div className="border rounded p-4">
          <h3 className="font-semibold mb-3 text-xs uppercase tracking-wide opacity-75">Sanctions</h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="opacity-75">Active</dt>
              <dd className="font-mono text-lg font-bold">{health.metrics.sanctions.activeCount}</dd>
            </div>
          </dl>
        </div>

        {/* Tickets */}
        <div className="border rounded p-4">
          <h3 className="font-semibold mb-3 text-xs uppercase tracking-wide opacity-75">Tickets</h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="opacity-75">Recruitments</dt>
              <dd className="font-mono">
                {health.metrics.tickets.recruitmentsPending} pending
              </dd>
            </div>
            <div>
              <dt className="opacity-75">Complaints</dt>
              <dd className="font-mono">
                {health.metrics.tickets.complaintsPending} pending
              </dd>
            </div>
          </dl>
        </div>

        {/* Queue */}
        <div className="border rounded p-4">
          <h3 className="font-semibold mb-3 text-xs uppercase tracking-wide opacity-75">Discord Queue</h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="opacity-75">Pending Jobs</dt>
              <dd className={`font-mono text-lg font-bold ${health.metrics.queue.outboxPendingCount > 100 ? "text-red-400" : ""}`}>
                {health.metrics.queue.outboxPendingCount}
              </dd>
            </div>
          </dl>
        </div>

        {/* Integration */}
        <div className="border rounded p-4">
          <h3 className="font-semibold mb-3 text-xs uppercase tracking-wide opacity-75">Integration</h3>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="opacity-75">Discord OAuth Users</dt>
              <dd className="font-mono">{health.metrics.integration.usersWithDiscordOAuth}</dd>
            </div>
            <div>
              <dt className="opacity-75">Member Discord IDs</dt>
              <dd className="font-mono">{health.metrics.integration.discordAccountsLinked}</dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  );
}
