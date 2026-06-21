"use client";

import { useEffect, useState, Component, type ReactNode } from "react";
import Link from "next/link";
import ReglementQuickChat from "@/components/reglement/reglement-quick-chat";
import StaffOnlineStrip from "@/components/lyg/staff-online-strip";
import {
  Crown,
  AlertCircle,
  CalendarOff,
  Banknote,
  ArrowRight,
  TrendingUp,
  TrendingDown,
  Minus,
  User,
  Hash,
  Wallet,
} from "lucide-react";

type DashboardResponse =
  | {
      ok: true;
      member: {
        rpName: string | null;
        discordId: string;
        steamId: string | null;
      };
      bank: {
        lastTransactions: Array<{
          date: string;
          type: number;
          amount: number;
          raw?: any;
        }>;
        balance: number | null;
        lastUpdate: string | null;
      };
      sanctions: {
        activeCount: number;
        last?: {
          id: string;
          type: string;
          reason: string | null;
          status: string;
          createdAt: string;
        } | null;
      };
      absences: {
        openCount: number;
        last?: {
          id: string;
          reason: string | null;
          status: string;
          startAt: string;
          endAt: string;
        } | null;
      };
      debt?: {
        eligible: boolean;
        net: number;
        deficitAmount: number;
      };
    }
  | { ok: false; error?: string; code?: string };

// ✅ Error boundary client pour attraper les crashs de rendu
class DashboardErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean; message: string }
> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, message: "" };
  }
  static getDerivedStateFromError(err: unknown) {
    return { hasError: true, message: err instanceof Error ? err.message : "Erreur inconnue" };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="rounded-2xl border border-red-500/30 bg-red-500/8 p-8 text-center space-y-2">
          <p className="text-sm font-semibold text-red-300">⚠️ Erreur d'affichage</p>
          <p className="text-sm text-red-400/80">{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

function formatType(type: number) {
  if (type === 1) return "Retrait";
  if (type === 0) return "Débit";
  if (type === 2) return "Remboursement";
  return `Type ${type}`;
}

function formatAmount(amount: number) {
  return amount.toLocaleString("fr-FR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
}

function formatDate(dateStr: string) {
  const date = new Date(dateStr);
  return date.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function TxIcon({ type }: { type: number }) {
  if (type === 2) return <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />; // Remboursement (+)
  if (type === 1 || type === 0) return <TrendingDown className="h-3.5 w-3.5 text-red-400" />; // Retrait / Débit (−)
  return <Minus className="h-3.5 w-3.5 text-slate-400" />;
}

function txColor(type: number) {
  // Couleurs plus claires + drop-shadow léger pour mieux ressortir sur le
  // fond bordeaux sombre du panel. text-emerald-200/red-200 sont plus
  // visibles que -300 sur des cartes white/[0.03].
  if (type === 2) return "text-emerald-200 drop-shadow-[0_0_6px_rgba(52,211,153,0.35)]"; // Remboursement (+)
  if (type === 1 || type === 0) return "text-red-200 drop-shadow-[0_0_6px_rgba(248,113,113,0.40)]"; // Retrait / Débit (−)
  return "text-slate-200";
}

export default function DashboardClient() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [httpStatus, setHttpStatus] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);

    const load = async () => {
      try {
        const res = await fetch("/api/member/dashboard", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!mounted) return;
        setHttpStatus(res.status);

        let json: DashboardResponse;
        try {
          json = (await res.json()) as DashboardResponse;
        } catch {
          setError(`Réponse invalide du serveur (HTTP ${res.status})`);
          return;
        }

        if (!mounted) return;
        if (!json.ok) {
          setError((json as any).code || (json as any).error || "Erreur inconnue");
          setData(json);
          return;
        }
        setData(json);
      } catch (err) {
        if (!mounted) return;
        if (err instanceof DOMException && err.name === "AbortError") {
          setError("Le chargement a pris trop de temps. Réessayez.");
        } else {
          setError(err instanceof Error ? err.message : "Erreur réseau");
        }
      } finally {
        clearTimeout(timeout);
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-amber-400/20 bg-amber-400/[0.06] p-6 text-center">
          <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-amber-400 border-t-transparent mb-2" />
          <p className="text-sm font-medium text-amber-300/90">Chargement du tableau de bord…</p>
        </div>
        <div className="h-28 rounded-2xl border border-white/15 bg-white/[0.08] animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-36 rounded-2xl border border-white/15 bg-white/[0.08] animate-pulse" />
          ))}
        </div>
        <div className="h-48 rounded-2xl border border-white/15 bg-white/[0.08] animate-pulse" />
      </div>
    );
  }

  const errorCode = !data?.ok ? ((data as any)?.code ?? (data as any)?.error) : null;
  if (error || !data || !data.ok) {
    const message =
      errorCode === "MEMBER_NOT_LINKED"
        ? "Votre compte n'est pas encore lié à un membre. Contactez un État-Major."
        : error || "Impossible de charger les données du tableau de bord.";
    return (
      <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center space-y-3">
        <p className="text-base font-semibold text-red-300">
          ⚠️ Erreur de chargement
        </p>
        <p className="text-sm text-red-400/90">{message}</p>
        {httpStatus && httpStatus !== 200 && (
          <p className="text-xs text-red-500/60">Code HTTP : {httpStatus}</p>
        )}
        <button
          onClick={() => window.location.reload()}
          className="mt-2 inline-block rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const { member, bank, sanctions, absences, debt } = data;
  const transactions = Array.isArray(bank?.lastTransactions) ? bank.lastTransactions : [];
  const leadership: Array<{ tier: string; members: Array<{ rpName: string | null; avatarUrl: string | null }> }> =
    Array.isArray((data as any)?.leadership) ? (data as any).leadership : [];

  return (
  <DashboardErrorBoundary>
    <div className="space-y-6">
      {/* Hero header */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300/70 mb-2">
          Espace Membre
        </p>
        <h1 className="text-2xl font-bold tracking-tight text-slate-50 md:text-3xl">
          Bienvenue,{" "}
          <span className="text-amber-300">{member.rpName || member.discordId}</span>
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Gérez vos informations et accédez à vos données personnelles.
        </p>
      </div>

      {/* Stats grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Sanctions */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm p-5 flex flex-col gap-4 hover:border-red-500/20 transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Sanctions
              </p>
              <p className="text-4xl font-bold text-slate-50 mt-2 tracking-tight">
                {sanctions.activeCount}
              </p>
              <p className="text-xs text-slate-500 mt-1">actives</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
              <AlertCircle className="h-4 w-4 text-red-400" />
            </div>
          </div>
          <Link
            href="/justificatifs/sanction"
            className="flex items-center justify-between rounded-xl border border-red-500/20 bg-red-500/8 px-3 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/15 hover:border-red-500/30"
          >
            <span>Justifier</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Absences */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm p-5 flex flex-col gap-4 hover:border-blue-500/20 transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Absences
              </p>
              <p className="text-4xl font-bold text-slate-50 mt-2 tracking-tight">
                {absences.openCount}
              </p>
              <p className="text-xs text-slate-500 mt-1">ouvertes</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
              <CalendarOff className="h-4 w-4 text-blue-400" />
            </div>
          </div>
          <Link
            href="/justificatifs/absence"
            className="flex items-center justify-between rounded-xl border border-blue-500/20 bg-blue-500/8 px-3 py-2 text-sm font-medium text-blue-300 transition hover:bg-blue-500/15 hover:border-blue-500/30"
          >
            <span>Justifier</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Banque */}
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm p-5 flex flex-col gap-4 hover:border-emerald-500/20 transition-colors">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Banque
              </p>
              <p className="text-4xl font-bold text-slate-50 mt-2 tracking-tight">
                {bank.lastTransactions.length}
              </p>
              <p className="text-xs text-slate-500 mt-1">transactions récentes</p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
              <Banknote className="h-4 w-4 text-emerald-400" />
            </div>
          </div>
          <Link
            href="/banque"
            className="flex items-center justify-between rounded-xl border border-emerald-500/20 bg-emerald-500/8 px-3 py-2 text-sm font-medium text-emerald-300 transition hover:bg-emerald-500/15 hover:border-emerald-500/30"
          >
            <span>Voir tout</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Mini-chat Assistant Règlement (même IA que /reglement sur Discord) */}
      <ReglementQuickChat fullToolHref="/reglement" />

      {/* Staff LYG connectés en jeu (discret) */}
      <StaffOnlineStrip />

      {/* Situation bancaire — toujours affichée si les données sont disponibles */}
      {debt !== undefined && (() => {
        const isDeficit = debt.net < 0;
        const isNeutral = debt.net === 0;

        if (isDeficit) {
          return (
            <div
              className="flex items-center gap-4 rounded-2xl border border-red-500/55 bg-gradient-to-br from-red-500/25 via-red-500/15 to-red-500/10 p-5 shadow-[0_18px_40px_-18px_rgba(239,68,68,0.45)] backdrop-blur-sm"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-red-500/55 bg-red-500/25 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
                <TrendingDown className="h-5 w-5 text-red-200 drop-shadow-[0_0_6px_rgba(248,113,113,0.55)]" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-red-200/80 sm:text-xs">
                  Déficit bancaire
                </p>
                <p
                  className="mt-0.5 text-2xl font-extrabold tracking-tight text-red-100 tabular-nums sm:text-3xl"
                  style={{ textShadow: "0 0 18px rgba(248,113,113,0.45)" }}
                >
                  −{formatAmount(debt.deficitAmount)} €
                </p>
                <p className="mt-0.5 text-xs font-medium text-red-200/85">
                  À régulariser auprès de l'État-Major
                </p>
              </div>
            </div>
          );
        }

        if (isNeutral) {
          return (
            <div
              className="flex items-center gap-4 rounded-2xl border border-slate-500/30 bg-slate-500/[0.10] p-5 backdrop-blur-sm"
            >
              <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-slate-500/30 bg-slate-500/15">
                <Wallet className="h-5 w-5 text-slate-300" />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-slate-400 sm:text-xs">
                  Solde bancaire
                </p>
                <p className="mt-0.5 text-2xl font-bold tracking-tight text-slate-100 sm:text-3xl">
                  À l'équilibre
                </p>
                <p className="mt-0.5 text-xs text-slate-400">Aucun déficit en cours</p>
              </div>
            </div>
          );
        }

        // Positif
        return (
          <div
            className="flex items-center gap-4 rounded-2xl border border-emerald-500/55 bg-gradient-to-br from-emerald-500/20 via-emerald-500/12 to-emerald-500/8 p-5 shadow-[0_18px_40px_-18px_rgba(16,185,129,0.40)] backdrop-blur-sm"
          >
            <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-xl border border-emerald-500/55 bg-emerald-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]">
              <TrendingUp className="h-5 w-5 text-emerald-200 drop-shadow-[0_0_6px_rgba(52,211,153,0.55)]" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-200/80 sm:text-xs">
                Solde bancaire
              </p>
              <p
                className="mt-0.5 text-2xl font-extrabold tracking-tight text-emerald-100 tabular-nums sm:text-3xl"
                style={{ textShadow: "0 0 18px rgba(52,211,153,0.40)" }}
              >
                +{formatAmount(debt.net)} €
              </p>
              <p className="mt-0.5 text-xs font-medium text-emerald-200/85">
                Solde positif
              </p>
            </div>
          </div>
        );
      })()}

      {/* Transactions (réduites) + Hiérarchie famille côte à côte */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
      {transactions.length > 0 && (
        <div className="rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm overflow-hidden lg:col-span-3">
          <div className="flex items-center justify-between px-5 py-4 border-b border-white/8">
            <h2 className="text-sm font-semibold text-slate-200">Dernières transactions</h2>
            <Link
              href="/banque"
              className="flex items-center gap-1 text-xs font-medium text-emerald-400 hover:text-emerald-300 transition"
            >
              Tout voir <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {/* Mobile cards */}
          <div className="md:hidden divide-y divide-white/[0.04]">
            {transactions.map((tx: any, i: number) => (
              <div key={i} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-2">
                  <TxIcon type={tx.type} />
                  <div>
                    <div className="text-sm text-slate-300">{formatType(tx.type)}</div>
                    <div className="text-xs text-slate-500">{formatDate(tx.date)}</div>
                  </div>
                </div>
                <span className={`font-semibold tabular-nums text-sm ${txColor(tx.type)}`}>
                  {tx.type === 2 ? "+" : "−"}{formatAmount(Math.abs(tx.amount))}
                </span>
              </div>
            ))}
          </div>
          {/* Desktop table */}
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Date</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wider text-slate-500">Type</th>
                  <th className="px-5 py-3 text-right text-xs font-semibold uppercase tracking-wider text-slate-500">Montant</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((tx: any, i: number) => (
                  <tr key={i} className="border-b border-white/[0.04] last:border-0 hover:bg-white/[0.02] transition-colors">
                    <td className="px-5 py-3 text-slate-400">{formatDate(tx.date)}</td>
                    <td className="px-5 py-3">
                      <span className="flex items-center gap-2">
                        <TxIcon type={tx.type} />
                        <span className="text-slate-300">{formatType(tx.type)}</span>
                      </span>
                    </td>
                    <td className={`px-5 py-3 text-right font-semibold tabular-nums ${txColor(tx.type)}`}>
                      {tx.type === 2 ? "+" : "−"}{formatAmount(Math.abs(tx.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Hiérarchie famille — qui contacter, du Chef aux Encadrants */}
      {leadership.length > 0 && (
        <div className={`rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm overflow-hidden ${transactions.length > 0 ? "lg:col-span-2" : "lg:col-span-5"}`}>
          <div className="flex items-center gap-2 px-5 py-4 border-b border-white/8">
            <Crown className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-semibold text-slate-200">Hiérarchie famille</h2>
          </div>
          <div className="divide-y divide-white/[0.04]">
            {leadership.map((tier) => (
              <div key={tier.tier} className="px-5 py-3">
                <p
                  className={`text-[10px] font-bold uppercase tracking-[0.16em] ${
                    tier.tier === "Chef famille" ? "text-amber-300" :
                    tier.tier === "Sous-Chef famille" ? "text-amber-200/80" :
                    tier.tier === "Chef État-Major" ? "text-rose-300" :
                    tier.tier === "État-Major" ? "text-rose-200/70" :
                    "text-sky-300/80"
                  }`}
                >
                  {tier.tier}
                </p>
                <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1.5">
                  {tier.members.map((m, i) => (
                    <span key={i} className="flex items-center gap-1.5 text-sm text-slate-200">
                      {m.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={m.avatarUrl} alt="" className="h-5 w-5 rounded-full ring-1 ring-white/15" />
                      ) : (
                        <span className="h-5 w-5 rounded-full bg-white/10 ring-1 ring-white/15" />
                      )}
                      {m.rpName ?? "—"}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      </div>

      {/* Compte + progression des rangs côte à côte */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
      {/* Account info */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm p-5">
        <h3 className="text-sm font-semibold uppercase tracking-wider text-slate-400 mb-4">
          Informations du compte
        </h3>
        <dl className="space-y-3">
          <div className="flex items-center justify-between">
            <dt className="flex items-center gap-2 text-sm text-slate-400">
              <User className="h-3.5 w-3.5" />
              Nom RP
            </dt>
            <dd className="text-sm font-semibold text-slate-100">
              {member.rpName || "Non défini"}
            </dd>
          </div>
          <div className="flex items-center justify-between border-t border-white/[0.05] pt-3">
            <dt className="flex items-center gap-2 text-sm text-slate-400">
              <Hash className="h-3.5 w-3.5" />
              Discord ID
            </dt>
            <dd className="text-sm font-mono text-slate-300">{member.discordId}</dd>
          </div>
          {member.steamId && (
            <div className="flex items-center justify-between border-t border-white/[0.05] pt-3">
              <dt className="text-sm text-slate-400">Steam ID</dt>
              <dd className="text-sm font-mono text-slate-300">{member.steamId}</dd>
            </div>
          )}
          {bank.lastUpdate && (
            <div className="flex items-center justify-between border-t border-white/[0.05] pt-3">
              <dt className="text-sm text-slate-400">Dernière transaction</dt>
              <dd className="text-sm text-slate-300">{formatDate(bank.lastUpdate)}</dd>
            </div>
          )}
        </dl>
      </div>

      {/* Progression des rangs (résumé — détail complet sur le dossier) */}
      <div className="rounded-2xl border border-amber-500/15 bg-gradient-to-br from-amber-500/[0.06] via-white/[0.02] to-transparent backdrop-blur-sm p-5">
        <h3 className="mb-4 flex items-center gap-2 text-sm font-semibold uppercase tracking-wider text-amber-300/90">
          📈 Progression des rangs
        </h3>

        <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Grades de base · WL-4</p>
        <p className="mt-1.5 text-[13px] leading-6 text-slate-300">
          Novato → Soldado → Guardia → Asesino → Caporal → Veterano
        </p>
        <p className="mt-1 text-xs text-amber-200/70">⏳ 2 semaines minimum par palier avant promotion.</p>

        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Validation des semaines</p>
        <div className="mt-1.5 space-y-1 text-[13px] text-slate-300">
          <p>✅ <span className="font-semibold text-slate-100">5 h</span> de jeu = 1 semaine</p>
          <p>✅ <span className="font-semibold text-slate-100">20 h</span> = 2 semaines <span className="text-emerald-300/80">(Double UP)</span></p>
          <p>✅ <span className="font-semibold text-slate-100">40 h</span> = 3 semaines</p>
        </div>

        <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.16em] text-slate-500">Grades supérieurs 🎖️</p>
        <p className="mt-1.5 text-[13px] leading-6 text-slate-300">
          Subteniente <span className="text-amber-200/80">3 sem.</span> · Teniente <span className="text-amber-200/80">4</span> · Capitán <span className="text-amber-200/80">5</span> · Mayor <span className="text-amber-200/80">6</span>
        </p>
        <p className="mt-1 text-xs text-slate-500">+ implication active &amp; avis favorable de l&apos;État-Major.</p>
      </div>
      </div>
    </div>
  </DashboardErrorBoundary>
  );
}
