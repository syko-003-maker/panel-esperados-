"use client";

import { useEffect } from "react";

/** Enregistre le service worker (PWA). Silencieux si non supporté. */
export default function PWARegister() {
  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => {});
    }
  }, []);
  return null;
}
