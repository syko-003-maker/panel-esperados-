/**
 * Sentry init — worker side.
 * No-op si SENTRY_DSN absent : permet de garder l'init systématique
 * sans casser le worker quand le DSN n'est pas configuré.
 */

let initialized = false;
let SentryRef: typeof import("@sentry/node") | null = null;

export async function initSentry(): Promise<void> {
  if (initialized) return;
  initialized = true;

  const dsn = process.env.SENTRY_DSN?.trim();
  if (!dsn) {
    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "sentry_skipped",
      reason: "SENTRY_DSN_not_set",
    }));
    return;
  }

  try {
    // Import dynamique : si le pkg n'est pas installé, on log et continue
    const Sentry = await import("@sentry/node");
    SentryRef = Sentry;

    Sentry.init({
      dsn,
      environment: process.env.NODE_ENV ?? "production",
      tracesSampleRate: 0.1,
      release: process.env.npm_package_version ?? "unknown",
    });

    // Capture global des uncaughtException + unhandledRejection
    process.on("uncaughtException", (err) => {
      try { Sentry.captureException(err); } catch { /* noop */ }
    });
    process.on("unhandledRejection", (reason) => {
      try { Sentry.captureException(reason instanceof Error ? reason : new Error(String(reason))); } catch { /* noop */ }
    });

    console.log(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "info",
      event: "sentry_initialized",
      env: process.env.NODE_ENV ?? "production",
    }));
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "sentry_init_failed",
      error: err instanceof Error ? err.message : String(err),
    }));
  }
}

export function captureException(err: unknown): void {
  if (!SentryRef) return;
  try { SentryRef.captureException(err); } catch { /* noop */ }
}
