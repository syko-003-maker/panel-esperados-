"use client";

import { useState, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  parseCSV,
  validateRow,
  findDuplicates,
  type ImportRowData,
  type ValidatedRow,
} from "@/lib/import-validation";

type ImportRun = {
  id: string;
  source: string;
  fileName: string | null;
  totalRows: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  createdAt: Date;
};

export function MemberImportClient({ recentRuns }: { recentRuns: ImportRun[] }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [csvContent, setCsvContent] = useState<string>("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [parsedRows, setParsedRows] = useState<ImportRowData[]>([]);
  const [validatedRows, setValidatedRows] = useState<ValidatedRow[]>([]);
  const [duplicates, setDuplicates] = useState<Map<string, number[]>>(new Map());

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    importRunId: string;
    summary: {
      totalRows: number;
      insertedCount: number;
      updatedCount: number;
      skippedCount: number;
      errorCount: number;
    };
  } | null>(null);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setResult(null);
    setFileName(file.name);

    const text = await file.text();
    setCsvContent(text);

    const rows = parseCSV(text);
    setParsedRows(rows);

    // Validate all rows
    const validated = rows.map((row, i) => validateRow(row, i + 2));
    setValidatedRows(validated);

    // Check duplicates
    const dups = findDuplicates(rows);
    setDuplicates(dups);
  };

  const previewRows = useMemo(() => {
    return validatedRows.slice(0, 20);
  }, [validatedRows]);

  const validCount = validatedRows.filter((r) => r.isValid).length;
  const invalidCount = validatedRows.filter((r) => !r.isValid).length;
  const hasDuplicates = duplicates.size > 0;

  const canImport = parsedRows.length > 0 && !hasDuplicates && invalidCount === 0;

  const handleImport = async () => {
    if (!csvContent || !canImport) return;

    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      const blob = new Blob([csvContent], { type: "text/csv" });
      formData.append("file", blob, fileName ?? "import.csv");

      const res = await fetch("/api/staff/import/members", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error ?? "Import failed");
        return;
      }

      setResult(data);
      router.refresh();
    } catch (e) {
      setError("Erreur réseau lors de l'import");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setCsvContent("");
    setFileName(null);
    setParsedRows([]);
    setValidatedRows([]);
    setDuplicates(new Map());
    setError(null);
    setResult(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-4">
        <Link href="/staff/members" className="text-blue-600 hover:underline">
          ← Retour aux membres
        </Link>
      </div>

      <h1 className="text-2xl font-bold mb-6">Import des membres</h1>

      {/* Upload Section */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-6 mb-6">
        <h2 className="text-lg font-semibold mb-4 text-foreground">1. Sélectionner un fichier CSV</h2>

        <div className="mb-4">
          <p className="text-sm text-muted-foreground mb-2">
            Le fichier doit contenir les colonnes suivantes :
          </p>
          <ul className="text-sm text-gray-600 list-disc list-inside mb-4">
            <li>
              <strong>discordId</strong> (requis) - ID Discord (17-20 chiffres)
            </li>
            <li>
              <strong>steamId</strong> (optionnel) - Steam ID64 (17 chiffres)
            </li>
            <li>
              <strong>rpName / nom</strong> (optionnel) - Nom RP
            </li>
            <li>
              <strong>grade</strong> (optionnel) - WL1, WL2, WL3, WL4, OFFICER, CAPTAIN, CHEF
            </li>
            <li>
              <strong>age</strong> (optionnel) - Âge
            </li>
          </ul>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept=".csv,.txt"
          onChange={handleFileSelect}
          className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
        />

        {fileName && (
          <div className="mt-2 flex items-center gap-2">
            <span className="text-sm text-gray-600">Fichier: {fileName}</span>
            <button
              onClick={resetForm}
              className="text-sm text-red-600 hover:underline"
            >
              Effacer
            </button>
          </div>
        )}
      </div>

      {/* Preview Section */}
      {parsedRows.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-foreground">2. Prévisualisation</h2>

          <div className="flex flex-wrap gap-4 mb-4">
            <div className="bg-slate-900/20 px-4 py-2 rounded">
              <span className="text-sm text-muted-foreground">Total:</span>
              <span className="ml-2 font-semibold">{parsedRows.length}</span>
            </div>
            <div className="bg-green-100 px-4 py-2 rounded">
              <span className="text-sm text-green-700">Valides:</span>
              <span className="ml-2 font-semibold text-green-700">{validCount}</span>
            </div>
            {invalidCount > 0 && (
              <div className="bg-red-100 px-4 py-2 rounded">
                <span className="text-sm text-red-700">Erreurs:</span>
                <span className="ml-2 font-semibold text-red-700">{invalidCount}</span>
              </div>
            )}
            {hasDuplicates && (
              <div className="bg-orange-100 px-4 py-2 rounded">
                <span className="text-sm text-orange-700">Doublons:</span>
                <span className="ml-2 font-semibold text-orange-700">{duplicates.size}</span>
              </div>
            )}
          </div>

          {hasDuplicates && (
            <div className="bg-orange-50 border border-orange-200 rounded p-4 mb-4">
              <h3 className="font-medium text-orange-800 mb-2">Doublons détectés</h3>
              <ul className="text-sm text-orange-700 list-disc list-inside">
                {Array.from(duplicates.entries()).map(([id, rows]) => (
                  <li key={id}>
                    Discord ID {id} aux lignes {rows.join(", ")}
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-slate-900/20">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">#</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Discord ID</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Steam ID</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Nom RP</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Grade</th>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Erreurs</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {previewRows.map((row, i) => (
                  <tr key={i} className={row.isValid ? "" : "bg-red-500/10"}>
                    <td className="px-3 py-2 text-muted-foreground">{i + 2}</td>
                    <td className="px-3 py-2">
                      {row.isValid ? (
                        <span className="text-green-600">✓</span>
                      ) : (
                        <span className="text-red-600">✗</span>
                      )}
                    </td>
                    <td className="px-3 py-2 font-mono">{row.data.discordId ?? "—"}</td>
                    <td className="px-3 py-2 font-mono">{row.data.steamId ?? "—"}</td>
                    <td className="px-3 py-2">{row.data.rpName ?? "—"}</td>
                    <td className="px-3 py-2">{row.data.grade ?? "—"}</td>
                    <td className="px-3 py-2 text-red-600 text-xs">
                      {row.errors.map((e) => e.message).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {validatedRows.length > 20 && (
            <p className="mt-2 text-sm text-gray-500">
              Affichage des 20 premières lignes sur {validatedRows.length}
            </p>
          )}
        </div>
      )}

      {/* Import Button */}
      {parsedRows.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4 text-foreground">3. Lancer l'import</h2>

          {error && (
            <div className="bg-red-500/10 text-red-400 border border-red-500/30 px-4 py-2 rounded mb-4">{error}</div>
          )}

          {result && (
            <div className="bg-green-100 text-green-800 px-4 py-3 rounded mb-4">
              <p className="font-semibold mb-2">Import terminé !</p>
              <ul className="text-sm list-disc list-inside">
                <li>Insérés: {result.summary.insertedCount}</li>
                <li>Mis à jour: {result.summary.updatedCount}</li>
                <li>Ignorés: {result.summary.skippedCount}</li>
                <li>Erreurs: {result.summary.errorCount}</li>
              </ul>
              <Link
                href={`/staff/members/import/${result.importRunId}`}
                className="mt-2 inline-block text-green-900 underline"
              >
                Voir les détails →
              </Link>
            </div>
          )}

          {!result && (
            <button
              onClick={handleImport}
              disabled={loading || !canImport}
              className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Import en cours..." : `Importer ${validCount} membres`}
            </button>
          )}

          {!canImport && !result && (
            <p className="mt-2 text-sm text-red-600">
              {hasDuplicates
                ? "Corrigez les doublons avant d'importer"
                : invalidCount > 0
                ? "Corrigez les erreurs avant d'importer"
                : "Aucune donnée valide à importer"}
            </p>
          )}
        </div>
      )}

      {/* Recent Imports */}
      {recentRuns.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Imports récents</h2>

          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-slate-800 text-sm">
              <thead className="bg-slate-900/20">
                <tr>
                  <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Date</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Source</th>
                  <th className="px-3 py-2 text-left font-medium text-gray-500">Fichier</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">Total</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">Insérés</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">MAJ</th>
                  <th className="px-3 py-2 text-right font-medium text-gray-500">Erreurs</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {recentRuns.map((run) => (
                  <tr key={run.id}>
                    <td className="px-3 py-2 text-gray-500">
                      {new Date(run.createdAt).toLocaleString("fr-FR")}
                    </td>
                    <td className="px-3 py-2">{run.source}</td>
                    <td className="px-3 py-2 text-gray-500">{run.fileName ?? "—"}</td>
                    <td className="px-3 py-2 text-right">{run.totalRows}</td>
                    <td className="px-3 py-2 text-right text-green-600">{run.insertedCount}</td>
                    <td className="px-3 py-2 text-right text-blue-600">{run.updatedCount}</td>
                    <td className="px-3 py-2 text-right text-red-600">{run.errorCount}</td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/staff/members/import/${run.id}`}
                        className="text-blue-600 hover:underline"
                      >
                        Détails
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
