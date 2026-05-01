"use client";

import React, { useEffect, useMemo, useState, useCallback, useRef } from "react";
import type { StaffMemberDto } from "@/types/staff";
import { formatPlaytime } from "@/lib/formatPlaytime";
import { getDiscordAvatarUrl } from "@/lib/discord/getDiscordAvatarUrl";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { LoadingState } from "@/components/staff/ui/LoadingState";
import { MotionButtonFrame } from "@/components/staff/ui/motion";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge as UiStatusBadge } from "@/components/staff/ui/StatusBadge";
import {
  formatPlaytimeDelta,
  getActivityBand,
  getMemberRowClassName,
  getMemberStatus,
  isActivityExempt,
  isWatchMember,
  matchesQuickFilter,
} from "@/lib/staff/member-ux";
import type { QuickFilter } from "@/lib/staff/member-ux";

type MemberItem = StaffMemberDto & {
  grade?: string | null;
  gradeLevel?: number | null;
  rankLabel?: string | null;
  rankRoleId?: string | null;
  previousPlaytime7d?: number | null;
  playtimeDelta7d?: number | null;
  discordRolesUpdatedAt?: string | null;
  discordLastError?: string | null;
};

function getAbsenceTypeLabel(type: "MEETING" | "GENERAL") {
  return type === "MEETING" ? "Absence réunion" : "Absence générale";
}

type OnlineStatus = { connected: boolean; last_name: string | null; coins: number | null };

type MembersScope = "active" | "all" | "demoted" | "non_link" | "blacklisted" | "reservists";
type MembersSortBy = "name" | "grade" | "playtime7d" | "status";
type MembersSortDir = "asc" | "desc";

const SCOPE_OPTIONS: Array<{ value: MembersScope; label: string }> = [
  { value: "active", label: "Actifs" },
  { value: "all", label: "Tous" },
  { value: "reservists", label: "Réservistes" },
  { value: "blacklisted", label: "Blacklist" },
  { value: "demoted", label: "Demote uniquement" },
  { value: "non_link", label: "Non link" },
];

type ExtendedFilter = QuickFilter | "online";

const QUICK_FILTER_OPTIONS: Array<{ value: ExtendedFilter; label: string; icon: string; color: "default" | "green" | "emerald" | "rose" | "amber" | "cyan" | "orange" }> = [
  { value: "all",      label: "Tous",            icon: "◈",  color: "default"  },
  { value: "online",   label: "En jeu",          icon: "●",  color: "green"    },
  { value: "active",   label: "Actifs",          icon: "▲",  color: "emerald"  },
  { value: "inactive", label: "Inactifs",        icon: "▼",  color: "rose"     },
  { value: "low",      label: "Faible activité", icon: "◐",  color: "amber"    },
  { value: "top",      label: "Top actifs",      icon: "★",  color: "cyan"     },
  { value: "watch",    label: "À surveiller",    icon: "⚑",  color: "orange"   },
];

export default function MembersListClient() {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyticsAvailable, setAnalyticsAvailable] = useState(false);
  const [scope, setScope] = useState<MembersScope>("active");
  const [quickFilter, setQuickFilter] = useState<ExtendedFilter>("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<MembersSortBy>("grade");
  const [sortDir, setSortDir] = useState<MembersSortDir>("desc");
  const [onlineMap, setOnlineMap] = useState<Record<string, OnlineStatus>>({});

  const loadMembers = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const params = new URLSearchParams({ scope, sortBy, sortDir });
      if (search.trim()) params.set("search", search.trim());
      const res = await fetch(`/api/staff/members?${params.toString()}`, {
        cache: "no-store",
      });

      const data = await res.json().catch(() => ({}));
      const rows = Array.isArray(data?.rows) ? data.rows : [];
      setMembers(rows);
      setAnalyticsAvailable(data?.meta?.analyticsAvailable === true);
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, [scope, search, sortBy, sortDir]);

  const fetchOnlineStatus = useCallback(async (memberList: MemberItem[]) => {
    const steamIds = memberList.map((m) => m.steamId).filter(Boolean) as string[];
    if (steamIds.length === 0) return;
    try {
      const res = await fetch(`/api/staff/lyg/online-status?steamIds=${steamIds.join(",")}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (json?.ok && json.data) setOnlineMap(json.data);
    } catch {
      // silently ignore
    }
  }, []);

  const scopeLabel = scope === "active"
    ? "actif"
    : scope === "reservists"
      ? "reserviste"
    : scope === "blacklisted"
      ? "blacklist"
    : scope === "demoted"
      ? "demote"
      : scope === "non_link"
        ? "non link"
      : "visible";

  // Members (playtime from DB) — rafraîchi toutes les 10s, léger
  useEffect(() => {
    const timeout = setTimeout(() => void loadMembers(), 180);
    const interval = setInterval(() => void loadMembers(), 10_000);
    return () => { clearTimeout(timeout); clearInterval(interval); };
  }, [loadMembers]);

  // Statuts LYG (API externe) — premier fetch dès que la liste est prête, puis toutes les 45s
  const onlineInitDone = useRef(false);
  useEffect(() => {
    if (members.length === 0) return;
    // Premier appel au chargement
    if (!onlineInitDone.current) {
      onlineInitDone.current = true;
      void fetchOnlineStatus(members);
    }
    // Cache server-side rafraîchi en continu → on peut polling tranquille toutes les 30s (lecture mémoire)
    const interval = setInterval(() => void fetchOnlineStatus(members), 30_000);
    return () => clearInterval(interval);
  }, [members, fetchOnlineStatus]);

  const summary = useMemo(() => {
    const activeCount = members.filter((member) => getMemberStatus(member) === "active").length;
    const reservistCount = members.filter((member) => getMemberStatus(member) === "reservist").length;
    const blacklistedCount = members.filter((member) => getMemberStatus(member) === "blacklisted").length;
    const demotedCount = members.filter((member) => getMemberStatus(member) === "demoted").length;
    const nonLinkCount = members.filter((member) => getMemberStatus(member) === "non_link").length;
    const avgPlaytime = members.length > 0
      ? Math.round(members.reduce((total, member) => total + (member.playtime7d ?? 0), 0) / members.length)
      : 0;
    const hasPreviousData = members.some((member) => typeof member.previousPlaytime7d === "number");

    return {
      total: members.length,
      activeCount,
      reservistCount,
      blacklistedCount,
      demotedCount,
      nonLinkCount,
      avgPlaytime,
      hasPreviousData,
    };
  }, [members]);

  const displayedMembers = useMemo(() => {
    let filtered = members.filter((member) =>
      matchesQuickFilter(member, quickFilter === "online" ? "all" : quickFilter, analyticsAvailable)
    );
    if (quickFilter === "online") {
      filtered = filtered.filter(
        (member) => member.steamId && Boolean(onlineMap[member.steamId]?.connected)
      );
    }
    return filtered;
  }, [members, quickFilter, analyticsAvailable, onlineMap]);

  const copyValue = useCallback(async (value: string, key: string) => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(value);
      } else if (typeof document !== "undefined") {
        const input = document.createElement("textarea");
        input.value = value;
        input.setAttribute("readonly", "");
        input.style.position = "absolute";
        input.style.left = "-9999px";
        document.body.appendChild(input);
        input.select();
        document.execCommand("copy");
        document.body.removeChild(input);
      }

      setCopiedKey(key);
      setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 1400);
    } catch {
      setCopiedKey(null);
    }
  }, []);

  if (loading) {
    return (
      <LoadingState
        title="Chargement des membres staff"
        description="Préparation de la vue consolidée des membres et de leur activité."
      />
    );
  }

  return (
    <div className="space-y-5">
      <SectionCard
        title="Effectif staff"
        description="Scopes métier, filtres rapides et synchronisation de la liste staff visible."
        actions={
          <div className="flex items-center gap-2">
            <MotionButtonFrame>
              <button
                onClick={() => void loadMembers(true)}
                disabled={refreshing}
                aria-label="Rafraîchir la liste"
                className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-white/[0.10] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {refreshing ? "..." : "↻ Actualiser"}
              </button>
            </MotionButtonFrame>
            <UiStatusBadge>{displayedMembers.length} / {members.length}</UiStatusBadge>
          </div>
        }
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Scopes metier: actifs, tous, reservistes, blacklist, demote, non link. Filtres rapides: activite uniquement.</p>
          </div>
          <div className="flex items-center gap-2">
            <div className="inline-flex items-center rounded-lg border border-white/10 bg-card/70 p-1.5">
              {SCOPE_OPTIONS.map((option) => {
                const selected = scope === option.value;
                return (
                  <button
                    key={option.value}
                    onClick={() => setScope(option.value)}
                    className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${selected
                      ? "bg-[#7a1f2b]/30 text-foreground shadow-[inset_0_0_0_1px_rgba(122,31,43,0.40)]"
                      : "text-foreground/70 hover:bg-white/8"
                      }`}
                    aria-pressed={selected}
                    aria-label={`Filtrer: ${option.label}`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
            <div className="rounded-lg border border-white/10 bg-card/70 px-3 py-1 text-xs font-medium text-foreground/70">
              {displayedMembers.length} / {members.length} membre{displayedMembers.length > 1 ? "s" : ""} {scopeLabel}{displayedMembers.length > 1 ? "s" : ""}
            </div>
          </div>
        </div>
      </SectionCard>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
        <div className="rounded-2xl border border-white/8 bg-[rgba(14,5,7,0.62)] px-4 py-3 shadow-[0_20px_60px_-30px_rgba(2,0,1,0.70)] backdrop-blur-sm">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground" htmlFor="members-search">
            Recherche
          </label>
          <input
            id="members-search"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="RP name, SteamID, Discord ID"
            className="mt-2 w-full rounded-lg border border-white/12 bg-card/70 px-3 py-2 text-sm text-foreground outline-none transition-all placeholder:text-muted-foreground focus:border-amber-500/50 focus:ring-2 focus:ring-amber-500/20 focus:bg-white/[0.06]"
          />
        </div>

        <div className="rounded-2xl border border-white/8 bg-[rgba(14,5,7,0.62)] px-4 py-3 shadow-[0_20px_60px_-30px_rgba(2,0,1,0.70)] backdrop-blur-sm">
          <label className="block text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground" htmlFor="members-sort-by">
            Tri
          </label>
          <div className="mt-2 flex items-center gap-2">
            <select
              id="members-sort-by"
              value={sortBy}
              onChange={(event) => setSortBy(event.target.value as MembersSortBy)}
              className="rounded-lg border border-white/10 bg-card/70 px-3 py-2 text-sm font-medium text-foreground outline-none"
            >
              <option value="grade">Grade</option>
              <option value="name">Nom</option>
              <option value="playtime7d">Playtime 7j</option>
              <option value="status">Statut</option>
            </select>
            <button
              type="button"
              onClick={() => setSortDir((current) => current === "asc" ? "desc" : "asc")}
              className={`rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${sortDir === "asc"
                ? "border-amber-500/45 bg-amber-500/12 text-amber-200"
                : "border-white/15 bg-white/6 text-foreground/70"
                }`}
              aria-label={sortDir === "asc" ? "Passer en ordre descendant" : "Passer en ordre croissant"}
            >
              {sortDir === "asc" ? "↑" : "↓"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            Actif: <span className="font-semibold text-foreground/80">{sortBy}</span> ({sortDir})
          </p>
        </div>

        <div className="rounded-2xl border border-white/8 bg-[rgba(14,5,7,0.62)] px-4 py-3 shadow-[0_20px_60px_-30px_rgba(2,0,1,0.70)] backdrop-blur-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Vue courante</p>
          <p className="mt-2 text-sm text-foreground/80">{summary.total} membres</p>
          <p className="mt-1 text-xs text-muted-foreground">Moyenne 7j: {formatPlaytime(summary.avgPlaytime)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Historique: {analyticsAvailable && summary.hasPreviousData ? "actif" : "limite"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
        {QUICK_FILTER_OPTIONS.map((option) => {
          const selected = quickFilter === option.value;
          const count = option.value === "all"
            ? members.length
            : option.value === "online"
            ? members.filter((m) => m.steamId && Boolean(onlineMap[m.steamId]?.connected)).length
            : option.value === "active"
            ? members.filter((m) => !isActivityExempt(m) && (getActivityBand(m.playtime7d).key === "active" || getActivityBand(m.playtime7d).key === "high")).length
            : option.value === "inactive"
            ? members.filter((m) => !isActivityExempt(m) && getActivityBand(m.playtime7d).key === "inactive").length
            : option.value === "low"
            ? members.filter((m) => !isActivityExempt(m) && getActivityBand(m.playtime7d).key === "low").length
            : option.value === "top"
            ? members.filter((m) => getActivityBand(m.playtime7d).key === "high").length
            : option.value === "watch"
            ? members.filter((m) => isWatchMember(m, analyticsAvailable)).length
            : 0;

          const styles = {
            default:  {
              card: selected ? "border-white/20 bg-white/[0.08] shadow-[0_4px_20px_-4px_rgba(255,255,255,0.06)]" : "border-white/6 bg-[rgba(14,5,7,0.5)] hover:border-white/12 hover:bg-white/[0.04]",
              count: selected ? "text-white" : "text-foreground/40",
              label: selected ? "text-foreground/80" : "text-foreground/35",
              bar: "bg-white/30",
            },
            green:    {
              card: selected ? "border-emerald-500/40 bg-emerald-500/[0.08] shadow-[0_4px_20px_-4px_rgba(52,211,153,0.2)]" : "border-white/6 bg-[rgba(14,5,7,0.5)] hover:border-emerald-500/20 hover:bg-emerald-500/[0.04]",
              count: selected ? "text-emerald-300" : "text-foreground/40",
              label: selected ? "text-emerald-200/70" : "text-foreground/35",
              bar: "bg-emerald-400/60",
            },
            emerald:  {
              card: selected ? "border-emerald-600/35 bg-emerald-600/[0.07] shadow-[0_4px_20px_-4px_rgba(52,211,153,0.15)]" : "border-white/6 bg-[rgba(14,5,7,0.5)] hover:border-emerald-600/18 hover:bg-emerald-600/[0.04]",
              count: selected ? "text-emerald-300" : "text-foreground/40",
              label: selected ? "text-emerald-200/70" : "text-foreground/35",
              bar: "bg-emerald-500/50",
            },
            rose:     {
              card: selected ? "border-rose-500/40 bg-rose-500/[0.08] shadow-[0_4px_20px_-4px_rgba(244,63,94,0.18)]" : "border-white/6 bg-[rgba(14,5,7,0.5)] hover:border-rose-500/20 hover:bg-rose-500/[0.04]",
              count: selected ? "text-rose-300" : "text-foreground/40",
              label: selected ? "text-rose-200/70" : "text-foreground/35",
              bar: "bg-rose-400/60",
            },
            amber:    {
              card: selected ? "border-amber-500/40 bg-amber-500/[0.07] shadow-[0_4px_20px_-4px_rgba(245,158,11,0.18)]" : "border-white/6 bg-[rgba(14,5,7,0.5)] hover:border-amber-500/20 hover:bg-amber-500/[0.04]",
              count: selected ? "text-amber-300" : "text-foreground/40",
              label: selected ? "text-amber-200/70" : "text-foreground/35",
              bar: "bg-amber-400/55",
            },
            cyan:     {
              card: selected ? "border-cyan-500/40 bg-cyan-500/[0.07] shadow-[0_4px_20px_-4px_rgba(6,182,212,0.18)]" : "border-white/6 bg-[rgba(14,5,7,0.5)] hover:border-cyan-500/20 hover:bg-cyan-500/[0.04]",
              count: selected ? "text-cyan-300" : "text-foreground/40",
              label: selected ? "text-cyan-200/70" : "text-foreground/35",
              bar: "bg-cyan-400/55",
            },
            orange:   {
              card: selected ? "border-orange-500/40 bg-orange-500/[0.07] shadow-[0_4px_20px_-4px_rgba(249,115,22,0.18)]" : "border-white/6 bg-[rgba(14,5,7,0.5)] hover:border-orange-500/20 hover:bg-orange-500/[0.04]",
              count: selected ? "text-orange-300" : "text-foreground/40",
              label: selected ? "text-orange-200/70" : "text-foreground/35",
              bar: "bg-orange-400/55",
            },
          }[option.color];

          return (
            <button
              key={option.value}
              type="button"
              onClick={() => setQuickFilter(option.value)}
              aria-pressed={selected}
              className={`group relative flex flex-col items-start overflow-hidden rounded-2xl border px-4 py-3 text-left transition-all duration-150 ${styles.card}`}
            >
              {/* accent bar top */}
              {selected && <div className={`absolute inset-x-0 top-0 h-[2px] ${styles.bar}`} />}
              <span className={`text-2xl font-bold tabular-nums leading-none transition-colors ${styles.count}`}>
                {count}
              </span>
              <span className={`mt-1.5 text-[11px] font-semibold transition-colors ${styles.label}`}>
                {option.label}
              </span>
            </button>
          );
        })}
      </div>

      {displayedMembers.length === 0 ? (
        <EmptyState
          title="Aucun membre visible"
          description={scope === "active" ? "Aucun membre actif ne correspond aux filtres courants." : "Aucun membre ne correspond aux filtres courants."}
        />
      ) : (
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {displayedMembers.map((member) => {
            const activity = getActivityBand(member.playtime7d);
            const exemptActivity = isActivityExempt(member);
            const isZeroPlaytime = (member.playtime7d ?? 0) === 0;
            const hasPrevious = analyticsAvailable && typeof member.previousPlaytime7d === "number";
            const online = member.steamId ? onlineMap[member.steamId] : undefined;
            const isConnected = Boolean(online?.connected);

            const playtimeToneClassName = exemptActivity
              ? "border-white/15 bg-white/[0.06] text-foreground/80"
              : isZeroPlaytime
              ? "border-rose-500/35 bg-rose-500/12 text-rose-100"
              : activity.key === "low"
                ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
                : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";

            return (
              <div
                key={member.id}
                className={[
                  "group relative flex flex-col overflow-hidden rounded-2xl border border-white/8 bg-[rgba(14,5,7,0.62)] shadow-[0_8px_32px_-8px_rgba(0,0,0,0.55)] backdrop-blur-sm min-h-[220px] transition-all duration-200 hover:border-white/15 hover:shadow-[0_16px_40px_-8px_rgba(122,31,43,0.30)] hover:-translate-y-0.5 cursor-pointer",
                  getMemberRowClassName(member, analyticsAvailable),
                ].filter(Boolean).join(" ")}
              >
                {/* Card top accent bar — green when connected */}
                <div className={`h-0.5 w-full ${isConnected ? "bg-emerald-500/70" : isZeroPlaytime && !exemptActivity ? "bg-rose-500/60" : activity.key === "low" && !exemptActivity ? "bg-amber-500/50" : "bg-gradient-to-r from-[#7a1f2b]/80 via-rose-700/40 to-transparent"}`} />

                <div className="flex flex-col gap-0 flex-1 p-4">
                  {/* Online status badge — first thing visible */}
                  {member.steamId && (
                    <div className={`mb-3 flex items-center gap-1.5 self-start rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                      online === undefined
                        ? "border-white/10 bg-white/[0.04] text-muted-foreground"
                        : isConnected
                        ? "border-emerald-500/40 bg-emerald-500/12 text-emerald-300"
                        : "border-white/10 bg-white/[0.04] text-foreground/40"
                    }`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${online === undefined ? "bg-white/20" : isConnected ? "bg-emerald-400 shadow-[0_0_5px_1px_rgba(52,211,153,0.5)]" : "bg-white/20"}`} />
                      {online === undefined ? "…" : isConnected ? "En jeu" : "Hors ligne"}
                    </div>
                  )}

                  {/* Avatar + name row */}
                  <div className="flex items-center gap-3 mb-3">
                    <div className="relative shrink-0">
                      <MemberAvatar member={member} size="lg" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-[15px] text-slate-50 leading-tight">{member.rpName ?? "—"}</p>
                      <p className="truncate text-xs text-slate-400 mt-0.5 leading-tight">{member.grade ?? "—"}</p>
                    </div>
                  </div>

                  {/* Status + absence */}
                  <div className="flex flex-wrap items-center gap-1.5 min-h-[22px]">
                    <MemberStatusBadge member={member} analyticsAvailable={analyticsAvailable} />
                    {member.rankLabel && (
                      <span className="rounded-full border border-white/12 bg-white/[0.05] px-2 py-0.5 text-[10px] font-medium text-foreground/60 truncate max-w-[120px]">
                        {member.rankLabel}
                      </span>
                    )}
                  </div>

                  {/* Absence banner */}
                  {member.activeAbsence && (
                    <div className={`mt-2.5 flex flex-wrap items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[10px] leading-tight ${
                      member.activeAbsence.upcoming
                        ? "border-blue-500/25 bg-blue-500/8 text-blue-200"
                        : "border-amber-500/25 bg-amber-500/8 text-amber-200"
                    }`}>
                      {member.activeAbsence.upcoming && <span className="font-bold text-blue-300">À venir ·</span>}
                      <span className="font-semibold">{getAbsenceTypeLabel(member.activeAbsence.type)}</span>
                      <span className="opacity-70">
                        · {member.activeAbsence.upcoming
                          ? `dès le ${new Date(member.activeAbsence.startAt).toLocaleDateString("fr-FR")}`
                          : `jusqu'au ${new Date(member.activeAbsence.endAt).toLocaleDateString("fr-FR")}`}
                      </span>
                    </div>
                  )}

                  {/* Spacer */}
                  <div className="flex-1" />

                  {/* Divider */}
                  <div className="mt-3 border-t border-white/6" />

                  {/* Playtime row */}
                  <div className="mt-3 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Playtime 7j</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      {hasPrevious && !exemptActivity && (
                        <span className={`text-[10px] font-semibold ${(member.playtimeDelta7d ?? 0) > 0 ? "text-emerald-400" : (member.playtimeDelta7d ?? 0) < 0 ? "text-rose-400" : "text-muted-foreground"}`}>
                          {formatPlaytimeDelta(member.playtimeDelta7d)}
                        </span>
                      )}
                      <span className={`rounded-md border px-2 py-0.5 text-xs font-semibold ${playtimeToneClassName}`}>
                        {formatPlaytime(member.playtime7d)}
                      </span>
                    </div>
                  </div>

                  {!exemptActivity && (
                    <div className="mt-1.5 flex justify-end">
                      <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${activity.badgeClassName}`}>
                        {activity.label}
                      </span>
                    </div>
                  )}
                </div>

              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function MemberAvatar({ member, size = "md" }: { member: MemberItem; size?: "md" | "lg" }) {
  const [imgFailed, setImgFailed] = useState(false);
  const avatarUrl = getDiscordAvatarUrl(member.discordId, member.discordAvatarHash);
  const fallback = (member.rpName ?? "?").trim().charAt(0).toUpperCase() || "?";
  const sizeClass = size === "lg" ? "h-12 w-12 text-base" : "h-10 w-10 text-sm";

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={member.rpName ?? "Avatar Discord"}
        className={`${sizeClass} shrink-0 rounded-full border border-white/10 object-cover`}
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full border border-white/10 bg-card/80 font-semibold text-foreground/80`}>
      {fallback}
    </div>
  );
}

function MemberStatusBadge({ member, analyticsAvailable }: { member: MemberItem; analyticsAvailable: boolean }) {
  const status = getMemberStatus(member);

  if (status === "blacklisted") {
    return (
      <UiStatusBadge>Blacklist</UiStatusBadge>
    );
  }

  if (status === "demoted") {
    return (
      <UiStatusBadge tone="danger">Demote</UiStatusBadge>
    );
  }

  if (status === "reservist") {
    return (
      <UiStatusBadge>Réserviste</UiStatusBadge>
    );
  }

  if (status === "non_link") {
    return (
      <UiStatusBadge tone="warning">Non link</UiStatusBadge>
    );
  }

  if (isWatchMember(member, analyticsAvailable)) {
    return (
      <UiStatusBadge tone="warning">A surveiller</UiStatusBadge>
    );
  }
  return null;
}

