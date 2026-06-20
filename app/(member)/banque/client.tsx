"use client";

import { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus, Banknote, ChevronLeft, ChevronRight } from "lucide-react";

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
  if (type === 1) return "Retrait";
  if (type === 0) return "Débit";
  if (type === 2) return "Remboursement";
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

function TxIcon({ type }: { type: number }) {
  if (type === 2) return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />; // Remboursement (+)
  if (type === 1 || type === 0) return <TrendingDown className="h-3.5 w-3.5 text-red-400" />; // Retrait / Débit (−)
  return <Minus className="h-3.5 w-3.5 text-slate-400" />;
}

function txColor(type: number) {
  if (type === 2) return "text-emerald-300"; // Remboursement (+)
  if (type === 1 || type === 0) return "text-red-300"; // Retrait / Débit (−)
  return "text-blue-300";
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
          setError((json as any).error || "Erreur inconnue");
          setData(json);
          return;
        }
        setData(json);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Erreur inconnue");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [page]);

  const logs = data && data.ok ? data.data : [];
  const totalPages = data && data.ok ? Math.ceil(data.total / pageSize) : 0;
  const totalItems = data && data.ok ? data.total : 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300/70 mb-2">
          Espace Membre
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-50 md:text-3xl">
          Banque
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Historique de vos transactions
          {totalItems > 0 && (
            <span className="text-slate-500 ml-1">({totalItems} au total)</span>
          )}
        </p>
      </div>

      {/* Loading */}
      {loading && (
        <div className="space-y-2">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="h-12 rounded-xl border border-white/8 bg-white/[0.03] animate-pulse" />
          ))}
        </div>
      )}

      {/* Error */}
      {!loading && error && (
        <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5 text-sm text-red-300">
          {error}
        </div>
      )}

      {/* Empty */}
      {!loading && !error && logs.length === 0 && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm p-12 flex flex-col items-center gap-3 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.03]">
            <Banknote className="h-5 w-5 text-slate-500" />
          </div>
          <p className="text-sm font-medium text-slate-400">Aucune transaction</p>
          <p className="text-xs text-slate-600">Vos transactions apparaîtront ici.</p>
        </div>
      )}

      {/* Table */}
      {!loading && !error && logs.length > 0 && (
        <>
          <div className="rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm overflow-hidden">
            {/* Mobile cards */}
            <div className="md:hidden divide-y divide-white/[0.04]">
              {logs.map((log, idx) => (
                <div key={`${page}-${idx}`} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-2">
                    <TxIcon type={log.type} />
                    <div>
                      <div className="text-sm text-slate-300">{formatType(log.type)}</div>
                      <div className="text-xs text-slate-500">{formatDate(log.at)}</div>
                    </div>
                  </div>
                  <span className={`font-semibold tabular-nums text-sm ${txColor(log.type)}`}>
                    {log.type === 2 ? "+" : "−"}{formatAmount(Math.abs(log.money))}
                  </span>
                </div>
              ))}
            </div>
            {/* Desktop table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-white/8">
                    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Date
                    </th>
                    <th className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Type
                    </th>
                    <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">
                      Montant
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.map((log, idx) => (
                    <tr
                      key={`${page}-${idx}`}
                      className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors"
                    >
                      <td className="px-5 py-3.5 text-slate-400">{formatDate(log.at)}</td>
                      <td className="px-5 py-3.5">
                        <span className="flex items-center gap-2">
                          <TxIcon type={log.type} />
                          <span className="text-slate-300">{formatType(log.type)}</span>
                        </span>
                      </td>
                      <td className={`px-5 py-3.5 text-right font-semibold tabular-nums ${txColor(log.type)}`}>
                        {log.type === 2 ? "+" : "−"}
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
              <p className="text-xs text-slate-500">
                Page <span className="text-slate-300">{page}</span> sur{" "}
                <span className="text-slate-300">{totalPages}</span>
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPage(Math.max(1, page - 1))}
                  disabled={page === 1}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                  Précédent
                </button>
                <button
                  onClick={() => setPage(Math.min(totalPages, page + 1))}
                  disabled={page === totalPages}
                  className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300 transition hover:bg-white/[0.06] disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Suivant
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
