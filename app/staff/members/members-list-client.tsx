"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import type { StaffMemberDto } from "@/types/staff";
import { formatPlaytime } from "@/lib/formatPlaytime";
import { getDiscordAvatarUrl } from "@/lib/discord/getDiscordAvatarUrl";
import { DataTile } from "@/components/staff/ui/DataTile";
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

const QUICK_FILTER_OPTIONS: Array<{ value: QuickFilter; label: string }> = [
  { value: "all", label: "Tout" },
  { value: "inactive", label: "Inactifs" },
  { value: "low", label: "Faible activite" },
  { value: "top", label: "Top actifs" },
  { value: "watch", label: "A surveiller" },
];

export default function MembersListClient() {
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [analyticsAvailable, setAnalyticsAvailable] = useState(false);
  const [scope, setScope] = useState<MembersScope>("active");
  const [quickFilter, setQuickFilter] = useState<QuickFilter>("all");
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<MembersSortBy>("grade");
  const [sortDir, setSortDir] = useState<MembersSortDir>("desc");

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

  useEffect(() => {
    const timeout = setTimeout(() => {
      void loadMembers();
    }, 180);
    const interval = setInterval(() => {
      void loadMembers();
    }, 30000);
    return () => {
      clearTimeout(timeout);
      clearInterval(interval);
    };
  }, [loadMembers]);

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

  const displayedMembers = useMemo(
    () => members.filter((member) => matchesQuickFilter(member, quickFilter, analyticsAvailable)),
    [members, quickFilter, analyticsAvailable],
  );

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

      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
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
            className="mt-2 w-full rounded-lg border border-white/10 bg-card/70 px-3 py-2 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-amber-500/40"
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

      <div className="rounded-2xl border border-white/8 bg-[rgba(14,5,7,0.62)] px-4 py-3 shadow-[0_20px_60px_-30px_rgba(2,0,1,0.70)] backdrop-blur-sm">
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Filtres rapides</p>
        <div className="mt-2.5 flex flex-wrap gap-2.5">
          {QUICK_FILTER_OPTIONS.map((option) => {
            const selected = quickFilter === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => setQuickFilter(option.value)}
                aria-pressed={selected}
                className={`rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ${selected
                  ? "border-[#7a1f2b]/55 bg-[#7a1f2b]/18 text-rose-100"
                  : "border-white/10 bg-white/4 text-foreground/70 hover:bg-white/8"
                  }`}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-5">
        <SummaryCard label="Actifs" value={summary.activeCount} tone="success" />
        <SummaryCard label="Réservistes" value={summary.reservistCount} tone="default" />
        <SummaryCard label="Blacklist" value={summary.blacklistedCount} tone="default" />
        <SummaryCard label="Demote" value={summary.demotedCount} tone="danger" />
        <SummaryCard label="Non link" value={summary.nonLinkCount} tone="warning" />
      </div>

      {displayedMembers.length === 0 ? (
        <EmptyState
          title="Aucun membre visible"
          description={scope === "active" ? "Aucun membre actif ne correspond aux filtres courants." : "Aucun membre ne correspond aux filtres courants."}
        />
      ) : (
      <div className="overflow-x-auto rounded-2xl border border-white/8 bg-[rgba(14,5,7,0.58)] shadow-[0_25px_70px_-40px_rgba(2,0,1,0.75)] backdrop-blur-sm">
        <table className="w-full min-w-[1480px] table-auto text-sm">
          <thead>
            <tr className="border-b border-white/8 bg-card/80 text-left text-xs uppercase tracking-[0.08em] text-muted-foreground">
              <th className="w-[30%] px-6 py-4 align-middle font-semibold">Membre</th>
              <th className="w-[22%] px-6 py-4 align-middle font-semibold">SteamID</th>
              <th className="w-[12%] px-6 py-4 align-middle font-semibold">Grade</th>
              <th className="w-[12%] px-6 py-4 align-middle font-semibold">Statut</th>
              <th className="w-[14%] px-6 py-4 align-middle text-right font-semibold">Playtime 7j</th>
            </tr>
          </thead>

          <tbody>
            {displayedMembers.map((member) => {
                const activity = getActivityBand(member.playtime7d);
                const exemptActivity = isActivityExempt(member);
                const isZeroPlaytime = (member.playtime7d ?? 0) === 0;
                const steamCopyKey = `steam-${member.id}`;
                const discordCopyKey = `discord-${member.id}`;
                const hasPrevious = analyticsAvailable && typeof member.previousPlaytime7d === "number";
                const playtimeToneClassName = exemptActivity
                  ? "border-white/15 bg-white/[0.06] text-foreground/80"
                  : isZeroPlaytime
                  ? "border-rose-500/35 bg-rose-500/12 text-rose-100"
                  : activity.key === "low"
                    ? "border-amber-500/35 bg-amber-500/10 text-amber-100"
                    : "border-emerald-500/30 bg-emerald-500/10 text-emerald-100";

                return (
                <tr
                  key={member.id}
                  className={[
                    "border-b border-white/6 text-foreground transition-colors hover:bg-white/[0.04] hover:ring-1 hover:ring-inset hover:ring-white/10 last:border-b-0",
                    getMemberRowClassName(member, analyticsAvailable),
                    isZeroPlaytime && !exemptActivity ? "ring-1 ring-inset ring-white/6" : "",
                  ].filter(Boolean).join(" ")}
                >
                  <td className="px-6 py-4 align-middle">
                    <div className="flex items-center gap-3 min-w-0">
                      <MemberAvatar member={member} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-medium text-foreground">{member.rpName ?? "-"}</p>
                        </div>
                        {member.activeAbsence ? (
                          <div className={`mt-1.5 inline-flex max-w-full flex-wrap items-center gap-1 rounded-md border px-2 py-1 text-[11px] ${
                            member.activeAbsence.upcoming
                              ? "border-blue-500/30 bg-blue-500/8 text-blue-100"
                              : "border-amber-500/30 bg-amber-500/8 text-amber-100"
                          }`}>
                            {member.activeAbsence.upcoming && (
                              <span className="font-semibold text-blue-300">À venir •</span>
                            )}
                            <span className="font-semibold">{getAbsenceTypeLabel(member.activeAbsence.type)}</span>
                            <span className={member.activeAbsence.upcoming ? "text-blue-200/70" : "text-amber-200/70"}>
                              • {member.activeAbsence.upcoming
                                ? `dès le ${new Date(member.activeAbsence.startAt).toLocaleDateString("fr-FR")}`
                                : `jusqu'au ${new Date(member.activeAbsence.endAt).toLocaleDateString("fr-FR")}`}
                            </span>
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 align-middle font-mono text-xs text-foreground/70 whitespace-nowrap">
                    <div>{member.steamId ?? "-"}</div>
                    <div className="mt-2.5 flex flex-wrap gap-2 font-sans text-[11px]">
                      {member.steamId ? (
                        <button
                          type="button"
                          onClick={() => void copyValue(member.steamId!, steamCopyKey)}
                          title="Copier SteamID"
                          className={`rounded-md border px-2.5 py-1 font-semibold transition-colors ${copiedKey === steamCopyKey
                            ? "border-emerald-500/50 bg-emerald-500/18 text-emerald-100"
                            : "border-white/10 bg-card/70 text-foreground/70 hover:bg-card/90"
                            }`}
                        >
                          {copiedKey === steamCopyKey ? "SteamID copie" : "Copier SteamID"}
                        </button>
                      ) : null}
                      {member.discordId ? (
                        <button
                          type="button"
                          onClick={() => void copyValue(member.discordId!, discordCopyKey)}
                          title="Copier Discord ID"
                          className={`rounded-md border px-2.5 py-1 font-semibold transition-colors ${copiedKey === discordCopyKey
                            ? "border-amber-500/45 bg-amber-500/12 text-amber-100"
                            : "border-white/10 bg-white/5 text-foreground/70 hover:bg-white/10"
                            }`}
                        >
                          {copiedKey === discordCopyKey ? "Discord ID copie" : "Copier Discord ID"}
                        </button>
                      ) : null}
                    </div>
                  </td>
                  <td className="px-6 py-4 align-middle truncate text-foreground/80">{member.grade ?? "-"}</td>
                  <td className="px-6 py-4 align-middle">
                    <MemberStatusBadge member={member} analyticsAvailable={analyticsAvailable} />
                  </td>
                  <td className="px-6 py-4 align-middle whitespace-nowrap text-right">
                    <div className="flex justify-end">
                      <span className={`rounded-md border px-2.5 py-1 text-sm font-semibold ${playtimeToneClassName}`}>
                        {formatPlaytime(member.playtime7d)}
                      </span>
                    </div>
                    {!exemptActivity ? (
                      <div className="mt-1.5 flex justify-end">
                        <span className={`rounded-full border px-2 py-0.5 text-[11px] font-semibold ${activity.badgeClassName}`}>
                          {activity.label}
                        </span>
                      </div>
                    ) : null}
                    {hasPrevious && !exemptActivity ? (
                      <div className={`mt-1.5 text-xs ${(member.playtimeDelta7d ?? 0) > 0 ? "text-emerald-300" : (member.playtimeDelta7d ?? 0) < 0 ? "text-rose-300" : "text-muted-foreground"}`}>
                        {formatPlaytimeDelta(member.playtimeDelta7d)}
                      </div>
                    ) : null}
                  </td>
                </tr>
              )})}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function MemberAvatar({ member }: { member: MemberItem }) {
  const [imgFailed, setImgFailed] = useState(false);
  const avatarUrl = getDiscordAvatarUrl(member.discordId, member.discordAvatarHash);
  const fallback = (member.rpName ?? "?").trim().charAt(0).toUpperCase() || "?";

  if (avatarUrl && !imgFailed) {
    return (
      <img
        src={avatarUrl}
        alt={member.rpName ?? "Avatar Discord"}
        className="h-10 w-10 shrink-0 rounded-full border border-white/10 object-cover"
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setImgFailed(true)}
      />
    );
  }

  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-card/80 text-sm font-semibold text-foreground/80">
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

function SummaryCard({ label, value, tone }: { label: string; value: number | string; tone: "default" | "success" | "warning" | "danger" }) {
  return (
    <DataTile label={label} value={value} tone={tone} />
  );
}
