// Déclencheur automatique des rappels de dettes : le worker ping la route cron
// du panel toutes les X h. Le panel ne fait rien si `bankDebtAutoEnabled` est
// off (toggle dans la config Discord). Le cooldown PAR MEMBRE (en jours) est
// géré côté panel → on peut tourner souvent sans spammer.

// On vérifie toutes les 15 min : le cooldown est PAR MEMBRE et ancré à l'heure
// exacte du dernier rappel (lastRemindedAt + N jours), donc chaque membre est
// re-rappelé ~à la même heure qu'à l'origine (et jamais à minuit). Une vérif
// fréquente sert juste à ne pas envoyer en retard au prochain contrôle. Le cycle
// est quasi gratuit quand personne n'est dû (il n'envoie que si le cooldown est
// écoulé).
const DEFAULT_INTERVAL_MS = 15 * 60 * 1000; // 15 min

function getBaseUrl(): string {
  return String(process.env.INGEST_BASE_URL ?? "").replace(/\/+$/, "");
}

function getSecret(): string {
  return String(process.env.INGEST_SECRET ?? process.env.DISCORD_WORKER_SECRET ?? "").trim();
}

export function getDebtRemindersIntervalMs(): number {
  const parsed = Number(process.env.DEBT_REMINDERS_INTERVAL_MS);
  if (!Number.isFinite(parsed) || parsed < 300_000) return DEFAULT_INTERVAL_MS;
  return Math.floor(parsed);
}

let isRunning = false;

export async function runDebtRemindersJob(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const baseUrl = getBaseUrl();
    const secret = getSecret();
    if (!baseUrl || !secret) {
      console.warn("[DEBT_REMINDERS] skipped: missing INGEST_BASE_URL or INGEST_SECRET");
      return;
    }
    const res = await fetch(`${baseUrl}/api/cron/debt-reminders`, {
      method: "POST",
      headers: { "x-ingest-secret": secret },
    });
    const bodyText = await res.text().catch(() => "");
    if (!res.ok) {
      console.error("[DEBT_REMINDERS] failed", { status: res.status, body: bodyText.slice(0, 300) });
      return;
    }
    console.log("[DEBT_REMINDERS] ok", bodyText.slice(0, 200));
  } catch (error) {
    console.error("[DEBT_REMINDERS] exception", error instanceof Error ? error.message : String(error));
  } finally {
    isRunning = false;
  }
}
