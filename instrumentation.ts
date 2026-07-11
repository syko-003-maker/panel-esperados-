export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");

    // Les boucles qui tapent LYG (in-family, keepalive) ne tournent QU'EN
    // PROD : le dev server (next dev, port 3002) a un token placeholder et
    // martèlerait l'API pour rien (401) — et surtout, si un jour il recevait
    // le vrai token, il doublerait la conso du quota (aucun lock inter-process,
    // juste un flag par-process). On les cantonne donc à NODE_ENV=production.
    if (process.env.NODE_ENV === "production") {
      // Démarrer le loop "in-family" dès le boot du panel, sans attendre
      // qu'un utilisateur ouvre /staff. Garantit qu'on a tout de suite des
      // données fraîches sur qui est actif en métier famille.
      try {
        const { ensureInFamilyLoopStarted } = await import("@/lib/in-family-loop");
        ensureInFamilyLoopStarted();
      } catch (err) {
        console.error("[instrumentation] failed to start in-family loop:", err);
      }

      // Keep-alive du cookie families.lyg.fr : ping dashboard.php toutes les
      // 10 min pour maintenir la session PHP active. Évite au Chef famille
      // de re-coller le cookie périodiquement.
      try {
        const { ensureLygKeepaliveStarted } = await import("@/lib/lyg/family-keepalive");
        ensureLygKeepaliveStarted();
      } catch (err) {
        console.error("[instrumentation] failed to start lyg keepalive:", err);
      }
    }
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

export const onRequestError = async (
  error: Error & { digest?: string },
  request: {
    path: string;
    method: string;
    headers: Record<string, string>;
  },
  context: {
    routerKind: "Pages Router" | "App Router";
    routePath: string;
    routeType: "render" | "route" | "action" | "middleware";
    renderSource: "react-server-components" | "react-server-components-payload" | "server-rendering";
  }
) => {
  // Skip importing Sentry if DSN not configured
  if (!process.env.SENTRY_DSN) return;

  const Sentry = await import("@sentry/nextjs");

  Sentry.captureException(error, {
    extra: {
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
    },
    tags: {
      routePath: context.routePath,
      routeType: context.routeType,
    },
  });
};
