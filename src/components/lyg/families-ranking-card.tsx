"use client";

import { useEffect, useState } from "react";
import { Trophy, ChevronDown, ChevronUp } from "lucide-react";

/**
 * Carte "Classement des familles LYG" (dashboards membre + staff). Affiche le
 * Top 5 par défaut (#, Famille, Banque, Points), Los Esperados surligné,
 * dépliable sur les 19 familles. Données via /api/member/families-ranking
 * (API LYG officielle, cache serveur 5 min). Classé par points ; le SCORE
 * composite du site et les autres colonnes (morts, or, membres actifs…) ne
 * sont pas exposés par l'API.
 */

type RankedFamily = {
  rank: number;
  id: string;
  name: string;
  points: number;
  money: number;
  isOurs: boolean;
};
type Payload = {
  ok: boolean;
  totalFamilies: number;
  ours: RankedFamily | null;
  ranking: RankedFamily[];
};

const TOP = 5;

function formatMoney(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return "0 €";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(".", ",")} M€`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(".", ",")} k€`;
  return `${n} €`;
}
function formatPoints(n: number): string {
  return n.toFixed(2).replace(".", ",");
}

export default function FamiliesRankingCard() {
  const [data, setData] = useState<Payload | null>(null);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/member/families-ranking", { cache: "no-store" });
        const json = await res.json().catch(() => null);
        if (!mounted) return;
        if (json?.ok && Array.isArray(json.ranking)) setData(json as Payload);
      } catch {
        /* on garde le dernier état connu */
      }
    }
    load();
    const t = setInterval(load, 5 * 60_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  if (!data || !data.ok || data.ranking.length === 0) return null;

  const ours = data.ours;
  const visible = expanded ? data.ranking : data.ranking.slice(0, TOP);
  const showOursApart = !expanded && ours != null && ours.rank > TOP;

  const renderRow = (f: RankedFamily) => (
    <tr key={f.id} className={f.isOurs ? "bg-amber-500/[0.10]" : ""}>
      <td className="px-2 py-1.5 text-left tabular-nums text-slate-500">{f.rank}</td>
      <td className="px-2 py-1.5 text-left">
        <span className={f.isOurs ? "font-semibold text-amber-200" : "text-slate-200"}>{f.name}</span>
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{formatMoney(f.money)}</td>
      <td className="px-2 py-1.5 text-right tabular-nums text-slate-300">{formatPoints(f.points)}</td>
    </tr>
  );

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          <Trophy className="h-3.5 w-3.5 text-amber-400/80" />
          Classement familles LYG
        </span>

        {ours ? (
          <span className="flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/[0.08] py-1 pl-2.5 pr-3 text-xs">
            <span className="rounded-full bg-amber-400/90 px-1.5 py-0.5 text-[11px] font-bold text-black">
              #{ours.rank}
            </span>
            <span className="font-semibold text-slate-50">Los Esperados</span>
            <span className="text-[11px] text-slate-400">/ {data.totalFamilies}</span>
          </span>
        ) : null}

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="ml-auto flex shrink-0 items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-[11px] text-slate-400 transition-colors hover:bg-white/5 hover:text-slate-200"
        >
          {expanded ? (
            <>
              Top 5 <ChevronUp className="h-3.5 w-3.5" />
            </>
          ) : (
            <>
              Classement complet <ChevronDown className="h-3.5 w-3.5" />
            </>
          )}
        </button>
      </div>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[320px] border-collapse text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-2 py-1.5 text-left font-semibold">#</th>
              <th className="px-2 py-1.5 text-left font-semibold">Famille</th>
              <th className="px-2 py-1.5 text-right font-semibold">Banque</th>
              <th className="px-2 py-1.5 text-right font-semibold">Points</th>
            </tr>
          </thead>
          <tbody>
            {visible.map(renderRow)}
            {showOursApart ? (
              <>
                <tr>
                  <td colSpan={4} className="px-2 py-0.5 text-center text-[10px] text-slate-600">
                    ···
                  </td>
                </tr>
                {renderRow(ours)}
              </>
            ) : null}
          </tbody>
        </table>
        <p className="mt-2 px-2 text-[10px] leading-relaxed text-slate-600">
          Classé par points LYG. Le score composite du site (morts, or, cocaïne, réputation…)
          et le nombre de membres « actifs » ne sont pas exposés par l'API.
        </p>
      </div>
    </div>
  );
}
