"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";

/**
 * Bande discrète "Staff LYG en ligne" pour les dashboards (membre + staff) :
 * qui est connecté en jeu et dans quel métier. Données via le proxy
 * /api/member/staff-online (cache serveur 60 s), refresh client 60 s.
 */

type StaffOnline = {
  name: string;
  rankStaff: string;
  rankVip: string;
  server: number | null;
  job: string;
};

function rankColor(rank: string): string {
  const r = rank.toLowerCase();
  if (r.includes("admin")) return "text-red-300";
  if (r.includes("modérateur") || r.includes("moderateur")) return "text-sky-300";
  if (r.includes("help")) return "text-emerald-300";
  return "text-slate-300";
}

function formatJob(job: string): string {
  const j = job.trim().toLowerCase();
  if (!j) return "—";
  if (j === "staff") return "En staff";
  if (j === "chomeur") return "Chômeur";
  const pretty = j.replace(/_/g, " ");
  return pretty.charAt(0).toUpperCase() + pretty.slice(1);
}

export default function StaffOnlineStrip() {
  const [staff, setStaff] = useState<StaffOnline[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/member/staff-online", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (data?.ok && Array.isArray(data.data)) {
          setStaff(data.data);
          setUnavailable(false);
        } else if (staff === null) {
          setUnavailable(true);
        }
      } catch {
        if (mounted && staff === null) setUnavailable(true);
      }
    }
    load();
    const t = setInterval(load, 60_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Indisponible ou pas encore chargé : on n'occupe pas d'espace pour rien.
  if (unavailable || staff === null) return null;

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          <ShieldCheck className="h-3.5 w-3.5 text-emerald-400/80" />
          Staff LYG en ligne
          <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-1.5 text-[10px] font-bold normal-case tracking-normal text-emerald-300">
            {staff.length}
          </span>
        </span>

        {staff.length === 0 ? (
          <span className="text-xs text-slate-500">Aucun staff connecté en ce moment.</span>
        ) : (
          // Les staff "en staff" (en service) d'abord — c'est l'info qui compte.
          [...staff]
            .sort((a, b) => Number(b.job.trim().toLowerCase() === "staff") - Number(a.job.trim().toLowerCase() === "staff"))
            .map((s, i) => {
              const onDuty = s.job.trim().toLowerCase() === "staff";
              return (
                <span
                  key={i}
                  className={`flex items-center gap-2 rounded-full border py-1 pl-2.5 pr-1.5 text-xs ${
                    onDuty
                      ? "border-emerald-500/45 bg-emerald-500/[0.12] shadow-[0_0_14px_rgba(52,211,153,0.18)]"
                      : "border-white/10 bg-white/[0.04]"
                  }`}
                  title={`${s.rankStaff}${s.rankVip ? ` · ${s.rankVip}` : ""}${s.server != null ? ` · Serveur ${s.server}` : ""}`}
                >
                  <span
                    className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                      onDuty ? "animate-pulse bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,1)]" : "bg-emerald-400/70 shadow-[0_0_5px_rgba(52,211,153,0.6)]"
                    }`}
                  />
                  <span className="flex items-baseline gap-1.5">
                    <span className="font-semibold text-slate-50">{s.name}</span>
                    <span className={`text-[11px] ${rankColor(s.rankStaff)}`}>{s.rankStaff}</span>
                  </span>
                  <span
                    className={`rounded-md border px-1.5 py-0.5 text-[11px] font-bold leading-none ${
                      onDuty
                        ? "border-emerald-400/50 bg-emerald-500/25 text-emerald-100"
                        : "border-amber-500/25 bg-amber-500/[0.10] text-amber-200/90"
                    }`}
                  >
                    {onDuty ? "⚡ EN STAFF" : formatJob(s.job)}
                  </span>
                  {s.server != null && (
                    <span className="rounded border border-white/10 bg-white/5 px-1 py-0.5 text-[10px] leading-none text-slate-400">S{s.server}</span>
                  )}
                </span>
              );
            })
        )}
      </div>
    </div>
  );
}
