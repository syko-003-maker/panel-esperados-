"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import type { ImportRun, ImportRowLog } from "@prisma/client";

type ImportRunWithRows = ImportRun & {
  rows: ImportRowLog[];
};

type FilterAction = "ALL" | "INSERT" | "UPDATE" | "SKIP" | "ERROR";

export function ImportRunDetailClient({
  importRun,
}: {
  importRun: ImportRunWithRows;
}) {
  const [filterAction, setFilterAction] = useState<FilterAction>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredRows = useMemo(() => {
    let rows = importRun.rows;

    if (filterAction !== "ALL") {
      rows = rows.filter((r) => r.action === filterAction);
    }

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
      if (r.action in counts) {
        counts[r.action as keyof typeof counts]++;
      }
    });
    return counts;
  }, [importRun.rows]);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <Link href="/staff/members/import" className="text-blue-600 hover:underline">
          ← Retour aux imports
        </Link>
      </div>

      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Détails de l'import</h1>
        {importRun.errorCount > 0 && (
          <button
            onClick={downloadErrorsJson}
            className="bg-red-100 text-red-700 px-4 py-2 rounded hover:bg-red-200"
          >
            Télécharger les erreurs (JSON)
          </button>
        )}
      </div>

      {/* Summary */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-foreground">Résumé</h2>
        <dl className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <dt className="text-sm text-muted-foreground">Date</dt>
            <dd className="font-medium text-foreground">
              {new Date(importRun.createdAt).toLocaleString("fr-FR")}
            </dd>
          </div>
          <div>
            <dt className="text-sm text-muted-foreground">Source</dt>
            <dd className="font-medium text-foreground">{importRun.source}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Fichier</dt>
            <dd className="font-medium">{importRun.fileName ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-sm text-gray-500">Total lignes</dt>
            <dd className="font-medium">{importRun.totalRows}</dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
          <div className="bg-green-50 p-3 rounded">
            <dt className="text-sm text-green-600">Insérés</dt>
            <dd className="text-2xl font-bold text-green-700">{importRun.insertedCount}</dd>
          </div>
          <div className="bg-blue-50 p-3 rounded">
            <dt className="text-sm text-blue-600">Mis à jour</dt>
            <dd className="text-2xl font-bold text-blue-700">{importRun.updatedCount}</dd>
          </div>
          <div className="bg-slate-900/20 p-3 rounded">
            <dt className="text-sm text-muted-foreground">Ignorés</dt>
            <dd className="text-2xl font-bold text-foreground">{importRun.skippedCount}</dd>
          </div>
          <div className="bg-red-50 p-3 rounded">
            <dt className="text-sm text-red-600">Erreurs</dt>
            <dd className="text-2xl font-bold text-red-700">{importRun.errorCount}</dd>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-foreground">Lignes importées</h2>

        <div className="flex flex-wrap gap-4 mb-4">
          <div className="flex gap-2">
            <button
              onClick={() => setFilterAction("ALL")}
              className={`px-3 py-1 rounded text-sm ${
                filterAction === "ALL"
                  ? "bg-slate-800 text-white"
                  : "bg-slate-900/40 text-foreground hover:bg-slate-800/50"
              }`}
            >
              Tous ({importRun.rows.length})
            </button>
            <button
              onClick={() => setFilterAction("INSERT")}
              className={`px-3 py-1 rounded text-sm ${
                filterAction === "INSERT"
                  ? "bg-green-600 text-white"
                  : "bg-green-100 text-green-700 hover:bg-green-200"
              }`}
            >
              Insérés ({actionCounts.INSERT})
            </button>
            <button
              onClick={() => setFilterAction("UPDATE")}
              className={`px-3 py-1 rounded text-sm ${
                filterAction === "UPDATE"
                  ? "bg-blue-600 text-white"
                  : "bg-blue-100 text-blue-700 hover:bg-blue-200"
              }`}
            >
              MAJ ({actionCounts.UPDATE})
            </button>
            <button
              onClick={() => setFilterAction("ERROR")}
              className={`px-3 py-1 rounded text-sm ${
                filterAction === "ERROR"
                  ? "bg-red-600 text-white"
                  : "bg-red-100 text-red-700 hover:bg-red-200"
              }`}
            >
              Erreurs ({actionCounts.ERROR})
            </button>
          </div>

          <input
            type="text"
            placeholder="Rechercher..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="px-3 py-1 border rounded text-sm flex-grow max-w-xs"
          />
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-slate-900/20">
              <tr>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Ligne</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Action</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Discord ID</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Steam ID</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Nom RP</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Grade</th>
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredRows.map((row) => (
                <tr
                  key={row.id}
                  className={
                    row.action === "ERROR"
                      ? "bg-red-500/10"
                      : row.action === "INSERT"
                      ? "bg-green-500/10"
                      : row.action === "UPDATE"
                      ? "bg-blue-500/10"
                      : ""
                  }
                >
                  <td className="px-3 py-2 text-muted-foreground">{row.rowNumber}</td>
                  <td className="px-3 py-2">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        row.action === "INSERT"
                          ? "bg-green-500/20 text-green-400"
                          : row.action === "UPDATE"
                          ? "bg-blue-500/20 text-blue-400"
                          : row.action === "ERROR"
                          ? "bg-red-500/20 text-red-400"
                          : "bg-slate-500/20 text-slate-400"
                      }`}
                    >
                      {row.action}
                    </span>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs">{row.discordId ?? "—"}</td>
                  <td className="px-3 py-2 font-mono text-xs">{row.steamId ?? "—"}</td>
                  <td className="px-3 py-2">{row.rpName ?? "—"}</td>
                  <td className="px-3 py-2">{row.grade ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-600 max-w-xs truncate">
                    {row.message ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {filteredRows.length === 0 && (
          <p className="text-center text-gray-500 py-4">Aucune ligne trouvée</p>
        )}
      </div>
    </div>
  );
}
