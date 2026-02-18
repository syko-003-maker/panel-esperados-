"use client";

import { useState } from "react";
import Link from "next/link";
import { TrendingUp, TrendingDown, Search, DollarSign, AlertCircle } from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

type MemberRow = {
  steamId: string;
  rpName: string | null;
  deposit: number;
  withdraw: number;
  net: number;
};

type MiniListRow = {
  steamId: string;
  rpName: string | null;
  amount: number;
  tag?: "debt" | "ok" | null;
};

type DebtorRow = {
  steamId: string;
  rpName: string | null;
  debt: number;
};

export type StatsClientProps = {
  days: number;
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

// ============================================================================
// UTILITIES
// ============================================================================

function formatMoney(value: number): string {
  return value.toLocaleString("fr-BE");
}

function getNetColor(net: number): string {
  if (net < 0) return "text-red-400";
  if (net > 0) return "text-emerald-400";
  return "text-white/70";
}

function getNetBgColor(net: number): string {
  if (net < 0) return "bg-red-500/10";
  if (net > 0) return "bg-emerald-500/10";
  return "bg-white/5";
}

// ============================================================================
// CLIENT COMPONENT
// ============================================================================

export default function StatsClient(props: StatsClientProps) {
  return (
    <div className="space-y-8">
      {/* 4-COLUMN GRID: Top lists */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 mb-4">
        {/* Top Deposits */}
        <RankedMiniList
          title="Top entrants"
          icon={TrendingUp}
          rows={props.topDeposits}
          color="text-emerald-300"
        />

        {/* Top Withdrawals */}
        <RankedMiniList
          title="Top sortants"
          icon={TrendingDown}
          rows={props.topWithdraws}
          color="text-blue-300"
        />

        {/* Top Net */}
        <RankedMiniList
          title="Top positif"
          icon={DollarSign}
          rows={props.topNet}
          color="text-green-300"
        />

        {/* Global Debtors */}
        <DebtorsGlobalSection
          debtors={props.globalDebtors}
          maxDebt={props.maxDebt}
        />
      </div>

      {/* Members Table with Debtor Badge */}
      <div>
        <MembersTableClient members={props.rows} />
      </div>
    </div>
  );
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

/**
 * Members Table Client Component - avec search et sort + badge débateurs discret
 */
function MembersTableClient({ 
  members
}: { 
  members: MemberRow[];
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [sortBy, setSortBy] = useState<"net" | "deposit" | "withdraw">("net");

  const sorted = [...members]
    .sort((a, b) => {
      if (sortBy === "deposit") return b.deposit - a.deposit;
      if (sortBy === "withdraw") return b.withdraw - a.withdraw;
      return a.net - b.net; // net asc = négatifs en premier
    })
    .filter((m) => {
      const term = searchTerm.toLowerCase();
      return (
        (m.rpName?.toLowerCase().includes(term) ?? false) ||
        m.steamId.includes(term)
      );
    });

  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-white/8 to-white/3 border border-white/10 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.8)] backdrop-blur">
      <div className="absolute inset-0 bg-gradient-to-br from-white/6 via-transparent to-transparent opacity-60 pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <div className="border-b border-white/5 p-6">
          <h3 className="text-lg font-bold text-white/95 mb-4">
            Classement (période sélectionnée)
          </h3>

          {/* Search + Sort */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
              <input
                type="text"
                placeholder="Rechercher par nom ou steamId..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg pl-10 pr-4 py-2 text-sm text-white placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/20"
              />
            </div>
            <select
              value={sortBy}
              onChange={(e) =>
                setSortBy(e.target.value as "net" | "deposit" | "withdraw")
              }
              className="bg-white/5 border border-white/10 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-white/20"
            >
              <option value="net" className="bg-slate-900">
                Trier: Net
              </option>
              <option value="deposit" className="bg-slate-900">
                Trier: Dépôts
              </option>
              <option value="withdraw" className="bg-slate-900">
                Trier: Retraits
              </option>
            </select>
          </div>
        </div>

        {/* Table */}
        {sorted.length === 0 ? (
          <div className="p-8 text-center">
            <p className="text-sm text-white/50">Aucun résultat</p>
          </div>
        ) : (
          <>
            {/* Column Headers */}
            <div className="hidden sm:grid grid-cols-12 gap-3 px-6 py-3 text-xs font-semibold text-white/50 uppercase tracking-wide border-b border-white/5 bg-white/2">
              <div className="col-span-4">Membre</div>
              <div className="col-span-2 text-right">Dépôts</div>
              <div className="col-span-2 text-right">Retraits</div>
              <div className="col-span-4 text-right">Net période</div>
            </div>

            {/* Rows */}
            <div className="divide-y divide-white/5">
              {sorted.map((member) => (
                  <Link
                    key={member.steamId}
                    href={`/staff/banklogs?steamId=${member.steamId}`}
                    className="block hover:bg-white/5 transition-colors"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 px-6 py-3">
                      {/* Member name */}
                      <div className="sm:col-span-4 flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-white/90">
                            {member.rpName ?? "Non lié"}
                          </span>
                        </div>
                        {!member.rpName && (
                          <span className="text-xs text-white/50">
                            {member.steamId}
                          </span>
                        )}
                      </div>

                    {/* Deposits */}
                    <div className="col-span-1 sm:col-span-2 flex flex-row sm:flex-col sm:text-right">
                      <span className="text-xs text-white/50 sm:hidden">
                        Dépôts:
                      </span>
                      <span className="text-white/90 font-medium tabular-nums">
                        {formatMoney(member.deposit)}$
                      </span>
                    </div>

                    {/* Withdrawals */}
                    <div className="col-span-1 sm:col-span-2 flex flex-row sm:flex-col sm:text-right">
                      <span className="text-xs text-white/50 sm:hidden">
                        Retraits:
                      </span>
                      <span className="text-white/90 font-medium tabular-nums">
                        {formatMoney(member.withdraw)}$
                      </span>
                    </div>

                    {/* Net */}
                    <div className="sm:col-span-4 flex flex-row sm:flex-col sm:text-right">
                      <span className="text-xs text-white/50 sm:hidden">
                        Net:
                      </span>
                      <span
                        className={`font-bold tabular-nums rounded px-2 py-1 sm:px-0 sm:py-0 ${getNetColor(
                          member.net
                        )} ${getNetBgColor(member.net)}`}
                      >
                        {formatMoney(member.net)}$
                      </span>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * Global Debtors Section
 */
function DebtorsGlobalSection({
  debtors,
  maxDebt,
}: {
  debtors: DebtorRow[];
  maxDebt: number;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-white/8 to-white/3 border border-white/10 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.8)] backdrop-blur">
      <div className="absolute inset-0 bg-gradient-to-br from-white/6 via-transparent to-transparent opacity-60 pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <div className="border-b border-white/5 px-6 py-4">
          <h3 className="text-base font-bold text-white/95">Débiteurs (global)</h3>
          <p className="text-xs text-white/40 mt-1">Indépendant de la période</p>
        </div>

        {/* List */}
        {debtors.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-white/50">Aucun débiteur</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {debtors.map((debtor) => {
              const debtPercent = Math.round((debtor.debt / maxDebt) * 100);
              return (
                <li
                  key={debtor.steamId}
                  className="relative group hover:bg-white/5 transition-colors"
                >
                  {/* Progress bar background */}
                  <div
                    className="absolute inset-y-0 right-0 bg-red-500/10 rounded-r"
                    style={{ width: `${debtPercent}%` }}
                  />

                  {/* Content */}
                  <Link
                    href={`/staff/banklogs?steamId=${debtor.steamId}`}
                    className="relative z-10 block px-6 py-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white/90 truncate">
                          {debtor.rpName ?? "Non lié"}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p className="font-bold text-red-400 tabular-nums">
                          {formatMoney(debtor.debt)}$
                        </p>
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * Mini ranked list (top deposits / withdrawals)
 */
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
    <div className="relative overflow-hidden rounded-2xl bg-gradient-to-b from-white/8 to-white/3 border border-white/10 shadow-[0_10px_30px_-20px_rgba(0,0,0,0.8)] backdrop-blur">
      <div className="absolute inset-0 bg-gradient-to-br from-white/6 via-transparent to-transparent opacity-60 pointer-events-none" />

      <div className="relative z-10">
        {/* Header */}
        <div className="border-b border-white/5 px-6 py-4 flex items-center gap-2">
          <Icon className={`h-4 w-4 ${color}`} />
          <h3 className="text-base font-bold text-white/95">{title}</h3>
          <span className="text-xs text-white/40 ml-auto">Top 15</span>
        </div>

        {/* List */}
        {rows.length === 0 ? (
          <div className="p-6 text-center">
            <p className="text-sm text-white/50">Aucune donnée</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/5">
            {rows.map((row) => (
              <li key={row.steamId}>
                <Link
                  href={`/staff/banklogs?steamId=${row.steamId}`}
                  className="block hover:bg-white/5 transition-colors px-6 py-3"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-semibold text-white/85 truncate">
                      {row.rpName ?? "Non lié"}
                    </span>
                    <span className={`text-sm font-bold tabular-nums ${color}`}>
                      {formatMoney(row.amount)}$
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
