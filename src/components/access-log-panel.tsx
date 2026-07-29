"use client";

import { useEffect, useState, useCallback } from "react";
import { RefreshCw, ShieldAlert, LogIn, UserX, ChevronDown } from "lucide-react";

/**
 * Journal des accès au panel — qui se connecte, qui se fait refuser.
 *
 * Le refus est l'information la plus utile : sans trace, un ancien membre qui
 * tente encore d'entrer est invisible, et on ne peut pas vérifier que le
 * blocage était justifié.
 *
 * La liste est REPLIÉE par défaut, et n'est même pas chargée tant qu'on ne l'a
 * pas ouverte : une page de réglages n'a pas à dérouler des centaines de lignes
 * que personne n'a demandées. Seuls les trois compteurs restent visibles — ils
 * tiennent en une ligne et disent l'essentiel.
 */
type Row = {
  id: string;
  at: string;
  event: string;
  reason: string | null;
  discordId: string | null;
  rpName: string | null;
  username: string | null;
};

const EVENTS: Record<string, { label: string; tone: string; icon: typeof LogIn }> = {
  LOGIN:      { label: "Connexion", tone: "bg-emerald-500/15 text-emerald-300", icon: LogIn },
  BLOCKED:    { label: "Refusé",    tone: "bg-red-500/15 text-red-300",         icon: ShieldAlert },
  NOT_LINKED: { label: "Non lié",   tone: "bg-amber-500/15 text-amber-300",     icon: UserX },
};

const FILTERS = [
  { value: "ALL",        label: "Tout" },
  { value: "BLOCKED",    label: "Refusés" },
  { value: "LOGIN",      label: "Connexions" },
  { value: "NOT_LINKED", label: "Non liés" },
];

export function AccessLogPanel() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [filter, setFilter] = useState("ALL");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchLog = useCallback(async (ev: string, withRows: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const qs = withRows ? `event=${ev}&limit=150` : "countsOnly=1";
      const res = await fetch(`/api/staff/access-log?${qs}`);
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Chargement impossible");
      setCounts(data.counts ?? {});
      if (withRows) setRows(data.rows ?? []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, []);

  // Au montage : seulement les compteurs.
  useEffect(() => { void fetchLog("ALL", false); }, [fetchLog]);

  // La liste ne part chercher ses données qu'une fois dépliée.
  useEffect(() => { if (open) void fetchLog(filter, true); }, [open, filter, fetchLog]);

  const total = (counts.LOGIN ?? 0) + (counts.BLOCKED ?? 0) + (counts.NOT_LINKED ?? 0);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {(["LOGIN", "BLOCKED", "NOT_LINKED"] as const).map((k) => {
          const meta = EVENTS[k];
          const Icon = meta.icon;
          return (
            <div key={k} className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
                <Icon className="h-3.5 w-3.5" />
                {meta.label}
              </div>
              <div className="mt-0.5 text-xl font-bold text-slate-100">{counts[k] ?? 0}</div>
              <div className="text-[10px] text-slate-500">7 derniers jours</div>
            </div>
          );
        })}
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.07]"
      >
        <span>
          Voir le journal détaillé
          <span className="ml-2 text-xs font-normal text-slate-500">
            {total} entrée{total > 1 ? "s" : ""} sur 7 jours
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                type="button"
                onClick={() => setFilter(f.value)}
                className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                  filter === f.value
                    ? "border border-amber-400/30 bg-amber-400/15 text-amber-200"
                    : "border border-white/10 bg-white/[0.03] text-slate-400 hover:bg-white/[0.07]"
                }`}
              >
                {f.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => void fetchLog(filter, true)}
              className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/[0.07]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {!error && !loading && rows.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              Aucun accès enregistré pour ce filtre.
            </p>
          )}

          {/* Hauteur bornée : le journal defile chez lui, il ne pousse pas le
              reste de la page de réglages vers le bas. */}
          <div className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {rows.map((r) => {
              const meta = EVENTS[r.event] ?? { label: r.event, tone: "bg-white/10 text-slate-300", icon: LogIn };
              return (
                <div
                  key={r.id}
                  className="flex flex-wrap items-center gap-2 rounded-xl border border-white/[0.07] bg-white/[0.02] px-3 py-2"
                >
                  <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${meta.tone}`}>
                    {meta.label}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-slate-200">
                    {r.rpName || r.username || r.discordId || "inconnu"}
                  </span>
                  {r.reason && (
                    <span className="shrink-0 text-[11px] italic text-slate-500">{r.reason}</span>
                  )}
                  <span className="shrink-0 font-mono text-[11px] text-slate-500">
                    {new Date(r.at).toLocaleString("fr-FR", {
                      day: "2-digit", month: "2-digit",
                      hour: "2-digit", minute: "2-digit",
                    })}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
