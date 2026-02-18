"use client";

import { useEffect, useState } from "react";

type BankLogItem = {
  at: string;
  type: number;
  money: number;
  steamId: string;
};

type BankLogsResponse =
  | { ok: true; data: BankLogItem[]; page: number; pageSize: number; total: number }
  | { ok: false; error: string };

function formatType(type: number) {
  if (type === 1) return "Crédit";
  if (type === 0) return "Débit";
  if (type === 2) return "Dépôt";
  return `Type ${type}`;
}

function formatAmount(amount: number) {
  return amount.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function getTypeColor(type: number) {
  if (type === 1) return "text-emerald-300";
  if (type === 0) return "text-red-300";
  if (type === 2) return "text-blue-300";
  return "text-slate-300";
}

export function BankPageClient() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<BankLogsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/me/banklogs?page=${page}&pageSize=${pageSize}`,
          { cache: "no-store" }
        );
        const json = (await res.json()) as BankLogsResponse;
        if (!mounted) return;
        if (!res.ok || !json.ok) {
          setError((json as any).error || "Unknown error");
          setData(json);
          return;
        }
        setData(json);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [page]);

  const logs = data && data.ok ? data.data : [];
  const totalPages = data && data.ok ? Math.ceil(data.total / pageSize) : 0;
  const totalItems = data && data.ok ? data.total : 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-white">Banque</h1>
        <p className="text-slate-400">
          Historique de vos transactions{" "}
          {totalItems > 0 && (
            <span className="text-slate-500">
              ({totalItems} au total)
            </span>
          )}
        </p>
      </div>

      {/* Content */}
      {loading && (
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 text-slate-300">
          Chargement des transactions...
        </div>
      )}

      {!loading && error && (
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300">
          {error}
        </div>
      )}

      {!loading && !error && logs.length === 0 && (
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 text-slate-300 text-center">
          Aucune transaction
        </div>
      )}

      {!loading && !error && logs.length > 0 && (
        <>
          {/* Table */}
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-800 border-b border-slate-700">
                  <tr>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">
                      Date
                    </th>
                    <th className="px-4 py-3 text-left font-semibold text-slate-300">
                      Type
                    </th>
                    <th className="px-4 py-3 text-right font-semibold text-slate-300">
                      Montant
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700">
                  {logs.map((log, idx) => (
                    <tr
                      key={`${page}-${idx}`}
                      className={`hover:bg-slate-800/50 transition ${getTypeColor(log.type)}`}
                    >
                      <td className="px-4 py-3">{formatDate(log.at)}</td>
                      <td className="px-4 py-3">{formatType(log.type)}</td>
                      <td className="px-4 py-3 text-right font-semibold">
                        {log.type === 1 ? "+" : "-"}
                        {formatAmount(Math.abs(log.money))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-slate-400">
                Page {page} sur {totalPages}
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="px-3 py-2 rounded border border-slate-700 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:border-slate-500 transition"
                >
                  ← Précédent
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="px-3 py-2 rounded border border-slate-700 text-slate-300 disabled:opacity-50 disabled:cursor-not-allowed hover:border-slate-500 transition"
                >
                  Suivant →
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
