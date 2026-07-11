"use client";

import { useEffect, useState } from "react";
import { Gamepad2 } from "lucide-react";

/**
 * Bande "Serveur LYG" pour les dashboards (membre + staff) : nombre de joueurs
 * connectés EN DIRECT sur le(s) serveur(s) GMod DarkRP de LYG. Données via
 * /api/member/server-status (requête A2S Steam, cache serveur 30 s). Masquée
 * tant qu'aucun serveur ne répond (maintenance / injoignable).
 */

type ServerEntry = {
  ok: boolean;
  name: string | null;
  map: string | null;
  players: number | null;
  max: number | null;
};
type Status = {
  ok: boolean;
  online: boolean;
  players: number;
  max: number;
  name: string | null;
  map: string | null;
  totalPlayers: number;
  servers: ServerEntry[];
};

export default function ServerOnlineStrip() {
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/member/server-status", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (data?.ok) setStatus(data as Status);
      } catch {
        /* on garde le dernier état connu */
      }
    }
    load();
    const t = setInterval(load, 5_000);
    return () => {
      mounted = false;
      clearInterval(t);
    };
  }, []);

  // Rien tant qu'on n'a pas de données, ou si aucun serveur ne répond.
  if (!status || !status.online) return null;

  // Joueurs sur le shard #2 (overflow), affichés seulement s'il y en a.
  const extra = Math.max(0, status.totalPlayers - status.players);

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          <Gamepad2 className="h-3.5 w-3.5 text-emerald-400/80" />
          Serveur LYG
        </span>

        <span
          className="flex items-center gap-2 rounded-full border border-emerald-500/25 bg-emerald-500/[0.08] py-1 pl-2.5 pr-3 text-xs"
          title={
            status.servers
              .filter((s) => s.ok)
              .map((s) => `${(s.name ?? "").trim()} — ${s.players}/${s.max}`)
              .join("\n") || undefined
          }
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full animate-pulse bg-emerald-300 shadow-[0_0_8px_rgba(52,211,153,0.9)]" />
          <span className="flex items-baseline gap-1">
            <span className="text-sm font-bold text-slate-50">{status.players}</span>
            <span className="text-[11px] text-emerald-200/70">/ {status.max}</span>
            <span className="ml-0.5 text-[11px] text-slate-400">joueurs en ligne</span>
          </span>
        </span>

        <span className="text-xs text-slate-500">
          LePtitDarkRP
          {extra > 0 ? (
            <span className="ml-1.5 text-[11px] text-slate-600">(+{extra} sur le serveur 2)</span>
          ) : null}
        </span>
      </div>
    </div>
  );
}
