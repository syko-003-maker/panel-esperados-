"use client";

import { useEffect, useState } from "react";
import { Briefcase } from "lucide-react";

/**
 * Bande "En métier Los" pour les dashboards (membre + staff) : qui est
 * actuellement connecté en jeu ET en métier famille. Données via
 * /api/member/family-online (accessible à tout membre, cache serveur 30 s).
 */

type FamilyOnline = { name: string; grade: string | null };

export default function FamilyOnlineStrip() {
  const [members, setMembers] = useState<FamilyOnline[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let mounted = true;
    async function load() {
      if (document.visibilityState === "hidden") return;
      try {
        const res = await fetch("/api/member/family-online", { cache: "no-store" });
        const data = await res.json().catch(() => null);
        if (!mounted) return;
        if (data?.ok && Array.isArray(data.data)) {
          setMembers(data.data);
          setUnavailable(false);
        } else if (members === null) {
          setUnavailable(true);
        }
      } catch {
        if (mounted && members === null) setUnavailable(true);
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

  if (unavailable || members === null) return null;

  return (
    <div className="rounded-2xl border border-white/8 bg-white/[0.02] px-4 py-3 backdrop-blur-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="flex shrink-0 items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500">
          <Briefcase className="h-3.5 w-3.5 text-amber-400/80" />
          En métier Los
          <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 text-[10px] font-bold normal-case tracking-normal text-amber-300">
            {members.length}
          </span>
        </span>

        {members.length === 0 ? (
          <span className="text-xs text-slate-500">Personne en métier famille en ce moment.</span>
        ) : (
          members.map((m, i) => (
            <span
              key={i}
              className="flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/[0.08] py-1 pl-2.5 pr-2.5 text-xs"
              title={m.grade ?? undefined}
            >
              <span className="h-1.5 w-1.5 shrink-0 rounded-full animate-pulse bg-amber-300 shadow-[0_0_8px_rgba(251,191,36,0.9)]" />
              <span className="flex items-baseline gap-1.5">
                <span className="font-semibold text-slate-50">{m.name}</span>
                {m.grade ? <span className="text-[11px] text-amber-200/80">{m.grade}</span> : null}
              </span>
            </span>
          ))
        )}
      </div>
    </div>
  );
}
