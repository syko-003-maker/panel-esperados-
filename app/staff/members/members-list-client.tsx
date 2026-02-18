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

type Member = {
  id: string;
  discordId: string | null;
  steamId: string | null;
  rpName: string | null;
  grade: string | null;
  rankLabel: string | null;
  rankRoleId?: string | null;
  gradeLevel: number;
  isActive: boolean;
  effectiveActive: boolean;  // ✅ Computed: session user is ALWAYS true, otherwise = isActive
  isSessionUser: boolean;    // ✅ Flag for client-side pinning at top
  memberStatus?: "active" | "former" | "not-found" | "unavailable" | "unknown";
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
  const [sortBy, setSortBy] = useState<"name" | "grade">("grade");
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
      const statusOrder = { active: 0, former: 1, unknown: 2 };
      const aStatus = statusOrder[(a.memberStatus || "unknown") as "active" | "former" | "unknown"] ?? 2;
      const bStatus = statusOrder[(b.memberStatus || "unknown") as "active" | "former" | "unknown"] ?? 2;
      if (aStatus !== bStatus) return aStatus - bStatus;

      switch (sortBy) {
        case "name":
          return (a.rpName || "").localeCompare(b.rpName || "");
        case "grade":
        default:
          if (a.gradeLevel !== b.gradeLevel)
            return b.gradeLevel - a.gradeLevel;
          return (a.rpName || "").localeCompare(b.rpName || "");
      }
    });
  }, [members, search, sortBy, showInactive]);

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
    discordActive: members.filter((m) => m.effectiveActive === true && (m.memberStatus || "unavailable") === "active").length,
    discordFormer: members.filter((m) => m.effectiveActive === true && (m.memberStatus || "unavailable") === "former").length,
    discordNotFound: members.filter((m) => m.effectiveActive === true && (m.memberStatus || "unavailable") === "not-found").length,
    discordUnavailable: members.filter((m) => m.effectiveActive === true && (m.memberStatus || "unavailable") === "unavailable").length,
  };

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
      <div className="grid grid-cols-4 gap-4">
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-muted-foreground">Actifs (LYG)</p>
          <p className="text-2xl font-bold mt-1 text-green-400">{stats.activeLyg}</p>
          <p className="text-xs text-green-400/70 mt-1">discord: {stats.discordActive}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-muted-foreground">Anciens membres</p>
          <p className="text-2xl font-bold text-slate-400 mt-1">{stats.formerLyg}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-muted-foreground">Sans rôle Discord</p>
          <p className="text-2xl font-bold text-slate-600 mt-1">{stats.discordFormer}</p>
        </div>
        <div className="rounded-lg border border-slate-800 bg-slate-900/40 p-4">
          <p className="text-sm text-muted-foreground">Total BD</p>
          <p className="text-2xl font-bold text-slate-300 mt-1">{stats.dbTotal}</p>
        </div>
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
          </select>
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
          <table className="w-full text-sm">
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
                    colSpan={6}
                    className="px-4 py-12 text-center text-muted-foreground"
                  >
                    <p className="text-sm">Aucun membre trouvé</p>
                  </td>
                </tr>
              ) : (
                filtered.map((m) => {
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

                    // Fetch failed - API error
                    if (m._diag_fetchStatus === "FETCH_FAILED") {
                      const badgeProps = getGradeBadgeProps(null, "FETCH_FAILED");
                      return (
                        <span className={badgeProps.className} title="Could not fetch Discord roles">
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

                    // Already in DB cache or resolved - use rank role ID for colors
                    const rankRoleId = m.rankRoleId || m._diag_matchedRankRoleId;
                    if (rankRoleId) {
                      const badgeProps = getGradeBadgeProps(rankRoleId, m._diag_fetchStatus === "ALREADY_IN_DB" ? "ALREADY_IN_DB" : undefined);
                      return (
                        <span className={badgeProps.className} title={`Grade: ${badgeProps.label}`}>
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
                    <tr key={m.id} className="hover:bg-slate-900/30 transition-colors">
                      <td className="px-4 py-4 font-medium text-foreground">
                        {m.rpName ?? "—"}
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
                          
                          // Member is active in LYG and HAS discordId linked
                          const status = m.memberStatus || "unavailable";
                          if (status === "active") {
                            // Has valid Discord role
                            return (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-green-500/20 text-green-400 border border-green-500/30">
                                ✅ Actif
                              </span>
                            );
                          } else if (status === "former") {
                            // In LYG but no Discord role
                            return (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/20 text-amber-400 border border-amber-500/30">
                                ⚠️ Sans rôle
                              </span>
                            );
                          } else if (status === "not-found") {
                            // Member not in Discord guild (explicit 404)
                            return (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-red-500/20 text-red-400 border border-red-500/30">
                                ❌ Hors serveur
                              </span>
                            );
                          } else if (status === "unknown") {
                            return (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-500/20 text-slate-300 border border-slate-500/30">
                                ⏳ Discord: non verifie (rate limit)
                              </span>
                            );
                          } else {
                            // status === "unavailable" - Discord API error/timeout
                            return (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-600/20 text-slate-300 border border-slate-600/40">
                                ⚠️ Discord indisponible
                              </span>
                            );
                          }
                        })()}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {m.discordId ? (
                          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" asChild>
                            <Link href={`/staff/members/by-discord/${m.discordId}`}>
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
