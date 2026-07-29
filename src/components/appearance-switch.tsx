"use client";

import { useEffect, useState } from "react";
import { Monitor, Smartphone } from "lucide-react";

/**
 * Choix de l'apparence, et diagnostic de la détection automatique.
 *
 * Le thème « coucher de soleil » est censé s'activer tout seul quand le panel
 * tourne dans une fenêtre installée. Cette détection dépend du système et du
 * navigateur, et elle échoue silencieusement quand la fenêtre se déclare sous
 * un mode inattendu — sans moyen de le voir, c'est indébogable côté serveur.
 *
 * Ce panneau montre donc ce que la fenêtre déclare réellement, et permet de
 * forcer l'apparence dans un sens ou dans l'autre.
 */
const STORAGE_KEY = "los-display-app";
const MODES = ["standalone", "minimal-ui", "fullscreen", "window-controls-overlay", "browser"];

export function AppearanceSwitch() {
  const [detected, setDetected] = useState<string[]>([]);
  const [ios, setIos] = useState(false);
  const [forced, setForced] = useState(false);
  const [active, setActive] = useState(false);

  const refresh = () => {
    setDetected(MODES.filter((m) => window.matchMedia(`(display-mode: ${m})`).matches));
    setIos((window.navigator as Navigator & { standalone?: boolean }).standalone === true);
    try { setForced(localStorage.getItem(STORAGE_KEY) === "1"); } catch { /* mode privé */ }
    setActive(document.documentElement.getAttribute("data-display") === "app");
  };

  useEffect(refresh, []);

  function toggle(next: boolean) {
    try {
      if (next) localStorage.setItem(STORAGE_KEY, "1");
      else localStorage.removeItem(STORAGE_KEY);
    } catch { /* mode privé : le choix ne survivra pas à la fermeture */ }

    // On applique sans attendre un rechargement : l'attribut porte tout le thème.
    if (next) document.documentElement.setAttribute("data-display", "app");
    else document.documentElement.removeAttribute("data-display");
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => toggle(true)}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
            active
              ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
              : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
          }`}
        >
          <Smartphone className="h-4 w-4" />
          Thème application
        </button>

        <button
          type="button"
          onClick={() => toggle(false)}
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors ${
            !active
              ? "border-amber-400/40 bg-amber-400/15 text-amber-200"
              : "border-white/10 bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]"
          }`}
        >
          <Monitor className="h-4 w-4" />
          Thème site
        </button>
      </div>

      <p className="text-xs text-slate-400">
        Le thème application s&apos;active normalement tout seul dans une fenêtre installée.
        Ces boutons servent à forcer le choix, et à comparer les deux.
      </p>

      {/* Diagnostic : c'est ce bloc qui permet de comprendre une détection ratée. */}
      <div className="rounded-xl border border-white/10 bg-black/25 p-3 font-mono text-[11px] leading-relaxed text-slate-400">
        <div>
          mode déclaré par la fenêtre :{" "}
          <span className="text-slate-200">{detected.length ? detected.join(", ") : "aucun"}</span>
        </div>
        <div>
          Safari iOS autonome : <span className="text-slate-200">{ios ? "oui" : "non"}</span>
        </div>
        <div>
          choix forcé : <span className="text-slate-200">{forced ? "oui" : "non"}</span>
        </div>
        <div>
          thème appliqué :{" "}
          <span className={active ? "text-emerald-300" : "text-slate-200"}>
            {active ? "application" : "site"}
          </span>
        </div>
      </div>
    </div>
  );
}
