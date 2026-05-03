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
import { buildAvatarUrlBySteam } from "@/lib/discord/avatar-cache";
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
  avatarUrl?: string | null;
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
  const slugs = Array.from(new Set([input.familySlug, FAMILY_SLUG]));

  for (const slug of slugs) {
    const keys = [`lyg-sync:infos:${slug}`, `infos:${slug}`];

    for (const key of keys) {
      const syncedInfos = await prisma.syncState.findUnique({
        where: { key },
        select: { meta: true },
      });

      const meta = syncedInfos?.meta as any;
      const parsedSynced =
        parseMoneyCandidate(meta?.metrics?.money) ??
        parseMoneyCandidate(meta?.money);

      if (parsedSynced != null) {
        return parsedSynced;
      }
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

  // Avatars Discord — cache partagé (mémoire + DB + API Discord)
  const discordIdBySteam = new Map(
    membersBySteam
      .filter((m) => m.steamId && m.discordId)
      .map((m) => [String(m.steamId).trim(), String(m.discordId).trim()])
  );
  const avatarUrlBySteam = await buildAvatarUrlBySteam(discordIdBySteam).catch(() => new Map<string, string | null>());

  // ========================================================================
  // Enrichir les données de la période + construire les listes
  // ========================================================================
  const enrichedMembers: NormalizedRow[] = norm.map((r) => ({
    ...r,
    rpName: rpBySteam.get(r.steamId) ?? null,
    avatarUrl: avatarUrlBySteam.get(r.steamId) ?? null,
  })).filter((member) => activeSteamIds.has(member.steamId));

  const allTimeMembers: NormalizedRow[] = allTimeNorm.map((r) => ({
    ...r,
    rpName: rpBySteam.get(r.steamId) ?? null,
    avatarUrl: avatarUrlBySteam.get(r.steamId) ?? null,
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
      avatarUrl: avatarUrlBySteam.get(member.steamId) ?? null,
    }));

  // Top Retraits (consolidé)
  const topWithdraws = [...enrichedMembers]
    .sort((a, b) => b.withdraw - a.withdraw)
    .slice(0, 15)
    .map((member) => ({
      steamId: member.steamId,
      rpName: member.rpName,
      amount: member.withdraw,
      avatarUrl: avatarUrlBySteam.get(member.steamId) ?? null,
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
      avatarUrl: avatarUrlBySteam.get(member.steamId) ?? null,
    }));

  // Débiteurs globaux (lifetime) - top 15
  const globalDebtors = allTimeMembers
    .map((member) => {
      const debt = Math.max(0, -member.net);
      return {
        steamId: member.steamId,
        rpName: member.rpName,
        debt,
        avatarUrl: avatarUrlBySteam.get(member.steamId) ?? null,
      };
    })
    .filter((x) => x.debt > 0)
    .sort((a, b) => b.debt - a.debt)
    .slice(0, 15);

  const maxDebt = Math.max(...globalDebtors.map((x) => x.debt), 1);

  return (
    <PageShell
      title="Statistiques Banque"
      description="Vue consolidée des flux bancaires de la famille"
      icon={BarChart3}
    >
      {/* KPI Grid - 6 cards compactes et sobres */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-8">
        <KpiCard label="Dépôts"         value={totalDeposit}           icon={TrendingUp}  variant="emerald" />
        <KpiCard label="Retraits"        value={totalWithdraw}          icon={TrendingDown} variant="blue" />
        <KpiCard label="Net"             value={totalNet}               icon={DollarSign}  variant={totalNet >= 0 ? "emerald" : "red"} />
        <KpiCard label="Débiteurs"       value={globalDebtMembersCount} icon={AlertCircle} variant="orange" isCount />
        <KpiCard label="Déficit"         value={globalTotalDebt}        icon={ArrowDown}   variant="red" />
        <KpiCard label="Banque famille"  value={familyBankBalance}      icon={Landmark}    variant="amber" />
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

const KPI_VARIANTS = {
  emerald: { text: "text-emerald-400", icon: "text-emerald-400", bg: "bg-emerald-500/[0.04] border-emerald-500/20" },
  blue:    { text: "text-blue-400",    icon: "text-blue-400",    bg: "bg-blue-500/[0.04] border-blue-500/20" },
  red:     { text: "text-red-400",     icon: "text-red-400",     bg: "bg-red-500/[0.04] border-red-500/20" },
  orange:  { text: "text-orange-400",  icon: "text-orange-400",  bg: "bg-orange-500/[0.04] border-orange-500/20" },
  amber:   { text: "text-amber-300",   icon: "text-amber-300",   bg: "bg-amber-500/[0.04] border-amber-500/20" },
} as const;

/**
 * KPI Card - compact et sobre
 */
function KpiCard({
  label,
  value,
  icon: Icon,
  variant = "amber",
  isCount = false,
}: {
  label: string;
  value: number | null;
  icon: React.ComponentType<{ className?: string }>;
  variant?: keyof typeof KPI_VARIANTS;
  isCount?: boolean;
}) {
  const v = KPI_VARIANTS[variant];
  return (
    <div className={`rounded-xl border p-3 overflow-hidden ${v.bg}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-[10px] font-semibold text-white/55 uppercase tracking-wider leading-tight">
          {label}
        </span>
        <Icon className={`h-3.5 w-3.5 opacity-70 flex-shrink-0 mt-0.5 ${v.icon}`} />
      </div>
      <div className={`text-lg font-bold leading-tight truncate ${v.text}`}>
        {value == null ? "N/A" : isCount ? value : formatMoney(value)}
      </div>
    </div>
  );
}
