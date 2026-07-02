"use client";

import { useEffect, useState } from "react";
import { Bell, BellOff, BellRing, Loader2 } from "lucide-react";

/**
 * Bouton d'activation des notifications push (PWA). Demande la permission,
 * s'abonne via le service worker et enregistre l'abonnement côté serveur.
 * Sur iPhone, ne fonctionne que si le site est installé sur l'écran d'accueil.
 */

const VAPID_PUBLIC = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

export default function PushToggle() {
  const [supported, setSupported] = useState(true);
  const [subscribed, setSubscribed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    const ok = typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && !!VAPID_PUBLIC;
    setSupported(ok);
    if (!ok) return;
    navigator.serviceWorker.ready
      .then((reg) => reg.pushManager.getSubscription())
      .then((sub) => setSubscribed(!!sub))
      .catch(() => {});
  }, []);

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      // iPhone : le push n'existe QUE dans l'appli installée (écran d'accueil),
      // et seulement si elle a été ajoutée via Safari. Dans un onglet Safari
      // normal, l'API n'est même pas dispo → message clair plutôt qu'échec obscur.
      const ua = navigator.userAgent || "";
      const isIOS = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
      const isStandalone =
        window.matchMedia("(display-mode: standalone)").matches || (navigator as any).standalone === true;
      if (isIOS && !isStandalone) {
        setMsg("Sur iPhone : ouvre l'appli depuis son icône sur l'écran d'accueil (pas dans Safari), puis appuie sur Activer.");
        return;
      }
      if (!("PushManager" in window) || !("serviceWorker" in navigator)) {
        setMsg(isIOS ? "Ton iPhone doit être en iOS 16.4 ou plus récent pour les notifications." : "Ce navigateur ne supporte pas les notifications.");
        return;
      }
      if (!VAPID_PUBLIC) {
        setMsg("Configuration serveur manquante (VAPID) — préviens un Chef.");
        return;
      }

      const perm = await Notification.requestPermission();
      if (perm !== "granted") {
        setMsg(
          perm === "denied"
            ? "Notifications bloquées. Va dans Réglages iPhone → Notifications → Los Esperados pour les autoriser."
            : "Autorisation non accordée — réessaie."
        );
        return;
      }
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC) as BufferSource,
      });
      const res = await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subscription: sub }),
      });
      if (!res.ok) throw new Error("enregistrement serveur: HTTP " + res.status);
      setSubscribed(true);
      setMsg("✅ Notifications activées sur cet appareil.");
    } catch (e: unknown) {
      // On expose la vraie erreur (nom + message) pour pouvoir diagnostiquer.
      const err = e as { name?: string; message?: string };
      const detail = err?.name ? `${err.name}${err.message ? " — " + err.message : ""}` : String(e);
      setMsg("Échec de l'activation : " + detail);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setMsg(null);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) {
        await fetch("/api/push/subscribe", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
        await sub.unsubscribe().catch(() => {});
      }
      setSubscribed(false);
      setMsg("Notifications désactivées sur cet appareil.");
    } finally {
      setBusy(false);
    }
  }

  async function test() {
    setBusy(true);
    try {
      await fetch("/api/push/test", { method: "POST" });
      setMsg("Notification de test envoyée 🔔");
    } finally {
      setBusy(false);
    }
  }

  if (!supported) return null;

  return (
    <div className="rounded-2xl border border-amber-500/20 bg-white/[0.02] p-4 backdrop-blur-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border ${subscribed ? "border-emerald-500/30 bg-emerald-500/10" : "border-amber-500/25 bg-amber-500/10"}`}>
            {subscribed ? <BellRing className="h-4 w-4 text-emerald-300" /> : <Bell className="h-4 w-4 text-amber-300" />}
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-50">Notifications</p>
            <p className="text-[11px] text-slate-400">
              {subscribed ? "Activées sur cet appareil." : "Sois alerté des sanctions, réunions et validations."}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {subscribed ? (
            <>
              <button onClick={test} disabled={busy}
                className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/[0.08] disabled:opacity-50">
                Tester
              </button>
              <button onClick={disable} disabled={busy} aria-label="Désactiver"
                className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-semibold text-slate-400 hover:bg-white/[0.08] disabled:opacity-50">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellOff className="h-3.5 w-3.5" />}
              </button>
            </>
          ) : (
            <button onClick={enable} disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-2 text-sm font-semibold text-amber-200 hover:bg-amber-500/25 disabled:opacity-50">
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />}
              Activer
            </button>
          )}
        </div>
      </div>
      {msg && <p className="mt-2.5 text-[11px] text-slate-400">{msg}</p>}
    </div>
  );
}
