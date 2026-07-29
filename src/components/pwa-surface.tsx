"use client";

import { useEffect } from "react";

/**
 * Distingue l'APPLICATION INSTALLÉE du SITE ouvert dans un navigateur.
 *
 * Même adresse, même code : ce qui change, c'est la façon dont la page est
 * lancée. On pose `data-display="app"` sur <html> quand on est dans une fenêtre
 * installée, et toute la charte « coucher de soleil » s'accroche à cet attribut.
 *
 * TROIS SIGNAUX, parce qu'aucun ne couvre tout :
 *
 *   1. `display-mode: standalone` — Chrome, Edge, Android, Windows, macOS.
 *      Ne marche pas si l'utilisateur a créé un simple raccourci plutôt qu'une
 *      vraie installation : le raccourci ouvre un onglet et n'est donc PAS
 *      standalone.
 *
 *   2. `navigator.standalone` — Safari iOS, qui ignore le premier.
 *
 *   3. `?app=1` dans l'URL — le manifeste lance l'application sur cette adresse.
 *      C'est le signal le plus fiable : il ne dépend d'aucune détection du
 *      navigateur. Une fois vu, on le mémorise, sinon il serait perdu à la
 *      première navigation interne.
 *
 * Le repère mémorisé peut être effacé en ouvrant `?app=0`, utile pour comparer
 * les deux apparences sans désinstaller quoi que ce soit.
 */
const STORAGE_KEY = "los-display-app";

export function PwaSurface() {
  useEffect(() => {
    const root = document.documentElement;

    // Une fenêtre installée ne se déclare pas toujours « standalone » : selon
    // le système et le navigateur elle peut être en minimal-ui, en plein écran,
    // ou en window-controls-overlay (barre de titre fusionnée, cas courant sur
    // Windows). Ne tester que « standalone » laissait passer ces fenêtres —
    // c'était le trou : le CSS couvrait plusieurs modes, pas le JavaScript.
    const MODES = ["standalone", "minimal-ui", "fullscreen", "window-controls-overlay"];
    const queries = MODES.map((m) => window.matchMedia(`(display-mode: ${m})`));

    // Safari iOS expose ce booléen non standard, absent des types DOM.
    const iosStandalone = () =>
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    // Bascule manuelle : ?app=1 pour forcer, ?app=0 pour revenir au site.
    const param = new URLSearchParams(window.location.search).get("app");
    if (param === "1") {
      try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* mode privé */ }
    } else if (param === "0") {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* mode privé */ }
    }

    const remembered = () => {
      try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
    };

    const apply = () => {
      const installed = queries.some((q) => q.matches) || iosStandalone() || remembered();
      if (installed) root.setAttribute("data-display", "app");
      else root.removeAttribute("data-display");
    };

    apply();

    // L'utilisateur peut installer l'app en cours de session, ou passer d'une
    // fenêtre installée à un onglet.
    queries.forEach((q) => q.addEventListener("change", apply));
    return () => queries.forEach((q) => q.removeEventListener("change", apply));
  }, []);

  return null;
}
