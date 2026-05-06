/**
 * Alerts module — panel side.
 * Envoie une alerte sur le webhook Discord configuré (DISCORD_ALERT_WEBHOOK_URL).
 * Si la variable n'est pas définie : log JSON seulement (fallback no-op réseau).
 *
 * Throttling interne : max 1 alerte par minute par clé pour éviter le spam
 * (utile pour les watchers en boucle sur un même incident).
 */

type AlertSeverity = "info" | "warn" | "error" | "critical";

const lastSentAt = new Map<string, number>();
const MIN_INTERVAL_MS = 60_000;

const SEV_COLOR: Record<AlertSeverity, number> = {
  info: 0x3b82f6,      // blue
  warn: 0xf59e0b,      // amber
  error: 0xdc2626,     // red
  critical: 0x991b1b,  // dark red
};

export interface AlertPayload {
  /** Clé de déduplication (throttle). Si même clé < 60s, l'alerte est skippée. */
  key: string;
  severity: AlertSeverity;
  /** Titre court (≤ 80 chars conseillé). */
  title: string;
  /** Détails libres (JSON-stringifiés dans le webhook). */
  fields?: Record<string, unknown>;
}

/**
 * Envoie une alerte Discord (ou log seulement si pas de webhook configuré).
 * Ne lance jamais d'exception : un échec d'alerte ne doit pas casser le caller.
 */
export async function sendDiscordAlert(payload: AlertPayload): Promise<void> {
  const now = Date.now();
  const last = lastSentAt.get(payload.key) ?? 0;
  if (now - last < MIN_INTERVAL_MS) {
    return; // throttle
  }
  lastSentAt.set(payload.key, now);

  const webhookUrl = process.env.DISCORD_ALERT_WEBHOOK_URL?.trim();
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: payload.severity === "info" ? "info" : payload.severity === "warn" ? "warn" : "error",
    event: "alert",
    severity: payload.severity,
    key: payload.key,
    title: payload.title,
    fields: payload.fields ?? {},
    sentToWebhook: Boolean(webhookUrl),
  };
  console.log(JSON.stringify(logEntry));

  if (!webhookUrl) {
    return; // fallback log-only — variable pas encore configurée
  }

  try {
    const fields = payload.fields
      ? Object.entries(payload.fields).slice(0, 10).map(([name, value]) => ({
          name: String(name).slice(0, 256),
          value: ("```" + JSON.stringify(value).slice(0, 1000) + "```"),
          inline: false,
        }))
      : [];

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        embeds: [
          {
            title: `[${payload.severity.toUpperCase()}] ${payload.title}`.slice(0, 256),
            color: SEV_COLOR[payload.severity],
            fields,
            timestamp: new Date().toISOString(),
            footer: { text: "Los Esperados — Panel" },
          },
        ],
      }),
    });
  } catch (err) {
    // Ne pas crasher l'appelant si Discord ne répond pas
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "alert_webhook_failed",
      key: payload.key,
      error: err instanceof Error ? err.message : String(err),
    }));
  }
}
