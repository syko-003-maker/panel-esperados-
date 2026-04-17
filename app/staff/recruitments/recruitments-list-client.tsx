"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FileSpreadsheet, MessageSquare, Search, Trash2, UserCheck, Users } from "lucide-react";
import { getDiscordThreadUrl } from "@/lib/discord-config";
import { DataTile } from "@/components/staff/ui/DataTile";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { MotionButtonFrame, MotionListItem } from "@/components/staff/ui/motion";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";

type DbStatus = "PENDING" | "ACCEPTED" | "REJECTED" | "ARCHIVED";

type Recruitment = {
  id: string;
  ticketKey: string;
  status: DbStatus;
  authorDiscordId: string;
  authorTag: string | null;
  steamId: string | null;
  rpName: string | null;
  threadId: string | null;
  createdAt: string;
  closedAt: string | null;
  claimedByName: string | null;
};

// Mapping direct statut DB → badge
const STATUS_BADGE: Record<DbStatus, { tone: "info" | "success" | "danger" | "warning" | "neutral"; label: string }> = {
  PENDING:  { tone: "info",    label: "🟡 En attente" },
  ACCEPTED: { tone: "success", label: "✅ Accepté"    },
  REJECTED: { tone: "danger",  label: "❌ Refusé"     },
  ARCHIVED: { tone: "neutral", label: "📦 Archivé"    },
};

type FilterValue = "ALL" | DbStatus;

export function RecruitmentsListClient({ recruitments }: { recruitments: Recruitment[] }) {
  const [filter, setFilter] = useState<FilterValue>("ALL");
  const [sortBy, setSortBy] = useState<"createdAt" | "name">("createdAt");
  const [search, setSearch] = useState("");
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deletedIds, setDeletedIds] = useState<Set<string>>(new Set());
  const [confirmRefuseId, setConfirmRefuseId] = useState<string | null>(null);
  const [refusingId, setRefusingId] = useState<string | null>(null);
  const [refusedIds, setRefusedIds] = useState<Set<string>>(new Set());
  const [claimingId, setClaimingId] = useState<string | null>(null);
  const router = useRouter();

  const visible = useMemo(() => {
    return recruitments
      .filter((r) => !deletedIds.has(r.id))
      .filter((r) => filter === "ALL" || r.status === filter)
      .filter((r) => {
        if (!search) return true;
        const q = search.toLowerCase();
        return (
          r.ticketKey.toLowerCase().includes(q) ||
          r.authorDiscordId.toLowerCase().includes(q) ||
          (r.rpName?.toLowerCase().includes(q) ?? false) ||
          (r.steamId?.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => {
        if (sortBy === "createdAt") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        return (a.rpName || "").localeCompare(b.rpName || "");
      });
  }, [recruitments, filter, sortBy, search, deletedIds]);

  async function handleDelete(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/staff/recruitment/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Suppression échouée");
      setDeletedIds((prev) => new Set([...prev, id]));
      setConfirmDeleteId(null);
    } catch (err: any) {
      setDeleteError(String(err?.message ?? err));
    } finally {
      setDeletingId(null);
    }
  }

  async function handleRefuse(id: string) {
    setRefusingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/staff/recruitment/${id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: "REJECT" }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Impossible de refuser ce recrutement.");
      setRefusedIds((prev) => new Set([...prev, id]));
      setConfirmRefuseId(null);
    } catch (err: any) {
      setDeleteError(String(err?.message ?? err));
    } finally {
      setRefusingId(null);
    }
  }

  async function handleClaim(r: Recruitment) {
    setClaimingId(r.id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/staff/recruitment/${r.id}/claim`, { method: "POST" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Impossible de prendre en charge ce recrutement.");
      router.push(`/staff/recruitments/${r.ticketKey}`);
    } catch (err: any) {
      setDeleteError(String(err?.message ?? err));
      setClaimingId(null);
    }
  }

  function exportToCSV() {
    const csv = [
      ["ID", "Ticket", "Discord", "RP", "Steam", "Statut", "Créé"].join(","),
      ...visible.map((r) =>
        [r.id, r.ticketKey, r.authorDiscordId, r.rpName || "", r.steamId || "", r.status, fmtDate(r.createdAt)].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "recruitments.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  }

  const total    = recruitments.filter((r) => !deletedIds.has(r.id)).length;
  const pending  = recruitments.filter((r) => !deletedIds.has(r.id) && r.status === "PENDING").length;
  const accepted = recruitments.filter((r) => !deletedIds.has(r.id) && r.status === "ACCEPTED").length;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-3">
        <DataTile label="En attente" value={pending}  tone="info"    />
        <DataTile label="Acceptés"   value={accepted} tone="success" />
        <DataTile label="Total"      value={total}    tone="default" />
      </div>

      {deleteError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {deleteError}
        </div>
      )}

      <SectionCard
        title="Filtres"
        description="Filtrage métier, recherche rapide et export CSV des recrutements visibles."
        icon={Search}
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
          <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            Statut :
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterValue)}
              className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-amber-500/40 focus:outline-none"
            >
              <option value="ALL">Tous</option>
              <option value="PENDING">🟡 En attente</option>
              <option value="ACCEPTED">✅ Accepté</option>
              <option value="REJECTED">❌ Refusé</option>
              <option value="ARCHIVED">📦 Archivé</option>
            </select>
          </label>

          <label className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            Tri :
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "createdAt" | "name")}
              className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 focus:border-amber-500/40 focus:outline-none"
            >
              <option value="createdAt">Date de création</option>
              <option value="name">Nom RP</option>
            </select>
          </label>

          <input
            type="text"
            placeholder="Ticket, Discord, RP, Steam..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
          />

          <MotionButtonFrame>
            <button
              onClick={exportToCSV}
              disabled={visible.length === 0}
              className="inline-flex items-center gap-2 rounded-2xl border border-emerald-500/30 bg-emerald-500/14 px-3 py-2 text-sm font-semibold text-emerald-100 transition-colors hover:bg-emerald-500/22 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-white/[0.04] disabled:text-slate-500"
            >
              <FileSpreadsheet className="h-4 w-4" />
              CSV
            </button>
          </MotionButtonFrame>

          {visible.length > 0 ? <StatusBadge>{visible.length}/{total}</StatusBadge> : null}
        </div>
      </SectionCard>

      <SectionCard
        title="Liste des recrutements"
        description="Navigation rapide vers les dossiers de recrutement et leurs threads Discord."
        icon={Users}
      >
        {visible.length === 0 ? (
          <EmptyState
            icon={<Users className="h-12 w-12" />}
            title="Aucun recrutement visible"
            description={search ? "Aucun résultat pour cette recherche." : "Aucun recrutement pour ce filtre."}
          />
        ) : (
          <div className="space-y-3">
            {visible.map((r, index) => {
              const badge = STATUS_BADGE[r.status] ?? STATUS_BADGE.PENDING;
              const isConfirming = confirmDeleteId === r.id;
              const isDeleting   = deletingId === r.id;
              const isConfirmingRefuse = confirmRefuseId === r.id;
              const isRefusing = refusingId === r.id;
              const effectiveStatus = refusedIds.has(r.id) ? "REJECTED" : r.status;
              const effectiveBadge = refusedIds.has(r.id) ? STATUS_BADGE.REJECTED : badge;

              return (
                <MotionListItem key={r.id} delay={index * 0.015} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge tone={effectiveBadge.tone}>{effectiveBadge.label}</StatusBadge>
                        <span className="font-mono text-sm font-semibold text-cyan-300">{r.ticketKey}</span>
                      </div>

                      <div className="text-sm text-slate-100">
                        {r.rpName ? (
                          r.authorDiscordId ? (
                            <Link href={`/staff/members/by-discord/${r.authorDiscordId}`} prefetch={false} className="font-medium text-cyan-300 hover:underline">
                              {r.rpName}
                            </Link>
                          ) : (
                            <span className="font-medium">{r.rpName}</span>
                          )
                        ) : (
                          <span className="text-slate-500">—</span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        <span>Auteur : {r.authorTag ?? r.authorDiscordId}</span>
                        <span>•</span>
                        <span>Créé le {fmtDate(r.createdAt)}</span>
                        {r.closedAt ? <><span>•</span><span>Clôturé le {fmtDate(r.closedAt)}</span></> : null}
                        {r.steamId ? <><span>•</span><span className="font-mono">{r.steamId}</span></> : null}
                        <span>•</span>
                        <span>
                          Pris en charge par :{" "}
                          {r.claimedByName
                            ? <span className="text-amber-300 font-medium">{r.claimedByName}</span>
                            : <span className="text-slate-500">Non attribué</span>
                          }
                        </span>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">
                      {isConfirmingRefuse ? (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-300">Confirmer le refus ?</span>
                          <button
                            onClick={() => handleRefuse(r.id)}
                            disabled={isRefusing}
                            className="rounded-2xl bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                          >
                            {isRefusing ? "…" : "Refuser"}
                          </button>
                          <button
                            onClick={() => setConfirmRefuseId(null)}
                            disabled={isRefusing}
                            className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.08]"
                          >
                            Annuler
                          </button>
                        </div>
                      ) : !isConfirming ? (
                        <>
                          {r.threadId ? (
                            <MotionButtonFrame>
                              <a
                                href={getDiscordThreadUrl(r.threadId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-2xl border border-indigo-500/30 bg-indigo-500/12 px-3 py-2 text-sm font-medium text-indigo-200 transition-colors hover:bg-indigo-500/20"
                              >
                                <MessageSquare className="h-4 w-4" />
                                Discord
                              </a>
                            </MotionButtonFrame>
                          ) : null}

                          {effectiveStatus === "PENDING" && !r.claimedByName && (
                            <MotionButtonFrame>
                              <button
                                onClick={() => handleClaim(r)}
                                disabled={claimingId === r.id}
                                className="inline-flex items-center gap-1.5 rounded-2xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm font-medium text-amber-300 transition-colors hover:bg-amber-500/20 disabled:opacity-50"
                              >
                                <UserCheck className="h-3.5 w-3.5" />
                                {claimingId === r.id ? "…" : "Prendre en charge"}
                              </button>
                            </MotionButtonFrame>
                          )}

                          <MotionButtonFrame>
                            <Link
                              href={`/staff/recruitments/${r.ticketKey}`}
                              className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.08]"
                            >
                              {effectiveStatus === "PENDING" ? "Ouvrir" : "Voir"}
                            </Link>
                          </MotionButtonFrame>

                          {effectiveStatus === "PENDING" && (
                            <MotionButtonFrame>
                              <button
                                onClick={() => { setConfirmRefuseId(r.id); setConfirmDeleteId(null); setDeleteError(null); }}
                                className="inline-flex items-center gap-1.5 rounded-2xl border border-orange-500/20 bg-orange-500/[0.06] px-3 py-2 text-sm font-medium text-orange-400 transition-colors hover:bg-orange-500/15"
                              >
                                ❌ Refuser
                              </button>
                            </MotionButtonFrame>
                          )}

                          <MotionButtonFrame>
                            <button
                              onClick={() => { setConfirmDeleteId(r.id); setConfirmRefuseId(null); setDeleteError(null); }}
                              className="inline-flex items-center gap-1.5 rounded-2xl border border-red-500/20 bg-red-500/[0.06] px-3 py-2 text-sm font-medium text-red-400 transition-colors hover:bg-red-500/15"
                              title="Supprimer ce recrutement"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Supprimer
                            </button>
                          </MotionButtonFrame>
                        </>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="text-sm text-slate-300">Supprimer ?</span>
                          <button
                            onClick={() => handleDelete(r.id)}
                            disabled={isDeleting}
                            className="rounded-2xl bg-red-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700 disabled:opacity-50"
                          >
                            {isDeleting ? "…" : "Confirmer"}
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            disabled={isDeleting}
                            className="rounded-2xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.08]"
                          >
                            Annuler
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </MotionListItem>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function fmtDate(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("fr-FR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}
