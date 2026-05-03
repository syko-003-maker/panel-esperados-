"use client";

import { useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Search, DollarSign, AlertCircle, Users, BadgeEuro } from "lucide-react";
import { EmptyState } from "@/components/staff/ui/EmptyState";
import { StyledSelect } from "@/components/staff/ui/StyledSelect";
import { MotionListItem } from "@/components/staff/ui/motion";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";

type MemberRow = {
  steamId: string;
  rpName: string | null;
  deposit: number;
  withdraw: number;
  net: number;
  avatarUrl?: string | null;
};

type MiniListRow = {
  steamId: string;
  rpName: string | null;
  amount: number;
  tag?: "debt" | "ok" | null;
  avatarUrl?: string | null;
};

type DebtorRow = {
  steamId: string;
  rpName: string | null;
  debt: number;
  avatarUrl?: string | null;
};

export type StatsClientProps = {
  kpis: {
    totalDeposit: number;
    totalWithdraw: number;
    net: number;
    deficitMembers: number;
    deficitTotal: number;
    activeMembers: number;
    linkedRatio?: string;
  };
  rows: MemberRow[];
  topDeposits: MiniListRow[];
  topWithdraws: MiniListRow[];
  topNet: MiniListRow[];
  globalDebtors: DebtorRow[];
  maxDebt: number;
};

function formatMoney(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function Avatar({ url, name }: { url?: string | null; name?: string | null }) {
  const [failed, setFailed] = useState(false);
  const initials = (name ?? "?").slice(0, 1).toUpperCase();

  if (url && !failed) {
    return (
      <img
        src={url}
        alt={name ?? ""}
        className="h-6 w-6 rounded-full object-cover shrink-0 ring-1 ring-white/10"
        onError={() => setFailed(true)}
      />
    );
  }

  return (
    <span className="flex h-6 w-6 items-center justify-center rounded-full bg-white/10 text-[10px] font-bold text-slate-400 shrink-0 ring-1 ring-white/10">
      {initials}
    </span>
  );
}

function getNetColor(net: number): string {
  if (net < 0) return "text-red-300";
  if (net > 0) return "text-emerald-300";
  return "text-slate-300";
}

function getNetBgColor(net: number): string {
  if (net < 0) return "bg-red-500/10";
  if (net > 0) return "bg-emerald-500/10";
  return "bg-white/5";
}

export default function StatsClient(props: StatsClientProps) {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4 items-stretch">
        <RankedMiniList title="Top entrants" icon={TrendingUp} rows={props.topDeposits} color="text-emerald-300" />
        <RankedMiniList title="Top sortants" icon={TrendingDown} rows={props.topWithdraws} color="text-blue-300" />
        <RankedMiniList title="Top positif" icon={DollarSign} rows={props.topNet} color="text-green-300" />
        <DebtorsGlobalSection debtors={props.globalDebtors} maxDebt={props.maxDebt} />
      </div>

      <MembersTableClient members={props.rows} />
    </div>
  );
}

function MembersTableClient({ members }: { members: MemberRow[] }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"net" | "deposit" | "withdraw">("net");

  const sorted = [...members]
    .sort((a, b) => {
      if (sortBy === "deposit") return b.deposit - a.deposit;
      if (sortBy === "withdraw") return b.withdraw - a.withdraw;
      return a.net - b.net;
    })
    .filter((member) => {
      const term = searchTerm.toLowerCase();
      return (member.rpName?.toLowerCase().includes(term) ?? false) || member.steamId.includes(term);
    });

  return (
    <SectionCard
      title="Classement consolidé"
      description="Classement temps réel des membres actifs sur les flux banque agrégés."
      icon={Users}
    >
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            type="text"
            placeholder="Rechercher par nom ou steamId..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            className="w-full rounded-xl border border-white/10 bg-card/70 py-2.5 pl-10 pr-4 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none"
          />
        </div>

        <StyledSelect
          value={sortBy}
          onChange={(event) => setSortBy(event.target.value as "net" | "deposit" | "withdraw")}
          className="w-auto min-w-[140px]"
        >
          <option value="net">Trier: Net</option>
          <option value="deposit">Trier: Dépôts</option>
          <option value="withdraw">Trier: Retraits</option>
        </StyledSelect>
      </div>

      {sorted.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<AlertCircle className="h-12 w-12" />}
            title="Aucun résultat"
            description="Aucun membre ne correspond à la recherche ou au tri courant."
          />
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-2xl border border-white/8 bg-white/[0.03]">
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="border-b border-white/8 text-left text-[11px] uppercase tracking-[0.16em] text-slate-500">
                <th className="px-4 py-3 font-semibold">Membre</th>
                <th className="px-4 py-3 font-semibold">Steam ID</th>
                <th className="px-4 py-3 text-right font-semibold">Dépôts</th>
                <th className="px-4 py-3 text-right font-semibold">Retraits</th>
                <th className="px-4 py-3 text-right font-semibold">Net consolidé</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((member) => (
                <tr key={member.steamId} className="border-b border-white/6 last:border-b-0 hover:bg-white/[0.04]">
                  <td className="px-4 py-3">
                    <Link href={`/staff/banklogs?steamId=${member.steamId}`} className="flex items-center gap-2 text-slate-100 transition-colors hover:text-amber-200">
                      <Avatar url={member.avatarUrl} name={member.rpName} />
                      <span className="truncate font-semibold">{member.rpName ?? "Non lié"}</span>
                      {member.net < 0 ? <StatusBadge tone="danger">Débiteur</StatusBadge> : null}
                    </Link>
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{member.steamId}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-100 tabular-nums">{formatMoney(member.deposit)}</td>
                  <td className="px-4 py-3 text-right font-medium text-slate-100 tabular-nums">{formatMoney(member.withdraw)}</td>
                  <td className="px-4 py-3 text-right">
                    <span className={`${getNetColor(member.net)} ${getNetBgColor(member.net)} inline-flex rounded-lg px-2.5 py-1 font-bold tabular-nums`}>
                      {formatMoney(member.net)}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function DebtorsGlobalSection({ debtors, maxDebt }: { debtors: DebtorRow[]; maxDebt: number }) {
  return (
    <SectionCard
      title="Débiteurs"
      icon={AlertCircle}
      className="h-full"
    >
      {debtors.length === 0 ? (
        <EmptyState
          icon={<BadgeEuro className="h-12 w-12" />}
          title="Aucun débiteur"
          description="Aucun membre actif n'est actuellement identifié en déficit."
        />
      ) : (
        <ul className="space-y-2">
          {debtors.map((debtor, index) => {
            const debtPercent = maxDebt > 0 ? Math.round((debtor.debt / maxDebt) * 100) : 0;
            return (
              <MotionListItem key={debtor.steamId} delay={index * 0.015}>
                <Link
                  href={`/staff/banklogs?steamId=${debtor.steamId}`}
                  className="relative flex items-center justify-between gap-3 overflow-hidden rounded-xl border border-red-500/15 bg-red-500/[0.08] px-3 py-2 text-sm transition-colors hover:border-red-500/25 hover:bg-red-500/[0.12]"
                >
                  <div className="absolute inset-y-0 right-0 bg-red-500/10" style={{ width: `${debtPercent}%` }} />
                  <div className="relative flex items-center gap-2 min-w-0 flex-1">
                    <Avatar url={debtor.avatarUrl} name={debtor.rpName} />
                    <p className="truncate font-medium text-slate-100">{debtor.rpName ?? "Non lié"}</p>
                  </div>
                  <p className="relative shrink-0 font-bold text-red-300 tabular-nums">{formatMoney(debtor.debt)}</p>
                </Link>
              </MotionListItem>
            );
          })}
        </ul>
      )}
    </SectionCard>
  );
}

function RankedMiniList({
  title,
  icon: Icon,
  rows,
  color,
}: {
  title: string;
  icon: React.ComponentType<{ className?: string }>;
  rows: MiniListRow[];
  color: string;
}) {
  return (
    <SectionCard title={title} icon={Icon} actions={<StatusBadge>Top 15</StatusBadge>} className="h-full">
      {rows.length === 0 ? (
        <EmptyState
          icon={<AlertCircle className="h-12 w-12" />}
          title="Aucune donnée"
          description="Cette liste ne contient encore aucune donnée exploitable."
        />
      ) : (
        <ul className="space-y-3">
          {rows.map((row, index) => (
            <MotionListItem key={row.steamId} delay={index * 0.015}>
              <Link
                href={`/staff/banklogs?steamId=${row.steamId}`}
                className="flex items-center justify-between gap-3 rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3 transition-colors hover:border-white/15 hover:bg-white/[0.05]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Avatar url={row.avatarUrl} name={row.rpName} />
                  <span className="truncate text-sm font-semibold text-slate-100">{row.rpName ?? "Non lié"}</span>
                </div>
                <span className={`text-sm font-bold tabular-nums shrink-0 ${color}`}>{formatMoney(row.amount)}</span>
              </Link>
            </MotionListItem>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

