// Service worker Los Esperados — installabilité PWA + résilience réseau.
// Stratégie simple : network-first, avec repli sur le cache pour la dernière
// navigation réussie (ne casse jamais l'auth/dynamique — pas de cache agressif).
const CACHE = "los-esperados-shell-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;

  // Navigations : réseau d'abord, repli cache si hors-ligne.
  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
          return res;
        })
        .catch(() => caches.match(req).then((r) => r || caches.match("/")))
    );
  }
});
