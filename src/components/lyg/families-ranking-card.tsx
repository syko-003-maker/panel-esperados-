"use client";

import { useEffect, useState } from "react";
import { Trophy, ChevronDown, ChevronUp } from "lucide-react";

/**
 * Carte "Classement des familles LYG" (dashboards membre + staff). Affiche le
 * VRAI tableau du site liveyourgame.fr/stats (score composite + membres, banque,
 * morts, or, cocaïne, guerres, réputation), Top 5 par défaut, dépliable sur les
 * 19 familles, Los Esperados surligné. Données via /api/member/families-ranking
 * (scraper Playwright, timer systemd ; fallback API points si scrape indispo).
 */

type RichFamily = {
  rank: number;
  name: string;
  slug: string;
  isOurs: boolean;
  score: string;
  membres: string;
  banque: string;
  braquages: string;
  morts: string;
  or: string;
  cocaine: string;
  guerres: string;
  reputation: string;
};
type Payload = {
  ok: boolean;
  source: "scrape" | "api-fallback";
  scrapedAt: string | null;
  stale: boolean;
  totalFamilies: number;
  ours: RichFamily | null;
  ranking: RichFamily[];
};

const TOP = 5;

// Colonnes stat dans l'ordre du site.
const COLS: { key: keyof RichFamily; label: string }[] = [
  { key: "score", label: "Score" },
  { key: "membres", label: "Membres" },
  { key: "banque", label: "Banque" },
  { key: "braquages", label: "Braquages" },
  { key: "morts", label: "Morts" },
  { key: "or", label: "Or" },
  { key: "cocaine", label: "Cocaïne" },
  { key: "guerres", label: "Guerres" },
  { key: "reputation", label: "Réput." },
];

function agoLabel(iso: string | null): string | null {
  if (!iso) return null;
  const ms = Date.now() - Date.parse(iso);
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.round(ms / 60000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return `il y a ${h} h`;
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
    const t = setInterval(load, 2 * 60_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  if (!data || !data.ok || data.ranking.length === 0) return null;

  const ours = data.ours;
  const visible = expanded ? data.ranking : data.ranking.slice(0, TOP);
  const showOursApart = !expanded && ours != null && ours.rank > TOP;
  const ago = agoLabel(data.scrapedAt);

  const cell = (v: string) => (v && v.trim() ? v : "—");

  const renderRow = (f: RichFamily) => (
    <tr key={f.slug || f.rank} className={f.isOurs ? "bg-amber-500/[0.10]" : ""}>
      <td className="whitespace-nowrap px-2 py-1.5 text-left tabular-nums text-slate-500">{f.rank}</td>
      <td className="whitespace-nowrap px-2 py-1.5 text-left">
        <span className={f.isOurs ? "font-semibold text-amber-200" : "text-slate-200"}>{f.name}</span>
      </td>
      {COLS.map((c) => (
        <td
          key={c.key}
          className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${
            c.key === "score" ? "font-semibold text-slate-100" : "text-slate-400"
          }`}
        >
          {cell(f[c.key] as string)}
        </td>
      ))}
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
            <span className="text-[11px] text-slate-400">
              / {data.totalFamilies}
              {ours.score ? ` · ${ours.score} pts` : ""}
            </span>
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
        <table className="w-full min-w-[640px] border-collapse text-xs">
          <thead>
            <tr className="text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-2 py-1.5 text-left font-semibold">#</th>
              <th className="px-2 py-1.5 text-left font-semibold">Famille</th>
              {COLS.map((c) => (
                <th key={c.key} className="whitespace-nowrap px-2 py-1.5 text-right font-semibold">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.map(renderRow)}
            {showOursApart ? (
              <>
                <tr>
                  <td colSpan={2 + COLS.length} className="px-2 py-0.5 text-center text-[10px] text-slate-600">
                    ···
                  </td>
                </tr>
                {renderRow(ours)}
              </>
            ) : null}
          </tbody>
        </table>
        <p className="mt-2 px-2 text-[10px] leading-relaxed text-slate-600">
          {data.source === "api-fallback"
            ? "Score du site momentanément indisponible — classement de secours (points API)."
            : `Données liveyourgame.fr/stats${ago ? ` · maj ${ago}` : ""}${data.stale ? " (un peu anciennes)" : ""}.`}
        </p>
      </div>
    </div>
  );
}
