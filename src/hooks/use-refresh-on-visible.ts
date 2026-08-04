"use client";

import { useEffect, useRef } from "react";

/**
 * Rejoue un chargement quand l'écran redevient visible.
 *
 * POURQUOI
 * --------
 * Un `useEffect(..., [])` ne se rejoue qu'au montage. Sur le SITE ce n'est pas
 * gênant : on navigue, on rafraîchit, le composant se remonte et les données
 * sont fraîches. En mode APPLICATION installée, la page n'est jamais rechargée
 * — elle est mise en veille puis reprise. L'effet ne repart donc jamais et
 * l'écran reste figé sur les valeurs du jour où l'appli a été ouverte.
 *
 * C'est ce qui faisait dire « le playtime bouge sur le site mais pas sur
 * l'appli » : les deux lisaient la même API, seul le moment de l'appel
 * différait.
 *
 * On écoute `visibilitychange` (retour d'arrière-plan, cas normal en PWA) ET
 * `focus` (retour sur l'onglet côté navigateur).
 *
 * Le garde-fou `minIntervalMs` évite de rappeler l'API à chaque va-et-vient :
 * sans lui, alterner entre deux applis déclencherait une rafale de requêtes.
 */
export function useRefreshOnVisible(refresh: () => void, minIntervalMs = 30_000): void {
  // Refs : le callback change à chaque rendu, on ne veut pas réabonner pour
  // autant — sinon on retire et repose les écouteurs en boucle.
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const lastRunRef = useRef(Date.now());

  useEffect(() => {
    const maybeRefresh = () => {
      if (typeof document === "undefined") return;
      if (document.visibilityState !== "visible") return;

      const now = Date.now();
      if (now - lastRunRef.current < minIntervalMs) return;
      lastRunRef.current = now;
      refreshRef.current();
    };

    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, [minIntervalMs]);
}
