"use client";

import { useEffect, useMemo, useState } from "react";
import { ChevronUp, Lightbulb, Loader2, Search, Trash2 } from "lucide-react";
import { DataTile } from "@/components/staff/ui/DataTile";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { MotionButtonFrame } from "@/components/staff/ui/motion";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { SkeletonTable } from "@/components/staff/ui/Skeletons";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { StyledSelect } from "@/components/staff/ui/StyledSelect";
import { useConfirm } from "@/components/staff/ui/use-confirm";
import { Button } from "@/components/ui/button";
import { formatAppDate as fmtDate } from "@/lib/app-date-formatter";

type Status = "OPEN" | "PLANNED" | "DONE" | "REJECTED";

type Comment = { id: string; authorName: string; message: string; createdAt: string };

type Suggestion = {
  id: string;
  title: string;
  description: string;
  status: Status;
  staffNote: string | null;
  authorName: string;
  votes: number;
  createdAt: string;
  comments: Comment[];
};

const VALID_STATUSES: Status[] = ["OPEN", "PLANNED", "DONE", "REJECTED"];

const STATUS_LABELS: Record<Status, string> = {
  OPEN: "Ouverte",
  PLANNED: "Prévue",
  DONE: "Réalisée",
  REJECTED: "Refusée",
};

const STATUS_TONES: Record<Status, "danger" | "info" | "success" | "warning" | "neutral"> = {
  OPEN: "info",
  PLANNED: "warning",
  DONE: "success",
  REJECTED: "neutral",
};

export default function SuggestionsClient() {
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [items, setItems] = useState<Suggestion[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"" | Status>("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/suggestions", { cache: "no-store" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Échec du chargement");
      setItems(data.data ?? []);
      setCanManage(Boolean(data.canManage));
    } catch (err: unknown) {
      setItems([]);
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function patch(id: string, body: Record<string, unknown>) {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/staff/suggestions/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Action refusée");
      setItems((prev) => prev.map((s) => (s.id === id ? { ...s, ...data } : s)));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function addComment(id: string) {
    const message = (commentDrafts[id] ?? "").trim();
    if (!message) return;
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/staff/suggestions/${id}/comment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Commentaire refusé");
      setItems((prev) =>
        prev.map((s) => (s.id === id ? { ...s, comments: [...(s.comments ?? []), data.comment] } : s))
      );
      setCommentDrafts((d) => ({ ...d, [id]: "" }));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: string) {
    const ok = await confirm({
      title: "Supprimer cette suggestion ?",
      description: "Elle sera retirée du site et du Discord. Action irréversible.",
      confirmLabel: "Supprimer",
      tone: "danger",
    });
    if (!ok) return;
    setBusyId(id);
    try {
      const res = await fetch(`/api/staff/suggestions/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Suppression refusée");
      setItems((prev) => prev.filter((s) => s.id !== id));
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusyId(null);
    }
  }

  const filtered = useMemo(
    () => (statusFilter ? items.filter((s) => s.status === statusFilter) : items),
    [items, statusFilter]
  );

  const stats = {
    total: items.length,
    open: items.filter((s) => s.status === "OPEN").length,
    planned: items.filter((s) => s.status === "PLANNED").length,
    done: items.filter((s) => s.status === "DONE").length,
  };

  return (
    <div className="grid gap-6">
      {confirmDialog}

      <div className="flex justify-end">
        <MotionButtonFrame>
          <Button onClick={() => load()} variant="outline" size="sm" className="rounded-2xl border-white/10 bg-white/[0.04]">
            Recharger
          </Button>
        </MotionButtonFrame>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <DataTile label="Total" value={<span className="text-2xl font-semibold">{stats.total}</span>} tone="default" />
        <DataTile label="Ouvertes" value={<span className="text-2xl font-semibold">{stats.open}</span>} tone="info" />
        <DataTile label="Prévues" value={<span className="text-2xl font-semibold">{stats.planned}</span>} tone="warning" />
        <DataTile label="Réalisées" value={<span className="text-2xl font-semibold">{stats.done}</span>} tone="success" />
      </div>

      <SectionCard
        title="Idées des membres"
        description={`${items.length} suggestion${items.length !== 1 ? "s" : ""} · triées par votes`}
        icon={Lightbulb}
        actions={
          <StyledSelect
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as "" | Status)}
            className="min-w-[150px]"
          >
            <option value="">Tous les statuts</option>
            {VALID_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </StyledSelect>
        }
      >
        {error && (
          <div className="mb-4 flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
            <span className="shrink-0">❌</span>
            <div>{error}</div>
          </div>
        )}

        {loading ? (
          <SkeletonTable rows={4} cols={3} />
        ) : filtered.length === 0 ? (
          <EmptyState title="Aucune suggestion" description="Aucune idée pour ce filtre pour l'instant." icon="💡" />
        ) : (
          <div className="flex flex-col gap-3">
            {filtered.map((s) => (
              <div key={s.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex items-start gap-3">
                  {/* Votes */}
                  <div className="flex w-12 shrink-0 flex-col items-center rounded-xl border border-white/10 bg-white/[0.04] py-1.5">
                    <ChevronUp className="h-4 w-4 text-amber-300/80" />
                    <span className="text-sm font-semibold tabular-nums text-slate-100">{s.votes}</span>
                  </div>

                  {/* Content */}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-slate-100">{s.title}</span>
                      <StatusBadge tone={STATUS_TONES[s.status]} className="text-[10px] px-2 py-0.5">
                        {STATUS_LABELS[s.status]}
                      </StatusBadge>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm leading-6 text-slate-300/90">{s.description}</p>
                    <div className="mt-2 text-[11px] text-slate-500">
                      par <span className="text-slate-400">{s.authorName}</span> · {fmtDate(s.createdAt)}
                    </div>

                    {/* Fil de commentaires staff (visible par tous) */}
                    {(s.comments?.length ?? 0) > 0 && (
                      <div className="mt-3 space-y-2">
                        {s.comments.map((c) => (
                          <div
                            key={c.id}
                            className="rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100/90"
                          >
                            <div className="mb-0.5 flex items-center gap-2 text-[10px]">
                              <span className="font-semibold text-amber-300/90">{c.authorName}</span>
                              <span className="text-amber-300/45">· {fmtDate(c.createdAt)}</span>
                            </div>
                            <div className="whitespace-pre-wrap leading-5">{c.message}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Gestion (Encadrant+) : statut + suppression + ajout de commentaire */}
                    {canManage && (
                      <div className="mt-3 space-y-2 border-t border-white/10 pt-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">Statut</span>
                          <StyledSelect
                            value={s.status}
                            disabled={busyId === s.id}
                            onChange={(e) => patch(s.id, { status: e.target.value })}
                            className="min-w-[140px]"
                          >
                            {VALID_STATUSES.map((st) => (
                              <option key={st} value={st}>{STATUS_LABELS[st]}</option>
                            ))}
                          </StyledSelect>
                          {busyId === s.id && <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-500" />}
                          <button
                            type="button"
                            disabled={busyId === s.id}
                            onClick={() => remove(s.id)}
                            className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-red-500/20 bg-red-500/10 px-2.5 py-1.5 text-[11px] font-medium text-red-300/80 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Supprimer
                          </button>
                        </div>
                        <div className="flex flex-col gap-2 sm:flex-row">
                          <textarea
                            value={commentDrafts[s.id] ?? ""}
                            onChange={(e) => setCommentDrafts((d) => ({ ...d, [s.id]: e.target.value }))}
                            placeholder="Ajouter un commentaire (visible par l'auteur et sur Discord)…"
                            rows={2}
                            maxLength={2000}
                            className="flex-1 resize-y rounded-xl border border-white/10 bg-[hsl(var(--sunset-surface)/0.85)] px-3 py-2 text-xs leading-5 text-slate-200 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
                          />
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={busyId === s.id || !(commentDrafts[s.id] ?? "").trim()}
                            onClick={() => addComment(s.id)}
                            className="shrink-0 rounded-2xl border-white/10 bg-white/[0.04]"
                          >
                            {busyId === s.id ? "…" : "Commenter"}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionCard>
    </div>
  );
}
