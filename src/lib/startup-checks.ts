/**
 * Contrôle de configuration au démarrage du panel.
 *
 * Même raison d'être que `discord-worker/src/startup-checks.ts` : côté panel
 * aussi, une variable absente n'échoue pas — elle éteint une fonctionnalité
 * en silence. Deux cas constatés :
 *
 *   - DISCORD_WORKER_SECRET absent → /api/discord/members répondait 500 à
 *     chaque appel du worker (sync de rôles), sans que rien ne le signale.
 *   - SANCTION_LOG_CHANNEL_ID absent → l'escalade automatique des sanctions
 *     sautait l'envoi Discord, et le bouton « Réessayer » renvoyait 500.
 *
 * Ce rapport est purement informatif : il n'interrompt jamais le démarrage.
 */

type FeatureCheck = {
  feature: string;
  vars: string[];
  impact: string;
};

const FEATURES: FeatureCheck[] = [
  {
    feature: "Sync de rôles Discord (endpoint worker)",
    vars: ["DISCORD_WORKER_SECRET"],
    impact: "/api/discord/members répond 500 : le worker ne peut plus lire les membres",
  },
  {
    feature: "Logs de sanctions",
    vars: ["SANCTION_LOG_CHANNEL_ID"],
    impact: "les sanctions automatiques ne sont pas postées et le bouton « Réessayer » échoue",
  },
  {
    feature: "Appels sortants vers le worker",
    vars: ["INGEST_BASE_URL", "INGEST_SECRET"],
    impact: "le panel ne peut pas déclencher les actions Discord",
  },
  {
    feature: "Synchronisation LYG",
    vars: ["LYG_TOKEN", "LYG_BASE_URL"],
    impact: "plus aucune donnée de jeu (membres, playtime, banque) n'est rafraîchie",
  },
  {
    feature: "Notifications push",
    vars: ["VAPID_PRIVATE_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_SUBJECT"],
    impact: "aucune notification push n'est envoyée aux membres",
  },
  {
    feature: "Connexion Discord (OAuth)",
    vars: ["DISCORD_CLIENT_ID", "DISCORD_CLIENT_SECRET", "NEXTAUTH_URL", "NEXTAUTH_SECRET"],
    impact: "plus personne ne peut se connecter au site",
  },
];

function isLoopback(url: string): boolean {
  return /(^|\/\/)(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|\/|$)/.test(url);
}

function collectIncoherences(): string[] {
  const problems: string[] = [];

  // NEXTAUTH_URL sert de base aux liens envoyés aux humains (mails, embeds,
  // redirections OAuth). Une valeur locale casse la connexion en production.
  const publicUrl = process.env.NEXTAUTH_URL ?? "";
  if (publicUrl && isLoopback(publicUrl) && process.env.NODE_ENV === "production") {
    problems.push(
      `NEXTAUTH_URL="${publicUrl}" est une adresse locale en production : ` +
      `la connexion Discord et les liens envoyés aux membres seront cassés.`
    );
  }

  // Le worker envoie DISCORD_WORKER_SECRET quand il existe, sinon INGEST_SECRET.
  // Deux valeurs différentes ici = une partie des appels rejetée en 401.
  const ingestSecret = (process.env.INGEST_SECRET ?? "").trim();
  const workerSecret = (process.env.DISCORD_WORKER_SECRET ?? "").trim();
  if (ingestSecret && workerSecret && ingestSecret !== workerSecret) {
    problems.push(
      "INGEST_SECRET et DISCORD_WORKER_SECRET diffèrent : selon le chemin de code, " +
      "le worker sera refusé (401). Les deux doivent porter la même valeur."
    );
  }

  return problems;
}

/** Écrit le rapport dans les logs du service. N'interrompt jamais le boot. */
export function reportFeatureConfig(): void {
  const active: string[] = [];
  const disabled: Array<{ feature: string; missing: string[]; impact: string }> = [];

  for (const check of FEATURES) {
    const missing = check.vars.filter((name) => !String(process.env[name] ?? "").trim());
    if (missing.length === 0) {
      active.push(check.feature);
    } else {
      disabled.push({ feature: check.feature, missing, impact: check.impact });
    }
  }

  const incoherences = collectIncoherences();

  console.log(`[CONFIG] ${active.length}/${FEATURES.length} fonctionnalités actives`);
  for (const item of disabled) {
    console.warn(
      `[CONFIG] ÉTEINT — ${item.feature} : ${item.missing.join(", ")} manquant(e) ` +
      `→ ${item.impact}`
    );
  }
  for (const problem of incoherences) {
    console.error(`[CONFIG] INCOHÉRENT — ${problem}`);
  }

  console.log(JSON.stringify({
    event: "config_report",
    activeCount: active.length,
    totalCount: FEATURES.length,
    disabled: disabled.map((d) => ({ feature: d.feature, missing: d.missing })),
    incoherences,
    timestamp: new Date().toISOString(),
  }));
}
