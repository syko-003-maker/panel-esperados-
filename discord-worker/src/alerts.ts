/**
 * Alerts module — worker side.
 * Mêmes mécaniques que panel/src/lib/alerts.ts (throttle 1min/clé, fallback log-only).
 */

type AlertSeverity = "info" | "warn" | "error" | "critical";

const lastSentAt = new Map<string, number>();
const MIN_INTERVAL_MS = 60_000;

const SEV_COLOR: Record<AlertSeverity, number> = {
  info: 0x3b82f6,
  warn: 0xf59e0b,
  error: 0xdc2626,
  critical: 0x991b1b,
};

export interface AlertPayload {
  key: string;
  severity: AlertSeverity;
  title: string;
  fields?: Record<string, unknown>;
}

export async function sendDiscordAlert(payload: AlertPayload): Promise<void> {
  const now = Date.now();
  const last = lastSentAt.get(payload.key) ?? 0;
  if (now - last < MIN_INTERVAL_MS) return;
  lastSentAt.set(payload.key, now);

  const webhookUrl = process.env.DISCORD_ALERT_WEBHOOK_URL?.trim();

  // Log structuré (toujours)
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: payload.severity === "info" ? "info" : payload.severity === "warn" ? "warn" : "error",
    event: "alert",
    source: "worker",
    severity: payload.severity,
    key: payload.key,
    title: payload.title,
    fields: payload.fields ?? {},
    sentToWebhook: Boolean(webhookUrl),
  }));

  if (!webhookUrl) return;

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
            footer: { text: "Los Esperados — Worker" },
          },
        ],
      }),
    });
  } catch (err) {
    console.error(JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      event: "alert_webhook_failed",
      key: payload.key,
      error: err instanceof Error ? err.message : String(err),
    }));
  }
}
