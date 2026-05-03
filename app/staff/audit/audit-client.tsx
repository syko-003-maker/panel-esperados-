"use client";

import { useEffect, useState, useCallback } from "react";

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

import { StyledSelect } from "@/components/staff/ui/StyledSelect";

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
    } catch (err: any) {
      setError(err.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }, [page, entity, action, actorType, startDate, endDate]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  function getActionColor(action: string) {
    switch (action) {
      case "CREATED":
        return "bg-green-100 text-green-800";
      case "UPDATED":
        return "bg-blue-100 text-blue-800";
      case "DELETED":
        return "bg-red-100 text-red-800";
      case "CLOSED":
        return "bg-gray-100 text-gray-800";
      case "FINALIZED":
        return "bg-purple-100 text-purple-800";
      case "APPROVED":
        return "bg-green-100 text-green-800";
      case "REJECTED":
        return "bg-red-100 text-red-800";
      default:
        return "bg-gray-100 text-gray-700";
    }
  }

  function getActorTypeBadge(type: string) {
    switch (type) {
      case "staff":
        return "bg-blue-50 text-blue-700";
      case "worker":
        return "bg-purple-50 text-purple-700";
      case "system":
        return "bg-gray-50 text-gray-700";
      case "member":
        return "bg-green-50 text-green-700";
      default:
        return "bg-gray-50 text-gray-600";
    }
  }

  function resetFilters() {
    setEntity("");
    setAction("");
    setActorType("");
    setStartDate("");
    setEndDate("");
    setPage(1);
  }

  return (
    <div>
      {/* Filters */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-4 mb-6">
        <div className="flex flex-wrap gap-4 items-end">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Entity</label>
            <StyledSelect
              value={entity}
              onChange={(e) => {
                setEntity(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous</option>
              {filters?.entities.map((e) => (
                <option key={e.value} value={e.value}>
                  {e.value} ({e.count})
                </option>
              ))}
            </StyledSelect>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Action</label>
            <StyledSelect
              value={action}
              onChange={(e) => {
                setAction(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Toutes</option>
              {filters?.actions.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.value} ({a.count})
                </option>
              ))}
            </StyledSelect>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Actor Type</label>
            <StyledSelect
              value={actorType}
              onChange={(e) => {
                setActorType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">Tous</option>
              {filters?.actorTypes.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.value} ({a.count})
                </option>
              ))}
            </StyledSelect>
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Date début</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setStartDate(e.target.value);
                setPage(1);
              }}
              className="border rounded px-3 py-1.5 text-sm"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 mb-1">Date fin</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setEndDate(e.target.value);
                setPage(1);
              }}
              className="border rounded px-3 py-1.5 text-sm"
            />
          </div>

          <button
            onClick={resetFilters}
            className="bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded text-sm"
          >
            Reset
          </button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 text-red-800 px-4 py-2 rounded mb-4">{error}</div>
      )}

      {/* Stats */}
      <div className="mb-4 text-sm text-gray-600">
        {total} entrée(s) • Page {page}/{totalPages}
      </div>

      {/* Table */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-800 text-sm">
            <thead className="bg-slate-900/20">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Actor</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Action</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Entity</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Details</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {loading ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">
                    Chargement...
                  </td>
                </tr>
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-gray-500">
                    Aucun log trouvé
                  </td>
                </tr>
              ) : (
                logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 whitespace-nowrap">
                      <div className="text-xs">
                        {new Date(log.createdAt).toLocaleDateString("fr-FR")}
                      </div>
                      <div className="text-xs text-gray-500">
                        {new Date(log.createdAt).toLocaleTimeString("fr-FR")}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getActorTypeBadge(log.actorType)}`}
                      >
                        {log.actorType}
                      </span>
                      <div className="text-xs mt-1">{log.actorName ?? log.actorId ?? "—"}</div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${getActionColor(log.action)}`}
                      >
                        {log.action}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-medium">{log.entity}</div>
                      <div className="text-xs text-gray-500 font-mono">{log.entityId.slice(0, 8)}...</div>
                      {log.entityName && (
                        <div className="text-xs text-gray-600">{log.entityName}</div>
                      )}
                    </td>
                    <td className="px-4 py-3 max-w-xs">
                      {log.meta && Object.keys(log.meta).length > 0 ? (
                        <div className="text-xs text-gray-600 truncate">
                          {Object.entries(log.meta)
                            .slice(0, 2)
                            .map(([k, v]) => `${k}: ${String(v).slice(0, 20)}`)
                            .join(", ")}
                          {Object.keys(log.meta).length > 2 && "..."}
                        </div>
                      ) : (
                        <span className="text-gray-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="text-blue-600 hover:underline text-xs"
                      >
                        Détails
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="px-3 py-1 rounded border disabled:opacity-50"
          >
            ←
          </button>
          <span className="px-3 py-1">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="px-3 py-1 rounded border disabled:opacity-50"
          >
            →
          </button>
        </div>
      )}

      {/* Detail Modal */}
      {selectedLog && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
          onClick={() => setSelectedLog(null)}
        >
          <div
            className="bg-white rounded-lg p-6 max-w-2xl w-full mx-4 max-h-[80vh] overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-between items-start mb-4">
              <h2 className="text-lg font-bold">Détails du log</h2>
              <button
                onClick={() => setSelectedLog(null)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <div className="text-gray-500">ID</div>
                  <div className="font-mono">{selectedLog.id}</div>
                </div>
                <div>
                  <div className="text-gray-500">Date</div>
                  <div>{new Date(selectedLog.createdAt).toLocaleString("fr-FR")}</div>
                </div>
                <div>
                  <div className="text-gray-500">Actor Type</div>
                  <div>{selectedLog.actorType}</div>
                </div>
                <div>
                  <div className="text-gray-500">Actor</div>
                  <div>{selectedLog.actorName ?? selectedLog.actorId ?? "—"}</div>
                </div>
                <div>
                  <div className="text-gray-500">Action</div>
                  <div>
                    <span className={`px-2 py-0.5 rounded text-xs ${getActionColor(selectedLog.action)}`}>
                      {selectedLog.action}
                    </span>
                  </div>
                </div>
                <div>
                  <div className="text-gray-500">Entity</div>
                  <div>{selectedLog.entity}</div>
                </div>
                <div>
                  <div className="text-gray-500">Entity ID</div>
                  <div className="font-mono text-xs break-all">{selectedLog.entityId}</div>
                </div>
                <div>
                  <div className="text-gray-500">Entity Name</div>
                  <div>{selectedLog.entityName ?? "—"}</div>
                </div>
              </div>

              {selectedLog.meta && Object.keys(selectedLog.meta).length > 0 && (
                <div>
                  <div className="text-gray-500 mb-2">Meta (JSON)</div>
                  <pre className="bg-gray-50 p-4 rounded overflow-auto text-xs font-mono">
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
