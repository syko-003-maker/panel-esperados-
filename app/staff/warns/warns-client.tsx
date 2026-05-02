"use client";

import { useEffect, useState, useCallback } from "react";
import { getDiscordAvatarUrl } from "@/lib/discord/getDiscordAvatarUrl";
import { LoadingState } from "@/components/staff/ui/LoadingState";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { MotionButtonFrame } from "@/components/staff/ui/motion";
import { Users, AlertTriangle, Clock, BarChart3, type LucideIcon } from "lucide-react";

type WarnEntry = {
  reason: string;
  type: string;
  date: string;
  expired: boolean;
};

type MemberWarnSummary = {
  memberId: string;
  discordId: string | null;
  rpName: string | null;
  grade: string | null;
  steamId: string;
  totalWarns: number;
  activeWarns: number;
  lastWarnDate: string | null;
  lastWarnReason: string | null;
  lastWarnType: string | null;
  recentWarns: WarnEntry[];
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function WarnTypeBadge({ type }: { type: string }) {
  const t = type.toLowerCase();
  const cls = t.includes("ban")
    ? "border-rose-500/40 bg-rose-500/12 text-rose-200"
    : t.includes("kick")
    ? "border-orange-500/40 bg-orange-500/12 text-orange-200"
    : "border-amber-500/40 bg-amber-500/12 text-amber-200";
  return (
    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {type}
    </span>
  );
}

function MemberAvatar({ discordId, rpName }: { discordId: string | null; rpName: string | null }) {
  const [failed, setFailed] = useState(false);
  const url = getDiscordAvatarUrl(discordId, null);
  const fallback = (rpName ?? "?").trim().charAt(0).toUpperCase();
  if (url && !failed) {
    return (
      <img src={url} alt={rpName ?? ""} onError={() => setFailed(true)}
        className="h-10 w-10 shrink-0 rounded-full border border-white/10 object-cover" loading="lazy" referrerPolicy="no-referrer" />
    );
  }
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-white/10 bg-card/80 text-sm font-semibold text-foreground/80">
      {fallback}
    </div>
  );
}

export default function WarnsClient() {
  const [members, setMembers] = useState<MemberWarnSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async (manual = false) => {
    if (manual) setRefreshing(true);
    try {
      const res = await fetch("/api/staff/lyg/warns-summary", { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (json?.ok) setMembers(json.data ?? []);
    } finally {
      setLoading(false);
      if (manual) setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return <LoadingState title="Chargement des warns" description="Lecture depuis la base de données…" />;
  }

  const activeOnlyMembers = members.filter((m) => m.activeWarns > 0);
  const expiredOnlyMembers = members.filter((m) => m.activeWarns === 0 && m.totalWarns > 0);

  return (
    <div className="space-y-5">
      {/* Stats bar */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Membres avec warns" value={members.length}                                     color="amber"   icon={Users} />
        <StatCard label="Warns actifs"        value={activeOnlyMembers.length}                         color="rose"    icon={AlertTriangle} />
        <StatCard label="Warns expirés"       value={expiredOnlyMembers.length}                        color="slate"   icon={Clock} />
        <StatCard label="Total warns"         value={members.reduce((s, m) => s + m.totalWarns, 0)}   color="default" icon={BarChart3} />
      </div>

      <SectionCard
        title={`Membres sanctionnés (${members.length})`}
        description="Membres du staff ayant reçu au moins un warn in-game, triés par warn le plus récent."
        actions={
          <MotionButtonFrame>
            <button onClick={() => void load(true)} disabled={refreshing}
              className="rounded-lg border border-white/10 bg-white/[0.06] px-3 py-1.5 text-xs text-foreground/70 transition-colors hover:bg-white/[0.10] disabled:opacity-50">
              {refreshing ? "..." : "↻ Actualiser"}
            </button>
          </MotionButtonFrame>
        }
      >
        {members.length === 0 ? (
          <EmptyState title="Aucun warn trouvé" description="Aucun membre actif n'a reçu de sanction in-game récemment." />
        ) : (
          <div className="space-y-2">
            {members.map((member) => {
              const isOpen = expanded === member.memberId;
              const hasActive = member.activeWarns > 0;
              return (
                <div key={member.memberId}
                  className={`rounded-xl border transition-colors ${hasActive ? "border-amber-500/25 bg-amber-500/[0.04]" : "border-white/8 bg-white/[0.02]"}`}>
                  {/* Header row */}
                  <button
                    type="button"
                    onClick={() => setExpanded(isOpen ? null : member.memberId)}
                    className="flex w-full items-center gap-3 px-4 py-3 text-left"
                  >
                    <MemberAvatar discordId={member.discordId} rpName={member.rpName} />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-sm text-foreground">{member.rpName ?? "—"}</span>
                        {member.grade && (
                          <span className="rounded-full border border-white/12 bg-white/[0.07] px-2 py-0.5 text-[10px] font-medium text-slate-300">
                            {member.grade}
                          </span>
                        )}
                        {hasActive && (
                          <span className="rounded-full border border-rose-500/40 bg-rose-500/12 px-2 py-0.5 text-[10px] font-bold text-rose-300">
                            {member.activeWarns} actif{member.activeWarns > 1 ? "s" : ""}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span>{member.totalWarns} warn{member.totalWarns > 1 ? "s" : ""} total</span>
                        {member.lastWarnDate && (
                          <>
                            <span>·</span>
                            <span>Dernier : {fmtDate(member.lastWarnDate)}</span>
                          </>
                        )}
                        {member.lastWarnReason && (
                          <>
                            <span>·</span>
                            <span className="truncate max-w-[200px]">{member.lastWarnReason}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {member.lastWarnType && <WarnTypeBadge type={member.lastWarnType} />}
                      <span className="text-muted-foreground text-xs">{isOpen ? "▲" : "▼"}</span>
                    </div>
                  </button>

                  {/* Expanded warns detail */}
                  {isOpen && (
                    <div className="border-t border-white/8 px-4 pb-4 pt-3">
                      <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                        10 derniers warns
                      </p>
                      <div className="space-y-2">
                        {member.recentWarns.map((warn, i) => (
                          <div key={i}
                            className={`flex flex-wrap items-start gap-2 rounded-lg border px-3 py-2 text-sm ${warn.expired ? "border-white/6 bg-white/[0.02] opacity-60" : "border-amber-500/20 bg-amber-500/[0.06]"}`}>
                            <WarnTypeBadge type={warn.type} />
                            <span className={`flex-1 ${warn.expired ? "text-muted-foreground" : "text-foreground"}`}>
                              {warn.reason}
                            </span>
                            <span className="shrink-0 text-xs text-muted-foreground">{fmtDate(warn.date)}</span>
                            {warn.expired && (
                              <StatusBadge>Expiré</StatusBadge>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>
    </div>
  );
}

const STAT_V = {
  amber:   { num: "text-amber-300",  ring: "border-amber-500/25 bg-amber-500/10",  ic: "text-amber-300"  },
  rose:    { num: "text-rose-300",   ring: "border-rose-500/25 bg-rose-500/10",    ic: "text-rose-300"   },
  slate:   { num: "text-slate-300",  ring: "border-white/10 bg-white/[0.05]",      ic: "text-slate-400"  },
  default: { num: "text-slate-400",  ring: "border-white/8 bg-white/[0.03]",       ic: "text-slate-500"  },
} as const;

function StatCard({ label, value, color, icon: Icon }: { label: string; value: number; color: keyof typeof STAT_V; icon?: LucideIcon }) {
  const v = STAT_V[color];
  return (
    <div className="rounded-2xl border border-white/8 bg-[rgba(14,5,7,0.62)] px-4 py-3 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.5)]">
      <div className="flex items-center justify-between gap-2 mb-1">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        {Icon && (
          <div className={`flex h-7 w-7 items-center justify-center rounded-lg border ${v.ring}`}>
            <Icon className={`h-3.5 w-3.5 ${v.ic}`} />
          </div>
        )}
      </div>
      <p className={`text-2xl font-bold ${v.num}`}>{value}</p>
    </div>
  );
}
