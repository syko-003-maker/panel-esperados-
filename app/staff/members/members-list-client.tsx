"use client";
import type { BootstrapState } from "@/lib/bootstrap";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge-new";
import { Button } from "@/components/ui/button";
import { PageShell, SectionCard, EmptyState } from "@/components/staff/ui";
import Link from "next/link";
import { Search, ExternalLink, RefreshCw, Database, AlertTriangle } from "lucide-react";
import { getGradeBadgeProps } from "@/lib/grade-colors";
import { getMemberDisplayName, getNeutralRankBadge, resolveStableRank } from "@/lib/member-display";
import { formatPlaytime } from "@/lib/formatPlaytime";
import { getDiscordAvatarUrl } from "@/lib/discord/getDiscordAvatarUrl";

type Member = {
  id: string;
  discordId: string | null;
  steamId: string | null;
  rpName: string | null;
  discordDisplayName?: string | null;
  discordUsername?: string | null;
  grade: string | null;
  rankLabel: string | null;
  rankRoleId?: string | null;
  gradeLevel: number;
  discordRoleIds?: string[];
  discordLastError?: string | null;
  discordAvatarHash?: string | null;
  discordSnapshot?: {
    rolesJson?: unknown;
  } | null;
  isActive: boolean;
  effectiveActive: boolean;  // ✅ Computed: session user is ALWAYS true, otherwise = isActive
  isSessionUser: boolean;    // ✅ Flag for client-side pinning at top
  discordStatus?: "OK" | "HORS_DISCORD" | "NON_VERIFIE" | "STALE";
  playtime7d?: number | null;
  playtime7dUpdatedAt?: string | null;
  updatedAt: string;
  _diag_hasDiscordId?: boolean;
  _diag_discordId?: string | null;
  _diag_fetchStatus?: "OK" | "NOT_IN_GUILD" | "NO_DISCORD_ID" | "FETCH_FAILED" | "ALREADY_IN_DB";
  _diag_rolesCount?: number;
  _diag_matchedRankRoleId?: string | null;
  _diag_matchedRankLabel?: string | null;
};

// Sync warning type for strict TypeScript
type SyncWarning = {
  type: string;
  error?: string;
  hint?: string;
  _isInfoOnly?: boolean;
};

// Activity level thresholds (minutes of playtime in 7 days)
const ACTIVITY_LEVELS = [
  { max: 0,   label: "Inactif",     className: "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-slate-700/40 text-slate-400 border border-slate-700/50" },
  { max: 99,  label: "Faible",      className: "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-yellow-500/15 text-yellow-400 border border-yellow-500/25" },
  { max: 299, label: "Actif",       className: "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-500/15 text-green-400 border border-green-500/25" },
  { max: Infinity, label: "Très actif", className: "inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-emerald-500/20 text-emerald-300 border border-emerald-500/30" },
] as const;

function getActivityBadge(playtime7d: number | null | undefined) {
  const minutes = playtime7d ?? 0;
  for (const level of ACTIVITY_LEVELS) {
    if (minutes <= level.max) return level;
  }
  return ACTIVITY_LEVELS[ACTIVITY_LEVELS.length - 1];
}


const GRADE_COLORS: Record<
  string,
  { variant: "default" | "secondary" | "destructive" | "outline"; bgClass: string }
> = {
  CHEF: { variant: "destructive", bgClass: "bg-red-500/20 text-red-400 border border-red-500/30" },
  CAPTAIN: { variant: "default", bgClass: "bg-blue-500/20 text-blue-400 border border-blue-500/30" },
  OFFICER: { variant: "secondary", bgClass: "bg-amber-500/20 text-amber-400 border border-amber-500/30" },
  WL4: { variant: "secondary", bgClass: "bg-green-500/20 text-green-400 border border-green-500/30" },
  WL3: { variant: "secondary", bgClass: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" },
  WL2: { variant: "secondary", bgClass: "bg-cyan-500/20 text-cyan-400 border border-cyan-500/30" },
  WL1: { variant: "secondary", bgClass: "bg-slate-500/20 text-slate-400 border border-slate-500/30" },
};

function MemberAvatar({
  discordId,
  avatarHash,
  fallback,
}: {
  discordId: string | null;
  avatarHash: string | null | undefined;
  fallback: string;
}) {
  const avatarUrl = getDiscordAvatarUrl(discordId, avatarHash);

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt="Avatar"
        className="h-8 w-8 rounded-full object-cover border border-slate-700"
        loading="lazy"
      />
    );
  }

  return (
    <div className="h-8 w-8 rounded-full border border-slate-700 bg-slate-800 text-slate-200 text-xs font-semibold flex items-center justify-center">
      {fallback.slice(0, 1).toUpperCase()}
    </div>
  );
}

export function MembersListClient({ 
  members, 
  bootstrap,
  debug = false,
  sessionDiscordId = null,
}: { 
  members: Member[];
  bootstrap: BootstrapState;
  debug?: boolean;
  sessionDiscordId?: string | null;
}) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<"name" | "grade" | "playtime7d" | "status">("grade");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showInactive, setShowInactive] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncWarnings, setSyncWarnings] = useState<SyncWarning[] | null>(null);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);

  async function syncNow() {
    setSyncing(true);
    setSyncError(null);
    setSyncWarnings(null);
    setSyncMessage("🔄 Synchronisation en cours...");

    const startTime = Date.now();
    const controller = new AbortController();
    
    // Set 120s timeout for manual sync (long-running operation)
    const timeoutId = setTimeout(() => {
      controller.abort();
    }, 120_000);

    try {
      const res = await fetch("/api/staff/sync/all", { 
        method: "POST",
        signal: controller.signal,
      });
      const data = await res.json().catch(() => ({}));
      const elapsedMs = Date.now() - startTime;
      console.log("[SYNC] Manual sync completed", { elapsedMs, ok: res.ok, status: res.status });

      // Check members sync result (required)
      if (data?.members?.ok === false) {
        setSyncError(
          data.members.error ||
            "Failed to sync members from LYG"
        );
        return;
      }

      // Build summary message
      const summary: string[] = [];
      if (data?.members) {
        const { fetched, upserted, updated, skipped, activeSteamIdsCount, activatedCount, deactivatedCount } = data.members;
        if (fetched) {
          summary.push(`✓ Members: ${fetched} fetched`);
          if (upserted) summary.push(`${upserted} new`);
          if (updated) summary.push(`${updated} updated`);
        } else if (data.members.reason === "no_data_received") {
          summary.push("✓ Members: no new data");
        }
        // Add reconciliation stats
        if (activeSteamIdsCount !== undefined) {
          summary.push(`(${activeSteamIdsCount} actifs LYG)`);
        }
        if (activatedCount && activatedCount > 0) {
          summary.push(`${activatedCount} activés`);
        }
        if (deactivatedCount && deactivatedCount > 0) {
          summary.push(`${deactivatedCount} désactivés`);
        }
      }

      if (data?.banklogs?.ok) {
        const { inserted } = data.banklogs;
        summary.push(`✓ Banklogs: ${inserted || 0} items`);
      }

      if (data?.elapsedMs) {
        summary.push(`in ${data.elapsedMs}ms`);
      }

      const summaryText = summary.join(" • ");
      setSyncMessage(summaryText || data.message);

      // Filter warnings: only show blocking warnings (not "infos" type)
      // "infos" type warnings are non-critical and don't count as "partial sync"
      if (data?.warnings && Array.isArray(data.warnings)) {
        const blockingWarnings = data.warnings.filter((w: SyncWarning) => w.type !== "infos");
        
        // Show blocking warnings if any exist
        if (blockingWarnings.length > 0) {
          setSyncWarnings(blockingWarnings);
        }
        
        // Show infos-only warnings in a separate info banner (handled in render below)
        const infosOnlyWarnings = data.warnings.filter((w: SyncWarning) => w.type === "infos");
        if (infosOnlyWarnings.length > 0 && blockingWarnings.length === 0) {
          // Store as special state for info banner
          setSyncWarnings(infosOnlyWarnings.map((w: SyncWarning): SyncWarning => ({ ...w, _isInfoOnly: true })));
        }
      }

      // Refresh page data
      setTimeout(() => {
        router.refresh();
      }, 300);
    } catch (err: any) {
      const elapsedMs = Date.now() - startTime;
      const isAborted = controller.signal.aborted;
      
      if (isAborted) {
        console.error("[SYNC] Manual sync aborted/timed out after", elapsedMs, "ms");
        setSyncError("Synchronisation interrompue (timeout après 120s). Veuillez réessayer.");
      } else {
        console.error("[SYNC] Manual sync error", { error: err?.message, elapsedMs });
        setSyncError(String(err?.message ?? err));
      }
    } finally {
      clearTimeout(timeoutId);
      setSyncing(false);
    }
  }

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const base = term
      ? members.filter((m) =>
          [m.rpName, m.discordId, m.steamId]
            .filter(Boolean)
            .some((field) => field!.toLowerCase().includes(term))
          || getMemberDisplayName(m).toLowerCase().includes(term)
        )
      : members;

    // ✅ CRITICAL: Filter by effectiveActive (session user is always active)
    // showInactive toggle controls visibility of inactive members
    // effectiveActive=true = member is active (in LYG OR is session user), show status
    // effectiveActive=false = member not in LYG and not session user, marked as "Ancien membre"
    const byActivity = showInactive 
      ? base 
      : base.filter((m) => m.effectiveActive === true);

    return [...byActivity].sort((a, b) => {
      // ✅ BONUS: Pin session user at top of list (if present)
      if (a.isSessionUser && !b.isSessionUser) return -1;
      if (!a.isSessionUser && b.isSessionUser) return 1;
      
      // Sort by effectiveActive first (active > inactive), then by status, then by grade
      if (a.effectiveActive !== b.effectiveActive) {
        return a.effectiveActive ? -1 : 1; // Active first
      }

      // For members with same activity status, sort by Discord status
      const statusOrder = { OK: 0, STALE: 1, HORS_DISCORD: 2, NON_VERIFIE: 3 };
      const aStatus = statusOrder[(a.discordStatus || "NON_VERIFIE") as keyof typeof statusOrder] ?? 3;
      const bStatus = statusOrder[(b.discordStatus || "NON_VERIFIE") as keyof typeof statusOrder] ?? 3;
      if (aStatus !== bStatus) return aStatus - bStatus;

      switch (sortBy) {
        case "name":
          return sortDir === "asc"
            ? getMemberDisplayName(a).localeCompare(getMemberDisplayName(b))
            : getMemberDisplayName(b).localeCompare(getMemberDisplayName(a));
        case "playtime7d":
          return sortDir === "asc"
            ? (a.playtime7d ?? 0) - (b.playtime7d ?? 0)
            : (b.playtime7d ?? 0) - (a.playtime7d ?? 0);
        case "status": {
          const statusOrder = { OK: 0, STALE: 1, HORS_DISCORD: 2, NON_VERIFIE: 3 };
          const aS = statusOrder[(a.discordStatus || "NON_VERIFIE") as keyof typeof statusOrder] ?? 3;
          const bS = statusOrder[(b.discordStatus || "NON_VERIFIE") as keyof typeof statusOrder] ?? 3;
          const diff = sortDir === "asc" ? aS - bS : bS - aS;
          return diff !== 0 ? diff : getMemberDisplayName(a).localeCompare(getMemberDisplayName(b));
        }
        case "grade":
        default:
          if (a.gradeLevel !== b.gradeLevel)
            return sortDir === "asc" ? a.gradeLevel - b.gradeLevel : b.gradeLevel - a.gradeLevel;
          return getMemberDisplayName(a).localeCompare(getMemberDisplayName(b));
      }
    });
  }, [members, search, sortBy, sortDir, showInactive]);

  // Show bootstrap CTA only if DB is truly empty (no members)
  if (members.length === 0) {
    return (
      <PageShell
        title="Membres"
        description="Gestion centralisée de tous les membres de la famille"
      >
        <SectionCard title="Base de données vide" className="border-amber-500/20">
          <div className="space-y-4">
            <EmptyState
              icon={<AlertTriangle className="w-12 h-12 text-amber-400" />}
              title="Aucune donnée synchronisée"
              description="La base de données est vide. Synchronisez les données depuis LYG pour commencer."
              actionLabel={syncing ? "Synchronisation en cours..." : "Synchroniser maintenant"}
              onAction={syncNow}
            />
            {syncError && (
              <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-400 max-w-2xl mx-auto">
                ❌ Erreur: {syncError}
                <br />
                <a href="/api/debug/lyg" target="_blank" rel="noopener noreferrer" className="underline mt-1 inline-block">
                  Ouvrir diagnostic LYG →
                </a>
              </div>
            )}
          </div>
        </SectionCard>
      </PageShell>
    );
  }

  // ✅ Count members using effectiveActive (includes session user override)
  // effectiveActive=true: Member is active (in LYG OR is session user)
  // effectiveActive=false: Member removed from LYG and is not session user (historical records)
  const stats = {
    activeLyg: members.filter((m) => m.effectiveActive === true).length,      // Effective actifs
    formerLyg: members.filter((m) => m.effectiveActive === false).length,     // Effective anciens
    dbTotal: members.length,                                                   // All members in DB
    // Discord breakdown (optional, for reference)
    discordOk: members.filter((m) => m.effectiveActive === true && m.discordStatus === "OK").length,
    discordHors: members.filter((m) => m.effectiveActive === true && m.discordStatus === "HORS_DISCORD").length,
    discordStale: members.filter((m) => m.effectiveActive === true && m.discordStatus === "STALE").length,
    discordNonVerifie: members.filter((m) => m.effectiveActive === true && m.discordStatus === "NON_VERIFIE").length,
  };

  // Summary stats computed from currently filtered view
  const visibleActive = filtered.filter((m) => m.effectiveActive);
  const avgPlaytime = visibleActive.length > 0
    ? Math.round(visibleActive.reduce((sum, m) => sum + (m.playtime7d ?? 0), 0) / visibleActive.length)
    : 0;
  const top3 = [...visibleActive]
    .sort((a, b) => (b.playtime7d ?? 0) - (a.playtime7d ?? 0))
    .slice(0, 3);

  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <h1 className="text-4xl font-bold tracking-tight text-foreground">Membres</h1>
          <p className="text-muted-foreground">
            Gestion centralisée de tous les membres de la famille
          </p>
        </div>
        <Button onClick={syncNow} disabled={syncing} variant="outline" className="border-slate-800">
          <RefreshCw className={`h-4 w-4 mr-2 ${syncing ? "animate-spin" : ""}`} />
          {syncing ? "Synchronisation..." : "Sync now"}
        </Button>
      </div>
      
      {syncError && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-400 space-y-2">
          <div className="flex items-start gap-2">
            <span className="mt-0.5">❌</span>
            <div className="flex-1">
              <div className="font-semibold">Erreur de synchronisation</div>
              <div className="text-red-300 text-xs mt-1">{syncError}</div>
            </div>
          </div>
          <a
            href="/api/staff/diagnostics/lyg"
            target="_blank"
            rel="noopener noreferrer"
            className="text-red-300 underline hover:text-red-200 text-xs inline-block mt-2"
          >
            Ouvrir diagnostic LYG →
          </a>
        </div>
      )}
      {syncMessage && !syncError && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/10 px-4 py-3 text-sm text-green-400 space-y-2">
          <div className="flex items-start gap-2">
            <span className="mt-0.5">✓</span>
            <div className="flex-1">
              <div className="font-semibold">Synchronisation réussie</div>
              <div className="text-green-300 text-xs mt-1">{syncMessage}</div>
            </div>
          </div>
        </div>
      )}
      
      {/* Blocking warnings (amber/yellow - actual partial sync) */}
      {syncWarnings && syncWarnings.length > 0 && 
       syncWarnings.some((w: SyncWarning) => w.type !== "infos") && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-300 space-y-3">
          <div className="flex items-start gap-2">
            <span className="mt-0.5">⚠️</span>
            <div className="flex-1">
              <div className="font-semibold">Synchronisation partielle</div>
              <div className="text-amber-300/80 text-xs mt-1">
                Les membres ont été importés, mais certaines données LYG n'ont pas pu être synchronisées.
              </div>
            </div>
          </div>
          <ul className="space-y-1 ml-2">
            {syncWarnings.filter((w: SyncWarning) => w.type !== "infos").map((w, i) => (
              <li key={i} className="text-amber-300/90 text-xs">
                <strong>{w.type}:</strong> {w.error}
                {w.hint && <div className="text-amber-300/70 mt-1">{w.hint}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Infos-only warnings (blue info banner - non-blocking) */}
      {syncWarnings && syncWarnings.length > 0 && 
       syncWarnings.every((w: SyncWarning) => w.type === "infos") && (
        <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-300 space-y-2">
          <div className="flex items-start gap-2">
            <span className="mt-0.5">ℹ️</span>
            <div className="flex-1">
              <div className="font-semibold">Infos famille indisponibles</div>
              <div className="text-blue-300/80 text-xs mt-1">
                Les données famille LYG ne sont pas disponibles, mais la synchronisation des membres et journaux s'est déroulée correctement.
              </div>
            </div>
          </div>
          <ul className="space-y-1 ml-2">
            {syncWarnings.map((w, i) => (
              <li key={i} className="text-blue-300/90 text-xs">
                {w.error}
                {w.hint && <div className="text-blue-300/70 mt-1">{w.hint}</div>}
              </li>
            ))}
          </ul>
        </div>
      )}
      
      {/* Old warning list removal */}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-muted-foreground">Actifs (LYG)</p>
          <p className="text-2xl font-bold mt-1 text-green-400">{stats.activeLyg}</p>
          <p className="text-xs text-green-400/70 mt-1">discord OK: {stats.discordOk}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-muted-foreground">Anciens membres</p>
          <p className="text-2xl font-bold text-slate-400 mt-1">{stats.formerLyg}</p>
        </div>
        <div className="rounded-lg border border-red-900/30 bg-slate-900/40 p-4">
          <p className="text-sm text-muted-foreground">Hors Discord</p>
          <p className="text-2xl font-bold text-red-400 mt-1">{stats.discordHors}</p>
          <p className="text-xs text-slate-500 mt-1">non liés: {members.filter(m => m.effectiveActive && !m.discordId).length}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-muted-foreground">Total BD</p>
          <p className="text-2xl font-bold text-slate-300 mt-1">{stats.dbTotal}</p>
        </div>
      </div>

      {/* Summary row: visible view stats */}
      <div className="rounded-lg border border-slate-800 bg-slate-900/20 px-4 py-3 flex flex-wrap gap-x-6 gap-y-2 text-sm text-muted-foreground">
        <span>Vue actuelle : <strong className="text-foreground">{filtered.length}</strong> membres</span>
        <span>Moy. playtime 7j : <strong className="text-foreground">{formatPlaytime(avgPlaytime)}</strong></span>
        {top3.length > 0 && (
          <span>
            Top {top3.length} :{" "}
            {top3.map((m, i) => (
              <span key={m.id}>
                {i > 0 && " · "}
                <strong className="text-foreground">{getMemberDisplayName(m)}</strong>{" "}
                <span className="text-xs">({formatPlaytime(m.playtime7d ?? 0)})</span>
              </span>
            ))}
          </span>
        )}
      </div>

      {/* Search & Filter Section */}
      <div className="flex flex-col sm:flex-row gap-4 items-stretch sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Rechercher un membre (RP, Discord, Steam)..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10 bg-slate-900/40 border-slate-800 text-foreground placeholder:text-muted-foreground"
          />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground whitespace-nowrap">
            Trier par:
          </span>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as typeof sortBy)}
            className="text-sm bg-slate-900/40 border border-slate-800 rounded-md px-3 py-2 text-foreground"
          >
            <option value="grade">Grade</option>
            <option value="name">Nom</option>
            <option value="playtime7d">Playtime 7j</option>
            <option value="status">Statut Discord</option>
          </select>
          <button
            onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
            className="text-sm bg-slate-900/40 border border-slate-800 rounded-md px-3 py-2 text-foreground hover:bg-slate-800/60 transition-colors"
            title={sortDir === "asc" ? "Croissant — cliquer pour décroissant" : "Décroissant — cliquer pour croissant"}
          >
            {sortDir === "asc" ? "↑" : "↓"}
          </button>
        </div>
        <label className="flex items-center gap-2 text-sm text-muted-foreground whitespace-nowrap cursor-pointer">
          <input
            type="checkbox"
            checked={showInactive}
            onChange={(e) => setShowInactive(e.target.checked)}
            className="w-4 h-4"
          />
          Afficher anciens membres
        </label>
      </div>

      {/* Table Section */}
      <div className="rounded-lg border border-slate-800 overflow-hidden bg-slate-900/40">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] text-sm">
            <thead className="bg-slate-900/20">
              <tr className="border-b border-slate-800">
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Nom RP
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Grade
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Discord
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Steam
                </th>
                <th className="px-4 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                  Playtime 7j
                </th>
                <th className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Statut
                </th>
                <th className="px-4 py-3 text-center text-xs font-medium text-muted-foreground uppercase">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {filtered.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <p className="text-sm">Aucun membre trouvé</p>
                  </td>
                </tr>
              ) : (
                filtered.map((m) => {
                  const isMyRow = Boolean(sessionDiscordId && m.discordId === sessionDiscordId);
                  const displayName = getMemberDisplayName(m);
                  const stableRank = resolveStableRank({
                    hasDiscordId: Boolean(m.discordId),
                    rankRoleId: m.rankRoleId || m._diag_matchedRankRoleId,
                    rankLabel: m.rankLabel || m._diag_matchedRankLabel,
                    discordRoleIds: m.discordRoleIds,
                    snapshotRolesJson: m.discordSnapshot?.rolesJson,
                    discordLastError: m.discordLastError ?? null,
                  });

                  const roleDebug = (() => {
                    if (!m._diag_hasDiscordId) {
                      return { sourceTag: "fallback:NO_DISCORD_ID", branch: "no_discord_id" };
                    }
                    if (m._diag_fetchStatus === "NOT_IN_GUILD") {
                      return { sourceTag: "discord live:NOT_IN_GUILD", branch: "not_in_guild" };
                    }
                    if (stableRank.rankRoleId) {
                      if (Array.isArray(m.discordRoleIds) && m.discordRoleIds.length > 0) {
                        return { sourceTag: "cache:discordRoleIds", branch: "stable_rank_roleid_from_cache" };
                      }
                      if (Array.isArray(m.discordSnapshot?.rolesJson) && m.discordSnapshot.rolesJson.length > 0) {
                        return { sourceTag: "snapshot:rolesJson", branch: "stable_rank_roleid_from_snapshot" };
                      }
                      return { sourceTag: "DB:rankRoleId", branch: "stable_rank_roleid_from_db" };
                    }
                    if (stableRank.rankLabel) {
                      return { sourceTag: "DB:rankLabel", branch: "stable_rank_label_from_db" };
                    }
                    if (m._diag_fetchStatus === "FETCH_FAILED" || stableRank.neutralState) {
                      if (stableRank.neutralState === "DISCORD_UNAVAILABLE") {
                        return { sourceTag: "fallback:DISCORD_UNAVAILABLE", branch: "discord_unavailable" };
                      }
                      return { sourceTag: "fallback:VERIFICATION_DIFFEREE", branch: "verification_differee" };
                    }
                    return { sourceTag: "fallback:SANS_GRADE", branch: "sans_grade" };
                  })();

                  // Determine rank badge based on diagnostic status and rank role ID
                  const getRankBadge = () => {
                    // No Discord ID - member not linked
                    if (!m._diag_hasDiscordId) {
                      const badgeProps = getGradeBadgeProps(null, "NO_DISCORD_ID");
                      return (
                        <span className={badgeProps.className} title="Member not linked to Discord">
                          {badgeProps.label}
                        </span>
                      );
                    }

                    // Not in guild - Discord user not in server
                    if (m._diag_fetchStatus === "NOT_IN_GUILD") {
                      const badgeProps = getGradeBadgeProps(null, "NOT_IN_GUILD");
                      return (
                        <span className={badgeProps.className} title="User not in Discord server">
                          {badgeProps.label}
                        </span>
                      );
                    }

                    // Prefer stable local rank (DB/snapshot/cache) over live fetch status
                    if (stableRank.rankRoleId) {
                      const badgeProps = getGradeBadgeProps(
                        stableRank.rankRoleId,
                        m._diag_fetchStatus === "ALREADY_IN_DB" ? "ALREADY_IN_DB" : undefined
                      );
                      return (
                        <span className={badgeProps.className} title={`Grade: ${badgeProps.label}`}>
                          {badgeProps.label}
                        </span>
                      );
                    }

                    if (stableRank.rankLabel) {
                      const base = getGradeBadgeProps(null);
                      return (
                        <span className={base.className} title={`Grade: ${stableRank.rankLabel}`}>
                          {stableRank.rankLabel}
                        </span>
                      );
                    }

                    if (m._diag_fetchStatus === "FETCH_FAILED" || stableRank.neutralState) {
                      const badgeProps = getNeutralRankBadge(
                        stableRank.neutralState ?? "DISCORD_UNAVAILABLE"
                      );
                      return (
                        <span className={badgeProps.className} title={badgeProps.label}>
                          {badgeProps.label}
                        </span>
                      );
                    }

                    // No grade found - show sans grade
                    const badgeProps = getGradeBadgeProps(null);
                    return (
                      <span className={badgeProps.className} title="No grade role detected">
                        {badgeProps.label}
                      </span>
                    );
                  };

                  return (
                    <tr
                      key={m.id}
                      className={[
                        "hover:bg-slate-900/30 transition-colors",
                        !m.effectiveActive ? "opacity-50" : "",
                        m.effectiveActive && !m.discordId ? "bg-slate-800/20" : "",
                        m.effectiveActive && m.discordStatus === "HORS_DISCORD" ? "bg-red-950/10" : "",
                      ].filter(Boolean).join(" ")}
                    >
                      <td className="px-4 py-4 font-medium text-foreground">
                        <div className="flex items-center gap-3 min-w-0">
                          <MemberAvatar
                            discordId={m.discordId}
                            avatarHash={m.discordAvatarHash}
                            fallback={displayName}
                          />
                          <span className="truncate">{displayName}</span>
                        </div>
                        {isMyRow ? (
                          <div className="mt-2 rounded border border-amber-500/40 bg-amber-500/10 p-2 text-[10px] text-amber-200 font-mono leading-4">
                            DEBUG(MY_ROW) source={roleDebug.sourceTag} branch={roleDebug.branch}
                            <br />
                            raw.rpName={String(m.rpName ?? null)}
                            <br />
                            raw.discordDisplayName={String(m.discordDisplayName ?? null)}
                            <br />
                            raw.discordUsername={String(m.discordUsername ?? null)}
                            <br />
                            raw.steamId={String(m.steamId ?? null)}
                            <br />
                            raw.rankRoleId={String(m.rankRoleId ?? m._diag_matchedRankRoleId ?? null)} raw.rankLabel={String(m.rankLabel ?? m._diag_matchedRankLabel ?? null)} raw.grade={String(m.grade ?? null)}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-4 py-4">
                        {getRankBadge()}
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-muted-foreground break-all">
                        {m.discordId ? (
                          <code className="bg-slate-900/40 border border-slate-800 px-2 py-1 rounded">
                            {m.discordId}
                          </code>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-4 font-mono text-xs text-muted-foreground break-all">
                        {m.steamId ? (
                          <code className="bg-slate-900/40 border border-slate-800 px-2 py-1 rounded">
                            {m.steamId}
                          </code>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-muted-foreground text-right">
                        <div className="font-medium text-slate-200">{formatPlaytime(m.playtime7d ?? 0)}</div>
                        <div className="mt-1">
                          <span className={getActivityBadge(m.playtime7d).className}>
                            {getActivityBadge(m.playtime7d).label}
                          </span>
                        </div>
                        <div className="mt-1 text-[10px] text-muted-foreground/70">
                          {m.playtime7dUpdatedAt
                            ? new Date(m.playtime7dUpdatedAt).toLocaleDateString("fr-FR")
                            : "-"}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-center">
                        {(() => {
                          // ✅ OVERRIDE: Session user (logged-in account) is always "active" (cannot be marked ancien)
                          // effectiveActive is guaranteed true for session user
                          if (sessionDiscordId && m.discordId === sessionDiscordId) {
                            return (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-500/20 text-blue-400 border border-blue-500/30">
                                ✅ Vous (Actif)
                              </span>
                            );
                          }
                          
                          // ✅ Determine badge based on effectiveActive (session user override already applied)
                          if (!m.effectiveActive) {
                            // Removed from LYG, kept in DB for history
                            return (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-600/20 text-slate-400 border border-slate-600/40">
                                👤 Ancien membre
                              </span>
                            );
                          }
                          
                          // ✅ FIX: Check if member is NOT linked to Discord first
                          if (!m.discordId) {
                            return (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-gray-500/20 text-gray-400 border border-gray-500/30">
                                — Non lié
                              </span>
                            );
                          }
                          
                          const status = m.discordStatus || "NON_VERIFIE";
                          if (status === "OK") {
                            return (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                                ✅ OK
                              </span>
                            );
                          }
                          if (status === "HORS_DISCORD") {
                            return (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                                ❌ Hors Discord
                              </span>
                            );
                          }
                          if (status === "STALE") {
                            return (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                ⚠️ Snapshot stale
                              </span>
                            );
                          }
                          return (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/20 text-slate-300 border border-slate-500/30">
                              ⏳ Non verifie
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {m.discordId ? (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                            <Link href={`/staff/members/by-discord/${m.discordId}`} prefetch={false}>
                              <ExternalLink className="h-4 w-4" />
                            </Link>
                          </Button>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
