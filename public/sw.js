// Service worker Los Esperados — installabilité PWA + notifications push.
//
// ⚠️ PAS DE CACHE DE NAVIGATION. La version précédente mettait en cache chaque
// navigation réussie et servait ce HTML en repli au moindre incident réseau.
// Or le HTML de Next.js référence des chunks JS dont le nom change à chaque
// build : un HTML de la veille pointe vers des fichiers supprimés, React
// n'hydrate jamais, et la page s'affiche sans qu'aucun clic ne réponde.
// L'application installée gardant son cache entre les lancements, elle restait
// bloquée dans cet état alors que le site fonctionnait.
//
// Ce repli n'apportait rien : le panel exige une session et des données
// serveur, il est inutilisable hors ligne. On le retire donc plutôt que de
// tenter de le faire expirer — moins de code, plus rien à invalider.

const CACHE_PREFIX = "los-esperados-";

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Purge des caches laissés par les versions precedentes. C'est ce qui
      // debloque tout seul un client déjà coincé sur un HTML obsolète.
      const names = await caches.keys();
      await Promise.all(
        names.filter((n) => n.startsWith(CACHE_PREFIX)).map((n) => caches.delete(n)),
      );
      await self.clients.claim();
    })(),
  );
});

// ── Notifications push (Web Push) ────────────────────────────────────────────
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data && event.data.text ? event.data.text() : "" }; }
  const title = data.title || "Los Esperados";
  const options = {
    body: data.body || "",
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: data.tag || undefined,
    data: { url: data.url || "/" },
  };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
      for (const c of list) { if ("focus" in c) { c.navigate(url); return c.focus(); } }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
