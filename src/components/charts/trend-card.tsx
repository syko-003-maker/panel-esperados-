"use client";

import { useEffect, useState } from "react";
import { TrendChart, type SeriesPoint } from "./trend-chart";

type Metric = "money" | "playtime";

type SeriesResponse =
  | {
      ok: true;
      money: { points: SeriesPoint[]; unit: string };
      playtime: { points: SeriesPoint[]; unit: string; count: number };
    }
  | { ok: false; code?: string; error?: string };

const CHART_H = 176;

// ─── Formatage fr ───────────────────────────────────────────────────────────
function compactMoney(v: number): string {
  const a = Math.abs(v);
  const sign = v < 0 ? "−" : "";
  if (a >= 1_000_000) return `${sign}${(a / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })} M`;
  if (a >= 1_000) return `${sign}${(a / 1_000).toLocaleString("fr-FR", { maximumFractionDigits: 0 })} k`;
  return `${sign}${a.toLocaleString("fr-FR")}`;
}
function fullMoney(v: number): string {
  const sign = v < 0 ? "−" : v > 0 ? "+" : "";
  return `${sign}${Math.abs(v).toLocaleString("fr-FR")} €`;
}
function fmtHM(v: number): string {
  const h = Math.floor(v / 60);
  const m = Math.round(v % 60);
  return h > 0 ? `${h}h${m > 0 ? String(m).padStart(2, "0") : ""}` : `${m} min`;
}
function shortHours(v: number): string {
  return v >= 60 ? `${Math.round(v / 60)}h` : `${Math.round(v)}min`;
}

const DAY = 86_400_000;
// Axe : heure si l'historique tient sur < 2 jours (démarrage), sinon date.
function makeAxisDate(points: SeriesPoint[]): (t: number) => string {
  const span = points.length >= 2 ? points[points.length - 1].t - points[0].t : Infinity;
  if (span < 2 * DAY) return (t) => new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
  if (span < 120 * DAY) return (t) => new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
  return (t) => new Date(t).toLocaleDateString("fr-FR", { month: "short", year: "2-digit" });
}
function fullDate(t: number): string {
  return new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" });
}

export default function TrendCard({
  endpoint,
  title = "Évolution",
  defaultMetric = "money",
}: {
  endpoint: string;
  title?: string;
  defaultMetric?: Metric;
}) {
  const [metric, setMetric] = useState<Metric>(defaultMetric);
  const [data, setData] = useState<SeriesResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    setError(null);
    fetch(endpoint, { cache: "no-store" })
      .then(async (r) => {
        const j = (await r.json()) as SeriesResponse;
        if (!mounted) return;
        setData(j);
        if (!j.ok) setError(j.code || j.error || "Erreur");
      })
      .catch((e) => {
        if (mounted) setError(e?.message || "Erreur réseau");
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, [endpoint]);

  const tabBtn = (m: Metric) =>
    `rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
      metric === m ? "bg-amber-400/90 text-black shadow-sm" : "text-slate-400 hover:text-slate-200 hover:bg-white/[0.06]"
    }`;

  const notice = (icon: string, title: string, text: string) => (
    <div
      className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-white/8 bg-white/[0.02] px-6 text-center"
      style={{ height: CHART_H }}
    >
      <span className="text-xl">{icon}</span>
      <p className="text-sm font-medium text-slate-300">{title}</p>
      <p className="max-w-md text-xs leading-5 text-slate-500">{text}</p>
    </div>
  );

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-base">📈</span>
          <h3 className="text-sm font-semibold text-slate-100">{title}</h3>
        </div>
        <div className="flex items-center gap-1 rounded-xl border border-white/8 bg-white/[0.02] p-1">
          <button type="button" onClick={() => setMetric("money")} className={tabBtn("money")}>
            💰 Argent
          </button>
          <button type="button" onClick={() => setMetric("playtime")} className={tabBtn("playtime")}>
            🎮 Playtime
          </button>
        </div>
      </div>

      <div className="mt-3">
        {loading ? (
          <div className="animate-pulse rounded-xl border border-white/8 bg-white/[0.04]" style={{ height: CHART_H }} />
        ) : error ? (
          <div
            className="flex items-center justify-center rounded-xl border border-red-500/20 bg-red-500/[0.05] px-6 text-center text-sm text-red-300/80"
            style={{ height: CHART_H }}
          >
            {error === "MEMBER_NOT_LINKED" ? "Compte non lié." : `Impossible de charger la courbe (${error}).`}
          </div>
        ) : data && data.ok ? (
          metric === "money" ? (
            <>
              <TrendChart
                points={data.money.points}
                color="#34d399"
                height={CHART_H}
                zeroLine
                formatValue={fullMoney}
                formatValueShort={compactMoney}
                formatDate={makeAxisDate(data.money.points)}
                formatDateFull={fullDate}
                emptyLabel="Aucune transaction bancaire enregistrée pour l'instant."
              />
              <p className="mt-2.5 text-xs leading-5 text-slate-500">
                Solde cumulé au coffre famille (dépôts − retraits). Sous la ligne pointillée = déficit.
              </p>
            </>
          ) : data.playtime.count < 2 ? (
            notice(
              "🎮",
              data.playtime.count === 1
                ? `Une seule réunion enregistrée : ${fmtHM(data.playtime.points[0].v)}`
                : "Pas encore de réunion enregistrée",
              "La courbe se construit à partir des réunions finalisées (une par semaine). Elle apparaîtra dès la 2ᵉ réunion te concernant.",
            )
          ) : (
            <>
              <TrendChart
                points={data.playtime.points}
                color="#38bdf8"
                height={CHART_H}
                formatValue={fmtHM}
                formatValueShort={shortHours}
                formatDate={makeAxisDate(data.playtime.points)}
                formatDateFull={fullDate}
              />
              <p className="mt-2.5 text-xs leading-5 text-slate-500">
                Temps de jeu par semaine (relevé à chaque réunion), depuis ton entrée dans la famille.
              </p>
            </>
          )
        ) : null}
      </div>
    </div>
  );
}
