"use client";

import { useEffect, useState } from "react";
import { Gauge } from "lucide-react";

/**
 * Bouton « Mode léger » : coupe les flous (backdrop-blur) et les animations
 * décoratives via la classe `perf-lite` sur <html>. Pensé pour les PC/GPU
 * faibles. Choix mémorisé dans localStorage et ré-appliqué avant le paint
 * par un petit script inline dans le layout racine (pas de flash).
 */
export default function PerfModeToggle() {
  const [lite, setLite] = useState(false);

  useEffect(() => {
    setLite(document.documentElement.classList.contains("perf-lite"));
  }, []);

  function toggle() {
    const next = !document.documentElement.classList.contains("perf-lite");
    document.documentElement.classList.toggle("perf-lite", next);
    try {
      localStorage.setItem("perf-lite", next ? "1" : "0");
    } catch {
      /* localStorage indisponible : on garde juste l'état de session */
    }
    setLite(next);
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={lite}
      title="Réduit les effets visuels (flou, animations) pour les PC peu puissants"
      className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2.5 text-sm font-medium transition-colors ${
        lite
          ? "border-amber-500/30 bg-amber-500/10 text-amber-200"
          : "border-transparent text-slate-400 hover:border-white/15 hover:bg-white/[0.04] hover:text-slate-200"
      }`}
    >
      <Gauge className="h-4 w-4 shrink-0" />
      <span className="flex-1 text-left">Mode léger</span>
      <span className={`text-[11px] font-bold ${lite ? "text-amber-300" : "text-slate-500"}`}>
        {lite ? "ON" : "OFF"}
      </span>
    </button>
  );
}
