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

/** Une ligne « libellé → valeur » de la description, façon `ticketLogEmbed`. */
export type AlertLine = { label: string; value: string | null | undefined };

export interface AlertPayload {
  /** Clé de déduplication (throttle). Si même clé < 60s, l'alerte est skippée. */
  key: string;
  severity: AlertSeverity;
  /** Titre court (≤ 80 chars conseillé). */
  title: string;
  /** Détails libres (JSON-stringifiés dans le webhook). */
  fields?: Record<string, unknown>;
  /**
   * Rendu moderne, opt-in : les informations partent en DESCRIPTION, une ligne
   * `**Libellé** · valeur` chacune, au lieu des champs encadrés de blocs de code.
   *
   * Pourquoi une option plutôt qu'un remplacement : `fields` sert encore aux
   * appelants non convertis (mémoire, sync stalled, DB injoignable). Tant qu'ils
   * n'ont pas migré, leur rendu doit rester strictement identique.
   *
   * Dès que `lines` est fourni, `fields` est ignoré et l'embed bascule sur le
   * style maison — titre nu, couleur porteuse de sens, pied de page dédié.
   */
  lines?: (AlertLine | null | undefined | false)[];
  /** Couleur explicite. Par défaut, dérivée de `severity`. */
  color?: number;
  /** Pied de page. Par défaut, la signature historique du module. */
  footer?: string;
}

const DEFAULT_FOOTER = "Los Esperados — Panel";

/**
 * Filtre les lignes vides pour ne jamais afficher un libellé sans valeur.
 * Même contrat que `renderLines` de `ticketLogEmbed.ts`.
 */
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
  const description = payload.lines ? renderLines(payload.lines) : "";
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: payload.severity === "info" ? "info" : payload.severity === "warn" ? "warn" : "error",
    event: "alert",
    severity: payload.severity,
    key: payload.key,
    title: payload.title,
    fields: payload.fields ?? {},
    // Sans webhook configuré, ce log est la SEULE trace : les lignes doivent y
    // figurer, sinon migrer un appelant vers `lines` viderait son log.
    // Absent quand l'appelant n'a pas migré, pour ne pas changer sa forme.
    ...(description ? { lines: description } : {}),
    sentToWebhook: Boolean(webhookUrl),
  };
  console.log(JSON.stringify(logEntry));

  if (!webhookUrl) {
    return; // fallback log-only — variable pas encore configurée
  }

  try {
    // Deux rendus, choisis par la présence de `lines`.
    //
    // Le titre en est le meilleur révélateur : le style historique préfixe
    // `[ERROR]`, ce qui répète la couleur de la barre. Le style moderne s'en
    // passe. On ne peut donc pas retirer le préfixe globalement sans changer le
    // rendu des appelants non migrés — d'où la bascule complète, pas un réglage
    // champ par champ.
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
