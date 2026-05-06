"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Filter, FileText, Calendar } from "lucide-react";
import type { ImportRun, ImportRowLog } from "@prisma/client";
import { SectionCard, StatusBadge, MotionButtonFrame, EmptyState, DataTile } from "@/components/staff/ui";
import { Button } from "@/components/ui/button";
import { formatAppDate } from "@/lib/app-date-formatter";

type ImportRunWithRows = ImportRun & {
  rows: ImportRowLog[];
};

type FilterAction = "ALL" | "INSERT" | "UPDATE" | "SKIP" | "ERROR";

const ACTION_TONE: Record<string, "success" | "info" | "warning" | "neutral" | "danger"> = {
  INSERT: "success",
  UPDATE: "info",
  SKIP: "neutral",
  ERROR: "danger",
};

export function ImportRunDetailClient({ importRun }: { importRun: ImportRunWithRows }) {
  const [filterAction, setFilterAction] = useState<FilterAction>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRows = useMemo(() => {
    let rows = importRun.rows;
    if (filterAction !== "ALL") rows = rows.filter((r) => r.action === filterAction);
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      rows = rows.filter(
        (r) =>
          r.discordId?.toLowerCase().includes(q) ||
          r.steamId?.toLowerCase().includes(q) ||
          r.rpName?.toLowerCase().includes(q) ||
          r.message?.toLowerCase().includes(q)
      );
    }
    return rows;
  }, [importRun.rows, filterAction, searchQuery]);

  const downloadErrorsJson = () => {
    const errors = importRun.rows.filter((r) => r.action === "ERROR");
    const data = {
      importRunId: importRun.id,
      createdAt: importRun.createdAt,
      errorCount: errors.length,
      errors: errors.map((e) => ({
        rowNumber: e.rowNumber,
        discordId: e.discordId,
        steamId: e.steamId,
        rpName: e.rpName,
        grade: e.grade,
        message: e.message,
      })),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `import-errors-${importRun.id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const actionCounts = useMemo(() => {
    const counts = { INSERT: 0, UPDATE: 0, SKIP: 0, ERROR: 0 };
    importRun.rows.forEach((r) => {
      if (r.action in counts) counts[r.action as keyof typeof counts]++;
    });
    return counts;
  }, [importRun.rows]);

  const FILTERS: Array<{ value: FilterAction; label: string; count: number }> = [
    { value: "ALL", label: "Tous", count: importRun.rows.length },
    { value: "INSERT", label: "Insérés", count: actionCounts.INSERT },
    { value: "UPDATE", label: "MAJ", count: actionCounts.UPDATE },
    { value: "ERROR", label: "Erreurs", count: actionCounts.ERROR },
  ];

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/staff/members/import"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-amber-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour aux imports
        </Link>
      </div>

      {/* Résumé */}
      <SectionCard
        title="Résumé"
        icon={Calendar}
        actions={
          importRun.errorCount > 0 ? (
            <MotionButtonFrame>
              <Button onClick={downloadErrorsJson} variant="outline" size="sm" className="gap-1.5">
                <Download className="h-3.5 w-3.5" />
                Télécharger erreurs (JSON)
              </Button>
            </MotionButtonFrame>
          ) : null
        }
      >
        {/* Méta */}
        <dl className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 md:grid-cols-4">
          <MetaItem label="Date" value={formatAppDate(importRun.createdAt)} />
          <MetaItem label="Source" value={importRun.source} />
          <MetaItem label="Fichier" value={importRun.fileName ?? "—"} />
          <MetaItem label="Total lignes" value={String(importRun.totalRows)} />
        </dl>

        {/* DataTiles */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <DataTile label="Insérés" value={importRun.insertedCount} tone="success" />
          <DataTile label="Mis à jour" value={importRun.updatedCount} tone="info" />
          <DataTile label="Ignorés" value={importRun.skippedCount} tone="default" />
          <DataTile label="Erreurs" value={importRun.errorCount} tone={importRun.errorCount > 0 ? "danger" : "default"} />
        </div>
      </SectionCard>

      {/* Lignes importées */}
      <SectionCard title="Lignes importées" icon={Filter}>
        {/* Filtres */}
        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => setFilterAction(f.value)}
                className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filterAction === f.value
                    ? "border-[#9b2335]/45 bg-[#9b2335]/25 text-rose-100 shadow-[0_0_12px_-4px_rgba(155,35,53,0.4)]"
                    : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.08]"
                }`}
              >
                {f.label}
                <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[10px] tabular-nums">{f.count}</span>
              </button>
            ))}
          </div>

          <input
            type="search"
            placeholder="Rechercher (discordId, steamId, nom, message)…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-[rgba(10,4,6,0.85)] px-3 py-2 text-base sm:text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-amber-500/40 focus:outline-none lg:max-w-xs"
          />
        </div>

        {filteredRows.length === 0 ? (
          <EmptyState title="Aucune ligne" description="Aucune ligne ne correspond aux filtres courants." />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ligne</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Action</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Discord ID</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Steam ID</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Nom RP</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Grade</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Message</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.id}
                    className={`border-b border-white/4 ${
                      row.action === "ERROR" ? "bg-red-500/[0.04]"
                      : row.action === "INSERT" ? "bg-emerald-500/[0.03]"
                      : row.action === "UPDATE" ? "bg-sky-500/[0.03]"
                      : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-xs text-slate-500">{row.rowNumber}</td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={ACTION_TONE[row.action] ?? "neutral"}>
                        {row.action}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{row.discordId ?? <span className="text-slate-600">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{row.steamId ?? <span className="text-slate-600">—</span>}</td>
                    <td className="px-3 py-2 text-sm text-slate-200">{row.rpName ?? <span className="text-slate-500">—</span>}</td>
                    <td className="px-3 py-2 text-sm text-slate-200">{row.grade ?? <span className="text-slate-500">—</span>}</td>
                    <td className="px-3 py-2 max-w-xs truncate text-xs text-slate-400" title={row.message ?? undefined}>
                      {row.message ?? <span className="text-slate-600">—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</dt>
      <dd className="mt-1 text-sm text-slate-200 break-words">{value}</dd>
    </div>
  );
}
