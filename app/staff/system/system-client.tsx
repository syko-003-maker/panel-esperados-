"use client";

import { useEffect, useState, useCallback } from "react";
import { LoadingState } from "@/components/staff/ui/LoadingState";
import { SectionCard } from "@/components/staff/ui/SectionCard";

type SystemStats = {
  hostname: string;
  uptimeSec: number;
  loadAvg: [number, number, number];
  cpu: { count: number; model: string; usagePercent: number };
  memory: { totalMB: number; usedMB: number; freeMB: number; usedPercent: number };
  disk: { totalGB: number; usedGB: number; freeGB: number; usedPercent: number } | null;
  services: Array<{ name: string; status: string; type: string }>;
  node: { version: string; pid: number; rssMB: number };
};

type ServiceStats = { total: number; ok: number; errors: number; rateLimited: number };
type LygStats = {
  windowMinutes: number;
  total: number;
  ok: number;
  errors: number;
  rateLimited: number;
  byEndpoint: Record<string, number>;
  services: { panel: ServiceStats; worker: ServiceStats; kitty: ServiceStats };
  lastRateLimit: { ts: number; pauseUntil: number; endpoint: string; service?: string } | null;
  pausedNow: boolean;
  pauseRemainingSec: number;
};

function fmtTs(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", timeZone: "Europe/Brussels" });
  } catch {
    return iso;
  }
}

function fmtUptime(sec: number): string {
  const d = Math.floor(sec / 86400);
  const h = Math.floor((sec % 86400) / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const parts = [];
  if (d > 0) parts.push(`${d}j`);
  if (h > 0) parts.push(`${h}h`);
  parts.push(`${m}min`);
  return parts.join(" ");
}

function Bar({ percent, color = "emerald" }: { percent: number; color?: "emerald" | "amber" | "rose" }) {
  const cls = color === "rose" ? "bg-rose-500" : color === "amber" ? "bg-amber-500" : "bg-emerald-500";
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-white/8">
      <div className={`h-full ${cls} transition-all`} style={{ width: `${Math.min(100, percent)}%` }} />
    </div>
  );
}

function colorForPercent(pct: number): "emerald" | "amber" | "rose" {
  if (pct >= 85) return "rose";
  if (pct >= 70) return "amber";
  return "emerald";
}

function StatusBadge({ status }: { status: string }) {
  const cls =
    status === "active"
      ? "border-emerald-500/40 bg-emerald-500/12 text-emerald-200"
      : status === "failed"
      ? "border-rose-500/40 bg-rose-500/12 text-rose-200"
      : status === "inactive"
      ? "border-slate-500/40 bg-slate-500/12 text-slate-300"
      : "border-amber-500/40 bg-amber-500/12 text-amber-200";
  const label =
    status === "active" ? "✓ Actif" : status === "failed" ? "✗ Failed" : status === "inactive" ? "Inactif" : "?";
  return (
    <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${cls}`}>{label}</span>
  );
}

export default function SystemClient() {
  const [data, setData] = useState<{ system: SystemStats; lyg: LygStats; timestamp: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch("/api/staff/system", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (json?.ok) setData({ system: json.system, lyg: json.lyg, timestamp: json.timestamp });
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load();
    // 30s côté client (5s avant) — la route serveur ajoute un cache 15s en plus,
    // donc 1 collectSystemStats() max toutes les 15s même avec plusieurs onglets.
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [load]);

  if (loading || !data) {
    return <LoadingState title="Chargement" description="Lecture des métriques système…" />;
  }

  const { system, lyg } = data;
  const lygPercent = Math.min(100, (lyg.total / 100) * 100);
  const lygColor = lyg.rateLimited > 0 ? "rose" : lyg.total >= 90 ? "rose" : lyg.total >= 70 ? "amber" : "emerald";

  return (
    <div className="space-y-5">
      {/* LYG API — La box prioritaire */}
      <SectionCard
        title="API LYG — Quota 15 min"
        description="100 requêtes max / 15 min, partagé entre panel, worker et Kitty Gang."
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Appels (15 min)" value={String(lyg.total)} suffix="/100" color={lygColor} />
            <Stat label="Réussis" value={String(lyg.ok)} color="emerald" />
            <Stat label="Erreurs" value={String(lyg.errors)} color={lyg.errors > 0 ? "amber" : "default"} />
            <Stat label="Rate limit (429)" value={String(lyg.rateLimited)} color={lyg.rateLimited > 0 ? "rose" : "default"} />
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-xs text-muted-foreground">
              <span>Consommation panel + worker</span>
              <span>{lyg.total}/100</span>
            </div>
            <Bar percent={lygPercent} color={lygColor} />
          </div>
          {lyg.pausedNow && (
            <div className="rounded-lg border border-rose-500/40 bg-rose-500/8 p-3 text-sm text-rose-200">
              ⚠️ Loop en pause suite à un 429. Reprise dans <strong>{lyg.pauseRemainingSec}s</strong> (endpoint : <code>{lyg.lastRateLimit?.endpoint}</code>)
            </div>
          )}
          {/* Breakdown par service */}
          <div>
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Par service</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <ServiceCard label="Panel" stats={lyg.services.panel} />
              <ServiceCard label="Discord Worker" stats={lyg.services.worker} />
              <ServiceCard label="Kitty Gang" stats={lyg.services.kitty} />
            </div>
          </div>

          {Object.keys(lyg.byEndpoint).length > 0 && (
            <div>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Par endpoint</p>
              <div className="space-y-1.5">
                {Object.entries(lyg.byEndpoint).map(([ep, count]) => (
                  <div key={ep} className="flex items-center justify-between rounded-lg border border-white/8 bg-white/[0.02] px-3 py-2 text-sm">
                    <code className="text-foreground/80">{ep}</code>
                    <span className="font-semibold text-foreground">{count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Services */}
      <SectionCard title="Services" description="Statut des trois services qui tournent sur le VPS.">
        <div className="space-y-2">
          {system.services.map((svc) => (
            <div key={svc.name} className="flex items-center justify-between rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{svc.name}</p>
                <p className="text-xs text-muted-foreground">{svc.type === "systemd" ? "systemd service" : "pm2 process"}</p>
              </div>
              <StatusBadge status={svc.status} />
            </div>
          ))}
        </div>
      </SectionCard>

      {/* VPS */}
      <SectionCard
        title="VPS"
        description={`Uptime ${fmtUptime(system.uptimeSec)} · Load ${system.loadAvg.map((x) => x.toFixed(2)).join(" / ")}`}
        actions={
          <button onClick={() => void load(true)} disabled={refreshing}
            className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-white/[0.10] disabled:opacity-50">
            {refreshing ? "..." : "↻ Actualiser"}
          </button>
        }
      >
        <div className="space-y-4">
          <ResourceBlock
            label={`CPU (${system.cpu.count} cœurs)`}
            sub={system.cpu.model}
            percent={system.cpu.usagePercent}
            valueText={`${system.cpu.usagePercent}%`}
          />
          <ResourceBlock
            label="RAM"
            sub={`${(system.memory.usedMB / 1024).toFixed(1)} / ${(system.memory.totalMB / 1024).toFixed(1)} Go`}
            percent={system.memory.usedPercent}
            valueText={`${system.memory.usedPercent}%`}
          />
          {system.disk && (
            <ResourceBlock
              label="Disque /"
              sub={`${system.disk.usedGB} / ${system.disk.totalGB} Go`}
              percent={system.disk.usedPercent}
              valueText={`${system.disk.usedPercent}%`}
            />
          )}
          <div className="rounded-lg border border-white/8 bg-white/[0.02] px-4 py-2.5 text-xs text-muted-foreground">
            Node {system.node.version} · PID {system.node.pid} · Process RSS : {system.node.rssMB} MB
          </div>
        </div>
      </SectionCard>

      <LogsViewer />

      <p className="text-center text-xs text-muted-foreground">
        Auto-refresh toutes les 5 secondes · Dernière maj : {new Date(data.timestamp).toLocaleTimeString("fr-FR")}
      </p>
    </div>
  );
}

type LogLine = { timestamp: string | null; level: "error" | "warn" | "info"; message: string };
type LogSource = "panel" | "worker" | "kitty";
type LogFilter = "all" | "errors" | "warns" | "lyg";

function LogsViewer() {
  const [source, setSource] = useState<LogSource>("panel");
  const [filter, setFilter] = useState<LogFilter>("all");
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [loading, setLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/staff/system/logs?source=${source}&filter=${filter}&limit=200`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (json?.ok) setLogs(json.logs ?? []);
    } finally {
      setLoading(false);
    }
  }, [source, filter]);

  useEffect(() => {
    void load();
    if (!autoRefresh) return;
    // 30s pour les logs en direct (10s avant) — moins agressif sur journalctl.
    const interval = setInterval(() => void load(), 30_000);
    return () => clearInterval(interval);
  }, [load, autoRefresh]);

  return (
    <SectionCard
      title="Logs en direct"
      description="Lecture continue des logs des trois services."
      actions={
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} className="accent-emerald-500" />
            Auto
          </label>
          <button onClick={() => void load()} disabled={loading}
            className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-white/[0.10] disabled:opacity-50">
            {loading ? "..." : "↻"}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        {/* Sélecteur source */}
        <div className="flex flex-wrap gap-2">
          {([
            { id: "panel", label: "Panel" },
            { id: "worker", label: "Discord Worker" },
            { id: "kitty", label: "Kitty Gang" },
          ] as const).map((s) => (
            <button key={s.id} onClick={() => setSource(s.id)}
              className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                source === s.id
                  ? "border-emerald-500/40 bg-emerald-500/12 text-emerald-200"
                  : "border-white/10 bg-white/[0.04] text-foreground/70 hover:bg-white/[0.08]"
              }`}>
              {s.label}
            </button>
          ))}
        </div>

        {/* Sélecteur filtre */}
        <div className="flex flex-wrap gap-2">
          {([
            { id: "all", label: "Tous" },
            { id: "errors", label: "Erreurs" },
            { id: "warns", label: "Warnings + Erreurs" },
            { id: "lyg", label: "LYG / Rate-limit" },
          ] as const).map((f) => (
            <button key={f.id} onClick={() => setFilter(f.id)}
              className={`rounded-lg border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                filter === f.id
                  ? "border-amber-500/40 bg-amber-500/12 text-amber-200"
                  : "border-white/8 bg-white/[0.02] text-muted-foreground hover:bg-white/[0.06]"
              }`}>
              {f.label}
            </button>
          ))}
        </div>

        {/* Logs */}
        <div className="max-h-[500px] overflow-y-auto rounded-lg border border-white/8 bg-black/40 p-3 font-mono text-xs">
          {logs.length === 0 ? (
            <p className="text-center text-muted-foreground py-8">Aucun log à afficher.</p>
          ) : (
            <div className="space-y-0.5">
              {logs.map((l, i) => (
                <div key={i} className={`flex gap-2 px-1 py-0.5 rounded ${
                  l.level === "error" ? "bg-rose-500/10 text-rose-200" :
                  l.level === "warn" ? "bg-amber-500/10 text-amber-200" :
                  "text-foreground/70"
                }`}>
                  {l.timestamp && <span className="shrink-0 text-muted-foreground">{fmtTs(l.timestamp)}</span>}
                  <span className="break-all whitespace-pre-wrap">{l.message}</span>
                </div>
              ))}
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          {logs.length} ligne{logs.length > 1 ? "s" : ""} · Auto-refresh toutes les 10s
        </p>
      </div>
    </SectionCard>
  );
}

function ServiceCard({ label, stats }: { label: string; stats: ServiceStats }) {
  const color = stats.rateLimited > 0 ? "rose" : stats.errors > 0 ? "amber" : "default";
  const cls =
    color === "rose" ? "border-rose-500/40 bg-rose-500/[0.04]" :
    color === "amber" ? "border-amber-500/40 bg-amber-500/[0.04]" :
    "border-white/8 bg-white/[0.02]";
  return (
    <div className={`rounded-xl border ${cls} px-3 py-2.5`}>
      <p className="text-xs font-semibold text-foreground">{label}</p>
      <div className="mt-1.5 flex items-baseline gap-2">
        <span className="text-xl font-bold text-foreground">{stats.total}</span>
        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">appels</span>
      </div>
      <div className="mt-1 flex flex-wrap gap-1.5 text-[10px]">
        <span className="text-emerald-300/80">✓ {stats.ok}</span>
        {stats.errors > 0 && <span className="text-amber-300/80">⚠ {stats.errors}</span>}
        {stats.rateLimited > 0 && <span className="text-rose-300">429 × {stats.rateLimited}</span>}
      </div>
    </div>
  );
}

function Stat({ label, value, suffix, color = "default" }: { label: string; value: string; suffix?: string; color?: "default" | "emerald" | "amber" | "rose" }) {
  const cls =
    color === "emerald" ? "text-emerald-300" :
    color === "amber" ? "text-amber-300" :
    color === "rose" ? "text-rose-300" :
    "text-foreground";
  return (
    <div className="rounded-2xl border border-white/8 bg-[rgba(14,5,7,0.62)] px-4 py-3 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)]">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${cls}`}>
        {value}
        {suffix && <span className="ml-1 text-sm text-muted-foreground">{suffix}</span>}
      </p>
    </div>
  );
}

function ResourceBlock({ label, sub, percent, valueText }: { label: string; sub: string; percent: number; valueText: string }) {
  const color = colorForPercent(percent);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-foreground">{label}</p>
          <p className="text-xs text-muted-foreground">{sub}</p>
        </div>
        <span className={`text-lg font-bold ${color === "rose" ? "text-rose-300" : color === "amber" ? "text-amber-300" : "text-emerald-300"}`}>
          {valueText}
        </span>
      </div>
      <Bar percent={percent} color={color} />
    </div>
  );
}
