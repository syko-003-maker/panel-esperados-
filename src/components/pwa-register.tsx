"use client";

import { useEffect } from "react";

/** Clé de garde : un seul rechargement automatique par session, jamais de boucle. */
const RELOAD_GUARD = "los-chunk-reload";

/**
 * Enregistre le service worker (PWA). Silencieux si non supporté.
 *
 * Filet de sécurité en plus : si un chunk JS ne se charge pas, la page reste
 * affichée mais morte — aucun clic ne répond, car React n'a jamais hydraté.
 * C'est ce qui arrivait dans l'application installée quand un HTML mis en cache
 * référençait des fichiers supprimés par un déploiement.
 *
 * Le service worker ne met plus rien en cache, mais un HTML obsolète peut aussi
 * venir d'un cache HTTP ou d'un onglet resté ouvert pendant un déploiement. On
 * recharge donc une fois, en vidant les caches au passage. La clé de session
 * empêche toute boucle si le problème vient d'ailleurs.
 */
export default function PWARegister() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }

    async function recoverFromDeadPage() {
      try {
        if (sessionStorage.getItem(RELOAD_GUARD)) return;
        sessionStorage.setItem(RELOAD_GUARD, "1");
        if ("caches" in window) {
          const names = await caches.keys();
          await Promise.all(names.map((n) => caches.delete(n)));
        }
      } catch {
        // storage indisponible (navigation privée) : on recharge quand même
      }
      location.reload();
    }

    /** Un chunk manquant se signale par une erreur de chargement de ressource. */
    function onError(event: ErrorEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.tagName === "SCRIPT" || target?.tagName === "LINK") {
        void recoverFromDeadPage();
      }
    }

    function onRejection(event: PromiseRejectionEvent) {
      const msg = String(event.reason?.message ?? event.reason ?? "");
      if (/Loading chunk|ChunkLoadError|Failed to fetch dynamically imported/i.test(msg)) {
        void recoverFromDeadPage();
      }
    }

    // capture: true — une erreur de chargement de ressource ne remonte pas.
    addEventListener("error", onError, true);
    addEventListener("unhandledrejection", onRejection);
    return () => {
      removeEventListener("error", onError, true);
      removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
