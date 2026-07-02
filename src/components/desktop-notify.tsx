"use client";

import { useEffect } from "react";

/**
 * Notifications natives pour l'appli desktop (Electron).
 *
 * Ne s'active QUE dans l'appli (détectée via le suffixe d'User-Agent
 * "LosEsperadosApp") — dans un navigateur normal, le web push s'en charge déjà,
 * donc ce composant est un no-op. Sonde /api/me/notifications/recent toutes les
 * 15 s et affiche une notification native ; le clic ouvre la bonne page.
 */
export default function DesktopNotify() {
  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!/LosEsperadosApp/i.test(navigator.userAgent)) return; // appli desktop uniquement

    try {
      if ("Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch {
      /* ignore */
    }

    let since: number | null = null; // null = synchro initiale (pas de rejeu)
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const url =
          since == null
            ? "/api/me/notifications/recent"
            : `/api/me/notifications/recent?since=${since}`;
        const res = await fetch(url, { cache: "no-store" });
        if (res.ok) {
          const data = await res.json();
          if (typeof data.now === "number") since = data.now;
          for (const it of data.items ?? []) {
            try {
              const n = new Notification(it.title, {
                body: it.body,
                tag: it.tag,
                icon: "/icons/icon-192.png",
                badge: "/icons/icon-192.png",
              });
              n.onclick = () => {
                window.focus();
                window.location.href = it.url || "/dashboard";
              };
            } catch {
              /* ignore */
            }
          }
        }
      } catch {
        /* réseau : on réessaie au prochain tour */
      }
      if (!stopped) timer = setTimeout(poll, 15_000);
    }

    poll();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, []);

  return null;
}
