"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type DashboardResponse = {
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
} | { ok: false; error?: string; code?: string };

function formatType(type: number) {
  if (type === 1) return "Crédit";
  if (type === 0) return "Débit";
  if (type === 2) return "Dépôt";
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

export default function DashboardClient() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const res = await fetch("/api/member/dashboard", { cache: "no-store" });
        const json = (await res.json()) as DashboardResponse;
        if (!mounted) return;
        if (!json.ok) {
          setError((json as any).code || (json as any).error || "Unknown error");
          setData(json);
          return;
        }
        setData(json);
      } catch (err) {
        if (!mounted) return;
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, []);

  if (loading) {
    return (
      <div className="p-6">
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 text-slate-300">
          Chargement du tableau de bord...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 text-red-300">
          Erreur: {error}
        </div>
      </div>
    );
  }

  if (!data || !data.ok) {
    return (
      <div className="p-6">
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 text-slate-300">
          Impossible de charger les données.
        </div>
      </div>
    );
  }

  const member = data.member;
  const bank = data.bank;
  const sanctions = data.sanctions;
  const absences = data.absences;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-white">Tableau de bord</h1>
        <p className="text-slate-400">
          Bienvenue,{" "}
          <span className="text-emerald-400 font-semibold">
            {member.rpName || member.discordId}
          </span>
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Sanctions Card */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 space-y-4 hover:border-red-500/30 transition">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-300">Sanctions</h3>
              <p className="text-3xl font-bold text-red-400 mt-2">
                {sanctions.activeCount}
              </p>
              <p className="text-xs text-slate-400 mt-1">actives</p>
            </div>
            <div className="text-4xl">⚠️</div>
          </div>
          <Link
            href="/justificatifs/sanction"
            className="w-full px-3 py-2 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded text-red-300 text-sm font-semibold transition text-center"
          >
            Justifier
          </Link>
        </div>

        {/* Absences Card */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 space-y-4 hover:border-blue-500/30 transition">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-300">Absences</h3>
              <p className="text-3xl font-bold text-blue-400 mt-2">
                {absences.openCount}
              </p>
              <p className="text-xs text-slate-400 mt-1">ouvertes</p>
            </div>
            <div className="text-4xl">📅</div>
          </div>
          <Link
            href="/justificatifs/absence"
            className="w-full px-3 py-2 bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/30 rounded text-blue-300 text-sm font-semibold transition text-center"
          >
            Justifier
          </Link>
        </div>

        {/* Bank Card */}
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 space-y-4 hover:border-emerald-500/30 transition">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-semibold text-slate-300">Banque</h3>
              <p className="text-3xl font-bold text-emerald-400 mt-2">
                {bank.lastTransactions.length}
              </p>
              <p className="text-xs text-slate-400 mt-1">transactions</p>
            </div>
            <div className="text-4xl">💰</div>
          </div>
          <Link
            href="/banque"
            className="w-full px-3 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 rounded text-emerald-300 text-sm font-semibold transition text-center"
          >
            Voir tout
          </Link>
        </div>
      </div>

      {/* Recent Bank Transactions */}
      {bank.lastTransactions.length > 0 && (
        <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 space-y-4">
          <h2 className="text-lg font-semibold text-white">Dernières transactions</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-slate-300">
              <thead className="text-xs font-semibold text-slate-400 border-b border-slate-700">
                <tr>
                  <th className="text-left py-2">Date</th>
                  <th className="text-left py-2">Type</th>
                  <th className="text-right py-2">Montant</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700">
                {bank.lastTransactions.map((tx: any, i: number) => (
                  <tr
                    key={i}
                    className={
                      tx.type === 1
                        ? "text-emerald-300"
                        : tx.type === 0
                          ? "text-red-300"
                          : "text-slate-300"
                    }
                  >
                    <td className="py-3">{formatDate(tx.date)}</td>
                    <td className="py-3">{formatType(tx.type)}</td>
                    <td className="text-right py-3 font-semibold">
                      {tx.type === 1 ? "+" : "-"}
                      {formatAmount(Math.abs(tx.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Link
            href="/banque"
            className="inline-block text-sm text-emerald-400 hover:text-emerald-300 font-semibold transition"
          >
            Voir toutes les transactions →
          </Link>
        </div>
      )}

      {/* Account Info */}
      <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-6 space-y-3">
        <h3 className="text-white font-semibold">Informations du compte</h3>
        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-slate-400">Discord ID</dt>
            <dd className="text-slate-200 font-mono">{member.discordId}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-slate-400">Nom RP</dt>
            <dd className="text-slate-200 font-semibold">
              {member.rpName || "Non défini"}
            </dd>
          </div>
          {member.steamId ? (
            <div className="flex justify-between">
              <dt className="text-slate-400">Steam ID</dt>
              <dd className="text-slate-200 font-mono">{member.steamId}</dd>
            </div>
          ) : (
            <div className="flex justify-between items-center">
              <dt className="text-slate-400">Steam</dt>
              <dd className="inline-flex items-center gap-2 text-slate-300">
                <span className="text-xs bg-slate-700 px-2 py-1 rounded">
                  Non lié (staff uniquement)
                </span>
              </dd>
            </div>
          )}
          {bank.lastUpdate && (
            <div className="flex justify-between">
              <dt className="text-slate-400">Dernière transaction</dt>
              <dd className="text-slate-200">{formatDate(bank.lastUpdate)}</dd>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
