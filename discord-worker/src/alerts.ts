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

/** Une ligne « libellé → valeur » de la description, façon `ticketLogEmbed`. */
export type AlertLine = { label: string; value: string | null | undefined };

export interface AlertPayload {
  key: string;
  severity: AlertSeverity;
  title: string;
  fields?: Record<string, unknown>;
  /**
   * Rendu moderne, opt-in : les informations partent en DESCRIPTION, une ligne
   * `**Libellé** · valeur` chacune, au lieu des champs encadrés de blocs de code.
   *
   * `fields` reste le rendu des appelants non convertis : tant qu'ils n'ont pas
   * migré, leur embed doit rester strictement identique.
   */
  lines?: (AlertLine | null | undefined | false)[];
  /** Couleur explicite. Par défaut, dérivée de `severity`. */
  color?: number;
  /** Pied de page. Par défaut, la signature historique du module. */
  footer?: string;
}

const DEFAULT_FOOTER = "Los Esperados — Worker";

/** Filtre les lignes vides pour ne jamais afficher un libellé sans valeur. */
function renderLines(lines: (AlertLine | null | undefined | false)[]): string {
  return lines
    .filter((l): l is AlertLine => Boolean(l))
    .map((l) => {
      const v = String(l.value ?? "").trim();
      return v ? `**${l.label}** · ${v}` : null;
    })
    .filter(Boolean)
    .join("\n");
}

export async function sendDiscordAlert(payload: AlertPayload): Promise<void> {
  const now = Date.now();
  const last = lastSentAt.get(payload.key) ?? 0;
  if (now - last < MIN_INTERVAL_MS) return;
  lastSentAt.set(payload.key, now);

  const webhookUrl = process.env.DISCORD_ALERT_WEBHOOK_URL?.trim();
  const description = payload.lines ? renderLines(payload.lines) : "";

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
    // Sans webhook, ce log est la seule trace : les lignes doivent y figurer.
    ...(description ? { lines: description } : {}),
    sentToWebhook: Boolean(webhookUrl),
  }));

  if (!webhookUrl) return;

  try {
    // Deux rendus, choisis par la présence de `lines`. Le style historique
    // préfixe le titre de `[ERROR]` ; le style moderne s'en passe. D'où une
    // bascule complète plutôt qu'un réglage champ par champ.
    const embed = description
      ? {
          title: payload.title.slice(0, 256),
          description: description.slice(0, 4000),
          color: payload.color ?? SEV_COLOR[payload.severity],
          timestamp: new Date().toISOString(),
          footer: { text: payload.footer ?? DEFAULT_FOOTER },
        }
      : {
          title: `[${payload.severity.toUpperCase()}] ${payload.title}`.slice(0, 256),
          color: payload.color ?? SEV_COLOR[payload.severity],
          fields: payload.fields
            ? Object.entries(payload.fields).slice(0, 10).map(([name, value]) => ({
                name: String(name).slice(0, 256),
                value: ("```" + JSON.stringify(value).slice(0, 1000) + "```"),
                inline: false,
              }))
            : [],
          timestamp: new Date().toISOString(),
          footer: { text: payload.footer ?? DEFAULT_FOOTER },
        };

    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({ embeds: [embed] }),
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
