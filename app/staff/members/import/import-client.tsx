"use client";

import { useState, useRef, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Upload, FileText, AlertTriangle, CheckCircle2, ListChecks, Trash2 } from "lucide-react";
import {
  parseCSV,
  validateRow,
  findDuplicates,
  type ImportRowData,
  type ValidatedRow,
} from "@/lib/import-validation";
import { SectionCard, StatusBadge, MotionButtonFrame, EmptyState } from "@/components/staff/ui";
import { Button } from "@/components/ui/button";
import { getErrorMessage } from "@/lib/errors";
import { formatAppDate } from "@/lib/app-date-formatter";

type ImportRun = {
  id: string;
  source: string;
  fileName: string | null;
  totalRows: number;
  insertedCount: number;
  updatedCount: number;
  skippedCount: number;
  errorCount: number;
  createdAt: Date | string;
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

    try {
      const text = await file.text();
      setCsvContent(text);
      const rows = parseCSV(text);
      setParsedRows(rows);
      const validated = rows.map((row, i) => validateRow(row, i + 2));
      setValidatedRows(validated);
      const dups = findDuplicates(rows);
      setDuplicates(dups);
    } catch (err: unknown) {
      setError(getErrorMessage(err));
    }
  };

  const previewRows = useMemo(() => validatedRows.slice(0, 20), [validatedRows]);
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

      const res = await fetch("/api/staff/import/members", { method: "POST", body: formData });
      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Import failed");
        return;
      }
      setResult(data);
      router.refresh();
    } catch (e: unknown) {
      setError(getErrorMessage(e));
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
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="space-y-4">
      {/* Header — retour */}
      <div className="flex flex-wrap items-center gap-3">
        <Link
          href="/staff/members"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-amber-300"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Retour aux membres
        </Link>
      </div>

      {/* 1. Upload */}
      <SectionCard
        title="1. Sélectionner un fichier CSV"
        description="Format attendu : entêtes discordId (requis), steamId, rpName/nom, grade, age."
        icon={Upload}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-white/8 bg-white/[0.025] p-4 text-xs leading-6 text-slate-400">
            <p className="mb-2 text-slate-300">Colonnes acceptées :</p>
            <ul className="space-y-1 [&>li>strong]:text-amber-200">
              <li><strong>discordId</strong> — ID Discord (17–20 chiffres) <span className="text-rose-300">requis</span></li>
              <li><strong>steamId</strong> — Steam ID64 (17 chiffres) — optionnel</li>
              <li><strong>rpName / nom</strong> — Nom RP — optionnel</li>
              <li><strong>grade</strong> — WL1, WL2, WL3, WL4, OFFICER, CAPTAIN, CHEF — optionnel</li>
              <li><strong>age</strong> — entier — optionnel</li>
            </ul>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.txt"
            onChange={handleFileSelect}
            className="block w-full text-sm text-slate-400
              file:mr-4 file:rounded-xl file:border file:border-[hsl(var(--sunset-deep))]/40 file:bg-[hsl(var(--sunset-deep))]/20
              file:px-4 file:py-2 file:text-sm file:font-semibold file:text-rose-100
              file:transition-colors hover:file:bg-[hsl(var(--sunset-deep))]/30 cursor-pointer"
          />

          {fileName && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-300">
              <FileText className="h-4 w-4 text-amber-300" />
              <span>{fileName}</span>
              <MotionButtonFrame>
                <Button onClick={resetForm} variant="ghost" size="sm" className="gap-1">
                  <Trash2 className="h-3.5 w-3.5" />
                  Effacer
                </Button>
              </MotionButtonFrame>
            </div>
          )}
        </div>
      </SectionCard>

      {/* 2. Prévisualisation */}
      {parsedRows.length > 0 && (
        <SectionCard title="2. Prévisualisation" icon={ListChecks}>
          {/* Stats */}
          <div className="mb-4 flex flex-wrap gap-2">
            <StatChip label="Total" value={parsedRows.length} tone="neutral" />
            <StatChip label="Valides" value={validCount} tone="success" />
            {invalidCount > 0 && <StatChip label="Erreurs" value={invalidCount} tone="danger" />}
            {hasDuplicates && <StatChip label="Doublons" value={duplicates.size} tone="warning" />}
          </div>

          {/* Doublons */}
          {hasDuplicates && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-500/25 bg-amber-500/8 px-4 py-3 text-sm text-amber-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
              <div className="space-y-1">
                <span className="font-semibold">Doublons détectés —</span>
                <ul className="ml-4 list-disc text-xs">
                  {Array.from(duplicates.entries()).map(([id, rows]) => (
                    <li key={id}>
                      Discord ID <span className="font-mono">{id}</span> aux lignes {rows.join(", ")}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Table de preview */}
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">#</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Statut</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Discord ID</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Steam ID</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Nom RP</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Grade</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Erreurs</th>
                </tr>
              </thead>
              <tbody>
                {previewRows.map((row, i) => (
                  <tr key={i} className={`border-b border-white/4 ${row.isValid ? "" : "bg-red-500/[0.05]"}`}>
                    <td className="px-3 py-2 text-xs text-slate-500">{i + 2}</td>
                    <td className="px-3 py-2">
                      {row.isValid
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                        : <AlertTriangle className="h-4 w-4 text-red-400" />}
                    </td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{row.data.discordId ?? <span className="text-slate-600">—</span>}</td>
                    <td className="px-3 py-2 font-mono text-xs text-slate-300">{row.data.steamId ?? <span className="text-slate-600">—</span>}</td>
                    <td className="px-3 py-2 text-sm text-slate-200">{row.data.rpName ?? <span className="text-slate-500">—</span>}</td>
                    <td className="px-3 py-2 text-sm text-slate-200">{row.data.grade ?? <span className="text-slate-500">—</span>}</td>
                    <td className="px-3 py-2 text-xs text-rose-300">
                      {row.errors.map((e) => e.message).join(", ")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {validatedRows.length > 20 && (
            <p className="mt-3 text-xs text-slate-500">Affichage des 20 premières lignes sur {validatedRows.length}</p>
          )}
        </SectionCard>
      )}

      {/* 3. Lancer l'import */}
      {parsedRows.length > 0 && (
        <SectionCard title="3. Lancer l'import" icon={Upload}>
          {error && (
            <div className="mb-4 flex items-start gap-3 rounded-2xl border border-red-500/25 bg-red-500/8 px-4 py-3 text-sm text-red-200">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-400" />
              <div><span className="font-semibold">Erreur —</span> {error}</div>
            </div>
          )}

          {result && (
            <div className="mb-4 rounded-2xl border border-emerald-500/25 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-100">
              <div className="mb-2 flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                Import terminé
              </div>
              <ul className="ml-6 list-disc text-xs leading-6 text-emerald-200/90">
                <li>Insérés : <strong>{result.summary.insertedCount}</strong></li>
                <li>Mis à jour : <strong>{result.summary.updatedCount}</strong></li>
                <li>Ignorés : <strong>{result.summary.skippedCount}</strong></li>
                <li>Erreurs : <strong>{result.summary.errorCount}</strong></li>
              </ul>
              <Link
                href={`/staff/members/import/${result.importRunId}`}
                className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-emerald-200 underline-offset-2 hover:underline"
              >
                Voir le détail du run →
              </Link>
            </div>
          )}

          {!result && (
            <>
              <MotionButtonFrame>
                <Button onClick={handleImport} disabled={loading || !canImport} className="gap-2">
                  <Upload className="h-4 w-4" />
                  {loading ? "Import en cours…" : `Importer ${validCount} membres`}
                </Button>
              </MotionButtonFrame>
              {!canImport && (
                <p className="mt-2 text-xs text-rose-300">
                  {hasDuplicates
                    ? "Corrige les doublons avant d'importer."
                    : invalidCount > 0
                      ? "Corrige les erreurs avant d'importer."
                      : "Aucune donnée valide à importer."}
                </p>
              )}
            </>
          )}
        </SectionCard>
      )}

      {/* Imports récents */}
      <SectionCard title="Imports récents" icon={FileText}>
        {recentRuns.length === 0 ? (
          <EmptyState title="Aucun import" description="Aucun import n'a encore été effectué." />
        ) : (
          <div className="overflow-x-auto -mx-4 sm:mx-0">
            <table className="min-w-full">
              <thead>
                <tr className="border-b border-white/8">
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Date</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Source</th>
                  <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Fichier</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Total</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Insérés</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">MAJ</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Erreurs</th>
                  <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"></th>
                </tr>
              </thead>
              <tbody>
                {recentRuns.map((run) => (
                  <tr key={run.id} className="border-b border-white/4 transition-colors hover:bg-white/[0.025]">
                    <td className="px-3 py-3 whitespace-nowrap text-xs text-slate-400">{formatAppDate(run.createdAt)}</td>
                    <td className="px-3 py-3 text-sm text-slate-300">{run.source}</td>
                    <td className="px-3 py-3 text-xs text-slate-400">{run.fileName ?? <span className="text-slate-600">—</span>}</td>
                    <td className="px-3 py-3 text-right text-sm text-slate-200 tabular-nums">{run.totalRows}</td>
                    <td className="px-3 py-3 text-right text-sm text-emerald-300 tabular-nums">{run.insertedCount}</td>
                    <td className="px-3 py-3 text-right text-sm text-sky-300 tabular-nums">{run.updatedCount}</td>
                    <td className={`px-3 py-3 text-right text-sm tabular-nums ${run.errorCount > 0 ? "text-rose-300" : "text-slate-500"}`}>
                      {run.errorCount}
                    </td>
                    <td className="px-3 py-3 text-right">
                      <Link
                        href={`/staff/members/import/${run.id}`}
                        className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-slate-100"
                      >
                        Détail
                      </Link>
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

function StatChip({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "success" | "warning" | "danger";
}) {
  const TONES = {
    neutral: "border-white/10 bg-white/[0.05] text-slate-300",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-200",
    warning: "border-amber-500/30 bg-amber-500/10 text-amber-200",
    danger: "border-red-500/30 bg-red-500/10 text-red-200",
  };
  return (
    <div className={`inline-flex items-baseline gap-2 rounded-xl border px-3 py-1.5 text-xs ${TONES[tone]}`}>
      <span className="font-semibold uppercase tracking-[0.16em] text-[10px] opacity-80">{label}</span>
      <span className="font-bold tabular-nums">{value}</span>
    </div>
  );
}
