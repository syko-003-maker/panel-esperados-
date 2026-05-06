"use client";

import { useEffect, useState, useCallback } from "react";
import { Filter, X, RefreshCw, Eye } from "lucide-react";
import { StyledSelect } from "@/components/staff/ui/StyledSelect";
import { SectionCard, StatusBadge, EmptyState, MotionButtonFrame } from "@/components/staff/ui";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatAppDate } from "@/lib/app-date-formatter";

type AuditLog = {
  id: string;
  familyId: string;
  actorType: string;
  actorId: string | null;
  actorName: string | null;
  action: string;
  entity: string;
  entityId: string;
  entityName: string | null;
  meta: Record<string, unknown> | null;
  createdAt: string;
};

type FilterOption = { value: string; count: number };

type Filters = {
  entities: FilterOption[];
  actions: FilterOption[];
  actorTypes: FilterOption[];
};

const ACTION_TONE: Record<string, "success" | "info" | "warning" | "neutral" | "danger" | "accent"> = {
  CREATED: "success",
  UPDATED: "info",
  DELETED: "danger",
  CLOSED: "neutral",
  FINALIZED: "accent",
  APPROVED: "success",
  REJECTED: "danger",
};

const ACTOR_TONE: Record<string, "success" | "info" | "warning" | "neutral" | "accent"> = {
  staff: "info",
  worker: "accent",
  system: "neutral",
  member: "success",
};

export function AuditLogsClient() {
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState<Filters | null>(null);

  // Filter state
  const [entity, setEntity] = useState("");
  const [action, setAction] = useState("");
  const [actorType, setActorType] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Modal state
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    setError(null);

    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("pageSize", "50");
    if (entity) params.set("entity", entity);
    if (action) params.set("action", action);
    if (actorType) params.set("actorType", actorType);
    if (startDate) params.set("startDate", startDate);
    if (endDate) params.set("endDate", endDate);

    try {
      const res = await fetch(`/api/staff/audit?${params}`);
      const data = await res.json();
      if (data.ok) {
        setLogs(data.logs ?? []);
        setTotalPages(data.totalPages ?? 1);
        setTotal(data.total ?? 0);
        if (data.filters) setFilters(data.filters);
      } else {
        setError(data.error ?? "Failed to load logs");
      }
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [page, entity, action, actorType, startDate, endDate]);

  useEffect(() => { void loadLogs(); }, [loadLogs]);

  const resetFilters = () => {
    setEntity("");
    setAction("");
    setActorType("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  };

  const hasFilters = Boolean(entity || action || actorType || startDate || endDate);

  return (
    <div className="space-y-4">
      {/* Filters card */}
      <SectionCard title="Filtres" description="Affinage par entité, action, type d'acteur et plage de dates." icon={Filter}>
        <div className="flex flex-wrap items-end gap-3">
          <FilterField label="Entité" value={entity} onChange={(v) => { setEntity(v); setPage(1); }}>
            <option value="">Toutes</option>
            {filters?.entities.map((e) => (
              <option key={e.value} value={e.value}>{e.value} ({e.count})</option>
            ))}
          </FilterField>

          <FilterField label="Action" value={action} onChange={(v) => { setAction(v); setPage(1); }}>
            <option value="">Toutes</option>
            {filters?.actions.map((a) => (
              <option key={a.value} value={a.value}>{a.value} ({a.count})</option>
            ))}
          </FilterField>

          <FilterField label="Type d'acteur" value={actorType} onChange={(v) => { setActorType(v); setPage(1); }}>
            <option value="">Tous</option>
            {filters?.actorTypes.map((a) => (
              <option key={a.value} value={a.value}>{a.value} ({a.count})</option>
            ))}
          </FilterField>

          <DateField label="Date début" value={startDate} onChange={(v) => { setStartDate(v); setPage(1); }} />
          <DateField label="Date fin" value={endDate} onChange={(v) => { setEndDate(v); setPage(1); }} />

          {hasFilters && (
            <MotionButtonFrame>
              <Button onClick={resetFilters} variant="ghost" size="sm" className="gap-1.5">
                <X className="h-4 w-4" />
                Réinitialiser
              </Button>
            </MotionButtonFrame>
          )}
        </div>
      </SectionCard>

      {error && (
        <div className="flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-200">
          <span className="font-semibold">Erreur —</span> {error}
        </div>
      )}

      {/* Table card */}
      <SectionCard
        title="Journal d'audit"
        description={`${total} entrée${total !== 1 ? "s" : ""} · page ${page}/${totalPages}`}
        actions={
          <MotionButtonFrame>
            <Button onClick={() => void loadLogs()} variant="outline" size="sm" disabled={loading} className="gap-1.5">
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
          </MotionButtonFrame>
        }
      >
        {loading && logs.length === 0 ? (
          <div className="space-y-2">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        ) : logs.length === 0 ? (
          <EmptyState
            title="Aucun log"
            description={hasFilters ? "Aucune entrée ne correspond aux filtres courants." : "Pas encore d'entrées dans le journal d'audit."}
          />
        ) : (
          <>
            <div className="overflow-x-auto -mx-4 sm:mx-0">
              <table className="min-w-full">
                <thead>
                  <tr className="border-b border-white/8">
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Date</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Acteur</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Action</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Entité</th>
                    <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Détails</th>
                    <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"></th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log) => (
                    <tr key={log.id} className="border-b border-white/4 transition-colors hover:bg-white/[0.025]">
                      <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-300">
                        {formatAppDate(log.createdAt)}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-col gap-1">
                          <StatusBadge tone={ACTOR_TONE[log.actorType] ?? "neutral"}>
                            {log.actorType}
                          </StatusBadge>
                          <span className="text-xs text-slate-400">{log.actorName ?? log.actorId ?? "—"}</span>
                        </div>
                      </td>
                      <td className="px-3 py-3">
                        <StatusBadge tone={ACTION_TONE[log.action] ?? "neutral"}>
                          {log.action}
                        </StatusBadge>
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-sm font-medium text-slate-200">{log.entity}</div>
                        <div className="font-mono text-[11px] text-slate-500">{log.entityId.slice(0, 8)}…</div>
                        {log.entityName && (
                          <div className="text-xs text-slate-400">{log.entityName}</div>
                        )}
                      </td>
                      <td className="px-3 py-3 max-w-xs">
                        {log.meta && Object.keys(log.meta).length > 0 ? (
                          <div className="truncate text-xs text-slate-400">
                            {Object.entries(log.meta)
                              .slice(0, 2)
                              .map(([k, v]) => `${k}: ${String(v).slice(0, 20)}`)
                              .join(", ")}
                            {Object.keys(log.meta).length > 2 && "…"}
                          </div>
                        ) : (
                          <span className="text-slate-600">—</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          onClick={() => setSelectedLog(log)}
                          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-slate-100"
                        >
                          <Eye className="h-3 w-3" />
                          Détails
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="mt-4 flex items-center justify-center gap-2">
                <MotionButtonFrame>
                  <Button
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={page === 1}
                    variant="outline"
                    size="sm"
                  >
                    ←
                  </Button>
                </MotionButtonFrame>
                <span className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-300 tabular-nums">
                  {page} / {totalPages}
                </span>
                <MotionButtonFrame>
                  <Button
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    disabled={page === totalPages}
                    variant="outline"
                    size="sm"
                  >
                    →
                  </Button>
                </MotionButtonFrame>
              </div>
            )}
          </>
        )}
      </SectionCard>

      {/* Detail Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="premium-card premium-surface-elevated w-full max-w-2xl max-h-[85vh] overflow-auto rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(14,5,7,0.92),rgba(10,3,5,0.96))] shadow-[0_30px_80px_-30px_rgba(0,0,0,0.85)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-[#9b2335]/65 to-transparent" />
            <div className="flex items-center justify-between border-b border-white/8 px-5 py-4">
              <h2 className="text-base font-semibold text-slate-50">Détails du log</h2>
              <button
                onClick={() => setSelectedLog(null)}
                aria-label="Fermer"
                className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-5 p-5">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <DetailField label="ID"><span className="font-mono text-xs">{selectedLog.id}</span></DetailField>
                <DetailField label="Date">{formatAppDate(selectedLog.createdAt)}</DetailField>
                <DetailField label="Type d'acteur">
                  <StatusBadge tone={ACTOR_TONE[selectedLog.actorType] ?? "neutral"}>
                    {selectedLog.actorType}
                  </StatusBadge>
                </DetailField>
                <DetailField label="Acteur">{selectedLog.actorName ?? selectedLog.actorId ?? "—"}</DetailField>
                <DetailField label="Action">
                  <StatusBadge tone={ACTION_TONE[selectedLog.action] ?? "neutral"}>
                    {selectedLog.action}
                  </StatusBadge>
                </DetailField>
                <DetailField label="Entité">{selectedLog.entity}</DetailField>
                <DetailField label="Entity ID">
                  <span className="font-mono text-xs break-all">{selectedLog.entityId}</span>
                </DetailField>
                <DetailField label="Entity name">{selectedLog.entityName ?? "—"}</DetailField>
              </div>

              {selectedLog.meta && Object.keys(selectedLog.meta).length > 0 && (
                <div>
                  <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Meta (JSON)</div>
                  <pre className="overflow-x-auto rounded-xl border border-white/8 bg-[rgba(10,4,6,0.7)] p-3 text-[11px] leading-5 font-mono text-slate-300">
{JSON.stringify(selectedLog.meta, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function FilterField({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</label>
      <StyledSelect value={value} onChange={(e) => onChange(e.target.value)} className="min-w-[10rem]">
        {children}
      </StyledSelect>
    </div>
  );
}

function DateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</label>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-xl border border-white/10 bg-[rgba(10,4,6,0.85)] px-3 py-1.5 text-sm text-slate-100 transition-colors focus:border-amber-500/40 focus:outline-none [color-scheme:dark]"
      />
    </div>
  );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-1 text-sm text-slate-200">{children}</div>
    </div>
  );
}
