"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Notifications natives + indicateur de connexion pour l'appli desktop (Electron).
 *
 * Ne s'active QUE dans l'appli (UA contenant "LosEsperadosApp") — no-op dans un
 * navigateur normal (le web push suffit). Sonde /api/me/notifications/recent
 * toutes les 15 s et affiche des notifs natives (clic → bonne page). Affiche un
 * petit badge « Connecté » + un bouton « Tester » pour prouver que l'appli parle
 * directement au serveur, sans dépendre du push d'Apple/Google.
 */
export default function DesktopNotify() {
  const [isApp, setIsApp] = useState(false);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const sinceRef = useRef<number | null>(null);
  const stoppedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  async function pollOnce() {
    try {
      const url =
        sinceRef.current == null
          ? "/api/me/notifications/recent"
          : `/api/me/notifications/recent?since=${sinceRef.current}`;
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) {
        setConnected(false);
        return;
      }
      const data = await res.json();
      setConnected(true);
      if (typeof data.now === "number") sinceRef.current = data.now;
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
    } catch {
      setConnected(false);
    }
  }

  function scheduleLoop() {
    if (stoppedRef.current) return;
    timerRef.current = setTimeout(async () => {
      await pollOnce();
      scheduleLoop();
    }, 15_000);
  }

  useEffect(() => {
    if (typeof navigator === "undefined") return;
    if (!/LosEsperadosApp/i.test(navigator.userAgent)) return; // appli desktop uniquement
    setIsApp(true);
    try {
      if ("Notification" in window && Notification.permission === "default") {
        void Notification.requestPermission();
      }
    } catch {
      /* ignore */
    }
    stoppedRef.current = false;
    void pollOnce().then(scheduleLoop);
    return () => {
      stoppedRef.current = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  async function test() {
    setBusy(true);
    try {
      await fetch("/api/me/notifications/test", { method: "POST" }).catch(() => {});
      // Laisse le serveur publier, puis sonde tout de suite (sans attendre 15 s).
      setTimeout(() => void pollOnce(), 700);
    } finally {
      setTimeout(() => setBusy(false), 1000);
    }
  }

  if (!isApp) return null;

  const dot = connected ? "#34d399" : connected === false ? "#f87171" : "#fbbf24";
  const label = connected ? "Connecté au serveur" : connected === false ? "Hors ligne" : "Connexion…";

  return (
    <div style={{ position: "fixed", right: 14, bottom: 14, zIndex: 2147483000 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "6px 10px 6px 12px",
          borderRadius: 9999,
          border: "1px solid rgba(255,255,255,0.12)",
          background: "rgba(6,4,6,0.82)",
          backdropFilter: "blur(8px)",
          color: "#e2e8f0",
          font: "600 12px/1 system-ui, sans-serif",
          boxShadow: "0 8px 24px rgba(0,0,0,0.5)",
        }}
      >
        <span style={{ width: 8, height: 8, borderRadius: 9999, background: dot }} />
        <span>{label}</span>
        <button
          onClick={test}
          disabled={busy}
          style={{
            marginLeft: 4,
            padding: "3px 10px",
            borderRadius: 9999,
            border: "1px solid rgba(255,255,255,0.16)",
            background: "rgba(255,255,255,0.10)",
            color: "#fff",
            font: "600 12px/1 system-ui, sans-serif",
            cursor: busy ? "default" : "pointer",
            opacity: busy ? 0.5 : 1,
          }}
        >
          {busy ? "…" : "Tester"}
        </button>
      </div>
    </div>
  );
}
