export const dynamic = "force-dynamic";
export const revalidate = 0;

import { requireStaffAccess } from "@/lib/rbac";
import { prisma } from "@/lib/db";
import DebtsClient from "./debts-client";
import StatsClient from "./stats-client";
import { redirect } from "next/navigation";
import { PageShell } from "@/components/staff/ui/PageShell";
import { FAMILY_SLUG } from "@/lib/family";
import { getMemberDisplayName } from "@/lib/member-display";
import { isDisplayableStaffMember } from "@/lib/staff/member-scope";
import {
  BarChart3,
  TrendingUp,
  TrendingDown,
  DollarSign,
  ArrowDown,
  AlertCircle,
  Landmark,
} from "lucide-react";

// ============================================================================
// TYPES
// ============================================================================

type Row = {
  steamId: string;
  deposit: bigint;
  withdraw: bigint;
  net: bigint;
  count: bigint;
};

type NormalizedRow = {
  steamId: string;
  deposit: number;
  withdraw: number;
  net: number;
  count: number;
  rpName: string | null;
};

type FamilyBankBalanceInput = {
  familySlug: string;
};

// ============================================================================
// UTILITIES
// ============================================================================

function formatMoney(value: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(value));
}

function parseMoneyCandidate(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;

    const direct = Number(trimmed.replace(/\s+/g, ""));
    if (Number.isFinite(direct)) {
      return Math.trunc(direct);
    }

    // Accept values like "1 234 567 €" and keep sign if present.
    const normalized = trimmed
      .replace(/,/g, ".")
      .replace(/[^\d.-]/g, "")
      .replace(/(?!^)-/g, "");

    if (!normalized || normalized === "-" || normalized === "." || normalized === "-.") {
      return null;
    }

    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
  }

  return null;
}

async function fetchFamilyBankBalance(input: FamilyBankBalanceInput): Promise<number | null> {
  const syncKeys = Array.from(new Set([`infos:${input.familySlug}`, `infos:${FAMILY_SLUG}`]));

  for (const key of syncKeys) {
    const syncedInfos = await prisma.syncState.findUnique({
      where: { key },
      select: { meta: true },
    });

    const parsedSynced = parseMoneyCandidate((syncedInfos?.meta as any)?.money);
    if (parsedSynced != null) {
      return parsedSynced;
    }
  }

  return null;
}

// ============================================================================
// SERVER COMPONENT
// ============================================================================

export default async function StaffStatsPage() {
  // ✅ RBAC: Require basic staff access (any user with canAccessStaffPanel=true)
  const guard = await requireStaffAccess();
  if (guard instanceof Response) {
    redirect("/staff/forbidden");
  }

  // ========================================================================
  // REQUÊTE 1: Agrégats consolidés (sans filtre période)
  // ========================================================================
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      "steamId" AS "steamId",
      SUM(CASE WHEN "type" = 2 THEN "money" ELSE 0 END) AS "deposit",
      SUM(CASE WHEN "type" = 1 THEN "money" ELSE 0 END) AS "withdraw",
      SUM(CASE WHEN "type" = 2 THEN "money" ELSE - "money" END) AS "net",
      COUNT(*) AS "count"
    FROM "BankLog"
    GROUP BY "steamId"
  `;

  const norm = rows.map((r) => ({
    steamId: r.steamId?.trim() ?? "",
    deposit: Number(r.deposit),
    withdraw: Number(r.withdraw),
    net: Number(r.net),
    count: Number(r.count),
  }));

  // ========================================================================
  // REQUÊTE 2: Agrégats ALL-TIME pour la dette globale
  // ========================================================================
  const rowsAllTime = await prisma.$queryRaw<Row[]>`
    SELECT
      "steamId" AS "steamId",
      SUM(CASE WHEN "type" = 2 THEN "money" ELSE 0 END) AS "deposit",
      SUM(CASE WHEN "type" = 1 THEN "money" ELSE 0 END) AS "withdraw",
      SUM(CASE WHEN "type" = 2 THEN "money" ELSE - "money" END) AS "net",
      COUNT(*) AS "count"
    FROM "BankLog"
    GROUP BY "steamId"
  `;

  const allTimeNorm = rowsAllTime.map((r) => ({
    steamId: r.steamId?.trim() ?? "",
    deposit: Number(r.deposit),
    withdraw: Number(r.withdraw),
    net: Number(r.net),
    count: Number(r.count),
  }));

  // ========================================================================
  // Résoudre les steamIds et rpNames
  // ========================================================================
  const steamIds = Array.from(new Set(norm.map((r) => r.steamId).filter(Boolean)));
  const allTimeSteamIds = Array.from(
    new Set(allTimeNorm.map((r) => r.steamId).filter(Boolean))
  );
  const allSteamIds = Array.from(new Set([...steamIds, ...allTimeSteamIds]));

  const familySlug = FAMILY_SLUG;
  const family = await prisma.family.findUnique({
    where: { slug: familySlug },
    select: { id: true },
  });

  const familyDbId = family?.id ?? familySlug;

  const membersBySteam = allSteamIds.length
    ? await prisma.member.findMany({
        where: {
          steamId: { in: allSteamIds },
          familyId: familyDbId,
        },
        select: {
          steamId: true,
          rpName: true,
          discordDisplayName: true,
          discordUsername: true,
          discordId: true,
          isActive: true,
          isGhost: true,
          discordInGuild: true,
          missingFromLygSince: true,
          grade: true,
          rankRoleId: true,
          rankLabel: true,
          discordRoleIds: true,
        },
        take: 2000,
      })
    : [];

  const activeSteamIds = new Set(
    membersBySteam
      .filter((member) => {
        const isDisplayableMember = isDisplayableStaffMember({
          discordId: member.discordId,
          isActive: member.isActive,
          isGhost: member.isGhost,
          discordInGuild: member.discordInGuild,
          missingFromLygSince: member.missingFromLygSince,
          grade: member.grade,
          rankRoleId: member.rankRoleId,
          rankLabel: member.rankLabel,
          discordRoleIds: member.discordRoleIds,
        });

        return isDisplayableMember;
      })
      .map((member) => String(member.steamId ?? "").trim())
      .filter(Boolean)
  );

  const rpBySteam = new Map(
    membersBySteam
      .filter((m) => m.steamId)
      .map((m) => [String(m.steamId).trim(), getMemberDisplayName(m)])
  );

  // ========================================================================
  // Enrichir les données de la période + construire les listes
  // ========================================================================
  const enrichedMembers: NormalizedRow[] = norm.map((r) => ({
    ...r,
    rpName: rpBySteam.get(r.steamId) ?? null,
  })).filter((member) => activeSteamIds.has(member.steamId));

  const allTimeMembers: NormalizedRow[] = allTimeNorm.map((r) => ({
    ...r,
    rpName: rpBySteam.get(r.steamId) ?? null,
  })).filter((member) => activeSteamIds.has(member.steamId));

  const activeMembersCount = new Set(enrichedMembers.map((member) => member.steamId)).size;
  const linkedActiveCount = membersBySteam.filter((member) => {
    const isDisplayableMember = isDisplayableStaffMember({
      discordId: member.discordId,
      isActive: member.isActive,
      isGhost: member.isGhost,
      discordInGuild: member.discordInGuild,
      missingFromLygSince: member.missingFromLygSince,
      grade: member.grade,
      rankRoleId: member.rankRoleId,
      rankLabel: member.rankLabel,
      discordRoleIds: member.discordRoleIds,
    });

    return isDisplayableMember && Boolean(String(member.discordId ?? "").trim());
  }).length;
  const familyBankBalance = await fetchFamilyBankBalance({
    familySlug,
  });

  // ========================================================================
  // KPIs consolidés
  // ========================================================================
  const totalDeposit = enrichedMembers.reduce((sum, r) => sum + r.deposit, 0);
  const totalWithdraw = enrichedMembers.reduce((sum, r) => sum + r.withdraw, 0);
  const totalNet = enrichedMembers.reduce((sum, r) => sum + r.net, 0);

  // ========================================================================
  // KPIs GLOBAL (lifetime) - INDÉPENDANT du filtre de jours
  // ========================================================================
  const globalDebtMembersCount = allTimeMembers.filter((m) => m.net < 0).length;

  const globalTotalDebt = allTimeMembers.reduce((sum, member) => {
    return sum + Math.max(0, -member.net);
  }, 0);

  // ========================================================================
  // LISTES TRIÉES
  // ========================================================================

  // Top Dépôts (consolidé)
  const topDeposits = [...enrichedMembers]
    .sort((a, b) => b.deposit - a.deposit)
    .slice(0, 15)
    .map((member) => ({
      steamId: member.steamId,
      rpName: member.rpName,
      amount: member.deposit,
    }));

  // Top Retraits (consolidé)
  const topWithdraws = [...enrichedMembers]
    .sort((a, b) => b.withdraw - a.withdraw)
    .slice(0, 15)
    .map((member) => ({
      steamId: member.steamId,
      rpName: member.rpName,
      amount: member.withdraw,
    }));

  // Top Net POSITIF (consolidé)
  const topNet = [...enrichedMembers]
    .filter((m) => m.net > 0)
    .sort((a, b) => b.net - a.net)
    .slice(0, 15)
    .map((member) => ({
      steamId: member.steamId,
      rpName: member.rpName,
      amount: member.net,
    }));

  // Débiteurs globaux (lifetime) - top 15
  const globalDebtors = allTimeMembers
    .map((member) => {
      const debt = Math.max(0, -member.net);
      return {
        steamId: member.steamId,
        rpName: member.rpName,
        debt,
      };
    })
    .filter((x) => x.debt > 0)
    .sort((a, b) => b.debt - a.debt)
    .slice(0, 15);

  const maxDebt = Math.max(...globalDebtors.map((x) => x.debt), 1);

  return (
    <PageShell
      title="Statistiques Banque"
      description={`Vue consolidée temps réel • Membres actifs: ${activeMembersCount}`}
      icon={BarChart3}
    >
      {/* KPI Grid - 6 cards compactes et sobres */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <KpiCard
          label="Dépôts"
          value={totalDeposit}
          icon={TrendingUp}
          color="text-emerald-400"
        />
        <KpiCard
          label="Retraits"
          value={totalWithdraw}
          icon={TrendingDown}
          color="text-blue-400"
        />
        <KpiCard
          label="Net"
          value={totalNet}
          icon={DollarSign}
          color={totalNet >= 0 ? "text-emerald-400" : "text-red-400"}
        />
        <KpiCard
          label="Débiteurs"
          value={globalDebtMembersCount}
          icon={AlertCircle}
          color="text-amber-400"
          isCount
        />
        <KpiCard
          label="Déficit"
          value={globalTotalDebt}
          icon={ArrowDown}
          color="text-red-400"
        />
        <KpiCard
          label="Banque famille"
          value={familyBankBalance}
          icon={Landmark}
          color="text-amber-300"
        />
      </div>

      {/* Client Component for interactive UI */}
      <StatsClient
        kpis={{
          totalDeposit,
          totalWithdraw,
          net: totalNet,
          deficitMembers: globalDebtMembersCount,
          deficitTotal: globalTotalDebt,
          activeMembers: activeMembersCount,
          linkedRatio: `${linkedActiveCount}/${activeMembersCount}`,
        }}
        rows={enrichedMembers}
        topDeposits={topDeposits}
        topWithdraws={topWithdraws}
        topNet={topNet}
        globalDebtors={globalDebtors}
        maxDebt={maxDebt}
      />

      {/* Debts client section */}
      <DebtsClient />
    </PageShell>
  );
}

// ============================================================================
// SERVER-SIDE ONLY COMPONENTS
// ============================================================================

/**
 * KPI Card - compact et sobre
 */
function KpiCard({
  label,
  value,
  icon: Icon,
  color = "text-white",
  isCount = false,
}: {
  label: string;
  value: number | null;
  icon: React.ComponentType<{ className?: string }>;
  color?: string;
  isCount?: boolean;
}) {
  return (
    <div className="rounded-lg bg-white/5 border border-white/10 p-3">
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-xs font-semibold text-white/60 uppercase tracking-wide">
          {label}
        </span>
        <Icon className={`h-4 w-4 ${color} opacity-70 flex-shrink-0`} />
      </div>
      <div className={`text-2xl font-bold ${color}`}>
        {value == null ? "Indisponible" : isCount ? value : formatMoney(value)}
      </div>
    </div>
  );
}
