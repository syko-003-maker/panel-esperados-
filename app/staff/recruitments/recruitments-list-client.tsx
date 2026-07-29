"use client";

import { getErrorMessage } from "@/lib/errors";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Award, ChevronDown, FileSpreadsheet, MessageSquare, Search, Trash2, UserCheck, Users } from "lucide-react";
import { getDiscordThreadUrl } from "@/lib/discord-config";
import { DataTile } from "@/components/staff/ui/DataTile";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { MotionButtonFrame, MotionListItem } from "@/components/staff/ui/motion";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { StyledSelect } from "@/components/staff/ui/StyledSelect";

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
  claimedByAvatar: string | null;
  /** Note sur 20, ou null si le dossier n'a pas encore été évalué. */
  score: number | null;
};

/** Vert au-dessus de 14, ambre entre 10 et 14, rouge en dessous. */
function scoreTone(score: number) {
  if (score >= 14) return "bg-emerald-500/15 text-emerald-300";
  if (score >= 10) return "bg-amber-500/15 text-amber-300";
  return "bg-red-500/15 text-red-300";
}

// Avatar Discord du recruteur, avec repli sur les initiales si pas d'image / 404.
function RecruiterAvatar({ src, name, ring }: { src: string | null; name: string; ring: string }) {
  const [failed, setFailed] = useState(false);
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return (
      <img
        src={src}
        alt={name}
        onError={() => setFailed(true)}
        className={`h-10 w-10 shrink-0 rounded-full object-cover ring-2 ${ring}`}
      />
    );
  }
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-xs font-bold text-slate-300 ring-2 ${ring}`}
    >
      {initials || "?"}
    </div>
  );
}

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
  // Recruteur déplié dans le classement (un seul à la fois).
  const [openRecruiter, setOpenRecruiter] = useState<string | null>(null);
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

  // Quota recruteurs : agrégation par recruteur (claimedByName). Reste en phase
  // avec les suppressions/refus en direct via deletedIds/refusedIds.
  // `items` garde les recrutements de chacun pour le dépliage au clic : la
  // liste complète est déjà en mémoire, inutile d'appeler l'API pour la détailler.
  const recruiterStats = useMemo(() => {
    const map = new Map<
      string,
      {
        name: string; avatar: string | null;
        accepted: number; refused: number; pending: number; total: number;
        items: Recruitment[];
      }
    >();
    recruitments
      .filter((r) => !deletedIds.has(r.id))
      .forEach((r) => {
        const name = r.claimedByName;
        if (!name) return;
        const eff: DbStatus = refusedIds.has(r.id) ? "REJECTED" : r.status;
        const cur = map.get(name)
          ?? { name, avatar: r.claimedByAvatar, accepted: 0, refused: 0, pending: 0, total: 0, items: [] };
        if (!cur.avatar && r.claimedByAvatar) cur.avatar = r.claimedByAvatar;
        cur.total += 1;
        if (eff === "ACCEPTED") cur.accepted += 1;
        else if (eff === "REJECTED") cur.refused += 1;
        else if (eff === "PENDING") cur.pending += 1;
        cur.items.push(r);
        map.set(name, cur);
      });
    for (const s of map.values()) {
      s.items.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
    return [...map.values()].sort((a, b) => b.accepted - a.accepted || b.total - a.total);
  }, [recruitments, deletedIds, refusedIds]);

  const unassignedCount = recruitments.filter(
    (r) => !deletedIds.has(r.id) && !r.claimedByName
  ).length;

  async function handleDelete(id: string) {
    setDeletingId(id);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/staff/recruitment/${id}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Suppression échouée");
      setDeletedIds((prev) => new Set([...prev, id]));
      setConfirmDeleteId(null);
    } catch (err: unknown) {
      setDeleteError(getErrorMessage(err));
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
    } catch (err: unknown) {
      setDeleteError(getErrorMessage(err));
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
    } catch (err: unknown) {
      setDeleteError(getErrorMessage(err));
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

      <SectionCard
        title="Quota recruteurs"
        description="Recrutements pris en charge par recruteur, classés par recrues acceptées."
        icon={Award}
      >
        {recruiterStats.length === 0 ? (
          <EmptyState
            icon={<Award className="h-12 w-12" />}
            title="Aucun recruteur"
            description="Aucun recrutement n'est encore attribué à un recruteur."
          />
        ) : (
          <div className="space-y-2.5">
            {recruiterStats.map((s, i) => {
              const max = recruiterStats[0].accepted || 1;
              const pct = Math.max(5, Math.round((s.accepted / max) * 100));
              const rate = s.total > 0 ? Math.round((s.accepted / s.total) * 100) : 0;
              const medal = i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : null;
              const ringColor =
                i === 0 ? "ring-amber-400/60"
                : i === 1 ? "ring-slate-300/50"
                : i === 2 ? "ring-orange-500/50"
                : "ring-white/10";
              const rankText =
                i === 0 ? "text-amber-300"
                : i === 1 ? "text-slate-200"
                : i === 2 ? "text-orange-300"
                : "text-slate-500";
              const barGradient =
                i === 0
                  ? "from-amber-300 to-amber-500 shadow-[0_0_10px_rgba(251,191,36,0.45)]"
                  : "from-emerald-400/80 to-amber-500/70";
              const isOpen = openRecruiter === s.name;
              return (
                <div
                  key={s.name}
                  className={`group rounded-2xl border px-4 py-3 transition-all hover:border-amber-500/30 hover:bg-white/[0.045] ${
                    i === 0
                      ? "border-amber-400/25 bg-amber-400/[0.04]"
                      : "border-white/10 bg-white/[0.025]"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => setOpenRecruiter((cur) => (cur === s.name ? null : s.name))}
                    aria-expanded={isOpen}
                    className="flex w-full items-center gap-3 text-left"
                  >
                    <span className={`w-6 shrink-0 text-center text-sm font-bold ${rankText}`}>
                      {medal ?? `#${i + 1}`}
                    </span>
                    <RecruiterAvatar src={s.avatar} name={s.name} ring={ringColor} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate font-semibold text-amber-200">{s.name}</span>
                        <ChevronDown
                          className={`h-3.5 w-3.5 shrink-0 text-slate-500 transition-transform ${
                            isOpen ? "rotate-180" : ""
                          }`}
                        />
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {s.total} pris en charge · {rate}% d&apos;acceptation
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <div className="flex items-baseline gap-1">
                        <span className="text-xl font-extrabold leading-none text-emerald-300">
                          {s.accepted}
                        </span>
                        <span className="text-[11px] text-slate-500">acceptés</span>
                      </div>
                      {(s.refused > 0 || s.pending > 0) && (
                        <div className="flex items-center gap-1.5">
                          {s.refused > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-500/12 px-2 py-0.5 text-[10px] font-semibold text-red-300/90">
                              ✗ {s.refused}
                            </span>
                          )}
                          {s.pending > 0 && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/12 px-2 py-0.5 text-[10px] font-semibold text-sky-300/90">
                              ⏳ {s.pending}
                            </span>
                          )}
                        </div>
                      )}
                    </div>
                  </button>

                  <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-black/30">
                    <div
                      className={`h-full rounded-full bg-gradient-to-r ${barGradient}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  {isOpen && (
                    <div className="mt-3 space-y-1 border-t border-white/10 pt-3">
                      {s.items.map((r) => {
                        const eff: DbStatus = refusedIds.has(r.id) ? "REJECTED" : r.status;
                        const badge = STATUS_BADGE[eff];
                        return (
                          <Link
                            key={r.id}
                            href={`/staff/recruitments/${r.ticketKey}`}
                            prefetch={false}
                            className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-white/[0.06]"
                          >
                            <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                            <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                              {r.rpName || r.authorTag || r.authorDiscordId}
                            </span>
                            {r.score !== null ? (
                              <span
                                className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${scoreTone(r.score)}`}
                                title="Note obtenue au test de recrutement"
                              >
                                {r.score.toFixed(1)}/20
                              </span>
                            ) : (
                              <span className="shrink-0 text-[11px] italic text-slate-600">
                                non évalué
                              </span>
                            )}
                            <span className="shrink-0 text-[11px] text-slate-500">
                              {fmtDate(r.createdAt)}
                            </span>
                          </Link>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {unassignedCount > 0 && (
              <p className="pt-1 text-center text-xs text-slate-500">
                + {unassignedCount} recrutement{unassignedCount > 1 ? "s" : ""} sans recruteur attribué
              </p>
            )}
          </div>
        )}
      </SectionCard>

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
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-200 shrink-0">Statut :</span>
            <StyledSelect
              value={filter}
              onChange={(e) => setFilter(e.target.value as FilterValue)}
              className="min-w-[140px]"
            >
              <option value="ALL">Tous</option>
              <option value="PENDING">En attente</option>
              <option value="ACCEPTED">Accepté</option>
              <option value="REJECTED">Refusé</option>
              <option value="ARCHIVED">Archivé</option>
            </StyledSelect>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-slate-200 shrink-0">Tri :</span>
            <StyledSelect
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as "createdAt" | "name")}
              className="min-w-[160px]"
            >
              <option value="createdAt">Date de création</option>
              <option value="name">Nom RP</option>
            </StyledSelect>
          </div>

          <div className="relative min-w-0 flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-500 pointer-events-none" />
            <input
              type="text"
              placeholder="Ticket, Discord, RP, Steam..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-[hsl(var(--sunset-surface3)/0.85)] pl-8 pr-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
            />
          </div>

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
                      </div>

                      <div className="text-sm text-slate-100">
                        {r.rpName ? (
                          r.authorDiscordId ? (
                            <Link href={`/staff/members/by-discord/${r.authorDiscordId}`} prefetch={false} className="font-medium text-amber-300 hover:underline">
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
                          {r.threadId && effectiveStatus === "PENDING" ? (
                            <MotionButtonFrame>
                              <a
                                href={getDiscordThreadUrl(r.threadId)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-3 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.10]"
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
                              className="flex h-8 w-8 items-center justify-center rounded-xl border border-white/8 bg-transparent text-red-500/50 transition-colors hover:border-red-500/30 hover:bg-red-500/8 hover:text-red-400"
                              title="Supprimer ce recrutement"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
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

// fmtDate centralisé via @/lib/app-date-formatter
import { formatAppDate as fmtDate } from "@/lib/app-date-formatter";
