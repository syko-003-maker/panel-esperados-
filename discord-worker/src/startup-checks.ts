/**
 * Contrôle de configuration au démarrage du worker.
 *
 * Pourquoi ce fichier existe : la quasi-totalité des fonctionnalités du worker
 * est gardée par un `if (process.env.X)`. Une variable absente ne provoque
 * aucune erreur — elle éteint la fonctionnalité, sans bruit. Trois pannes
 * réelles sont passées inaperçues des mois pour cette raison :
 *
 *   - PANEL_BASE_URL absent  → tous les liens « Voir sur le panel » postés
 *                              dans Discord pointaient sur http://127.0.0.1:3000
 *   - DISCORD_LOGS_CHANNEL_ID absent → les warns LYG ingérés n'étaient jamais
 *                              postés dans Discord
 *   - DISCORD_WORKER_SECRET absent côté panel → le sync de rôles répondait 500
 *
 * On ne cherche donc PAS à faire échouer le boot (le worker doit tourner même
 * partiellement configuré) : on rend l'état visible. Ce qui est éteint est
 * annoncé comme éteint, avec sa conséquence.
 */

type FeatureCheck = {
  /** Nom lisible de la fonctionnalité. */
  feature: string;
  /** Variables nécessaires. Toutes doivent être présentes. */
  vars: string[];
  /** Ce qui ne marche pas quand elles manquent. */
  impact: string;
};

const FEATURES: FeatureCheck[] = [
  {
    feature: "Poller warns LYG",
    vars: ["LYG_TOKEN"],
    impact: "aucun warn in-game n'est ingéré ni notifié",
  },
  {
    feature: "Logs de warns dans Discord",
    vars: ["DISCORD_LOGS_CHANNEL_ID"],
    impact: "les warns ingérés ne sont postés dans aucun salon",
  },
  {
    feature: "Liens panel dans Discord",
    vars: ["PANEL_BASE_URL"],
    impact: "les liens postés retombent sur l'URL interne, inutilisables depuis Discord",
  },
  {
    feature: "Salon des suggestions",
    vars: ["SUGGESTIONS_CHANNEL_ID"],
    impact: "les suggestions du site ne sont pas relayées dans Discord",
  },
  {
    feature: "Clash IA du bot",
    vars: ["GROQ_API_KEY"],
    impact: "le bot ne répond plus aux provocations (retombe en mode muet)",
  },
  {
    feature: "Assistant règlement",
    vars: ["GEMINI_API_KEY"],
    impact: "la commande /reglement ne peut pas répondre",
  },
  {
    feature: "Notifications push",
    vars: ["VAPID_PRIVATE_KEY", "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "VAPID_SUBJECT"],
    impact: "aucune notification push n'est envoyée aux membres",
  },
  {
    feature: "Webhook d'alerte technique",
    vars: ["DISCORD_ALERT_WEBHOOK_URL"],
    impact: "les incidents du worker ne remontent nulle part",
  },
];

function isLoopback(url: string): boolean {
  return /(^|\/\/)(127\.0\.0\.1|localhost|0\.0\.0\.0)(:|\/|$)/.test(url);
}

/**
 * Incohérences : la variable est là, mais sa valeur ne peut pas faire le
 * travail attendu. C'est le cas le plus vicieux — rien ne manque, tout est
 * « configuré », et pourtant le résultat est faux.
 */
function collectIncoherences(): string[] {
  const problems: string[] = [];

  const publicUrl = process.env.PANEL_BASE_URL ?? "";
  const internalUrl = process.env.INGEST_BASE_URL ?? "";

  if (publicUrl && isLoopback(publicUrl)) {
    problems.push(
      `PANEL_BASE_URL="${publicUrl}" est une adresse locale : les liens postés dans ` +
      `Discord seront inutilisables pour les membres. Attendu : l'URL publique du site.`
    );
  }
  if (internalUrl && !isLoopback(internalUrl)) {
    problems.push(
      `INGEST_BASE_URL="${internalUrl}" n'est pas une adresse locale : les appels ` +
      `internes du worker vers le panel dépendront du DNS, de nginx et du TLS ` +
      `pour rien. Attendu : http://127.0.0.1:<port>.`
    );
  }
  for (const [name, value] of [["PANEL_BASE_URL", publicUrl], ["INGEST_BASE_URL", internalUrl]]) {
    if (value.includes("losesperados.xyz")) {
      problems.push(`${name} pointe encore sur l'ancien domaine losesperados.xyz.`);
    }
  }

  // Les deux secrets coexistent (le worker envoie l'un ou l'autre selon les
  // chemins). S'ils diffèrent, une moitié des appels sera rejetée en 401 —
  // et seulement une moitié, ce qui est particulièrement dur à diagnostiquer.
  const ingestSecret = (process.env.INGEST_SECRET ?? "").trim();
  const workerSecret = (process.env.DISCORD_WORKER_SECRET ?? "").trim();
  if (ingestSecret && workerSecret && ingestSecret !== workerSecret) {
    problems.push(
      "INGEST_SECRET et DISCORD_WORKER_SECRET ont des valeurs DIFFÉRENTES : " +
      "selon le chemin de code, le panel refusera l'un des deux (401)."
    );
  }

  return problems;
}

/**
 * Affiche l'état de configuration. N'interrompt jamais le boot : les variables
 * réellement vitales sont traitées par validateEnv(), qui sort en erreur.
 */
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
  if (active.length) {
    console.log(`[CONFIG] actives : ${active.join(", ")}`);
  }

  for (const item of disabled) {
    console.warn(
      `[CONFIG] ÉTEINT — ${item.feature} : ${item.missing.join(", ")} manquant(e) ` +
      `→ ${item.impact}`
    );
  }
  for (const problem of incoherences) {
    console.error(`[CONFIG] INCOHÉRENT — ${problem}`);
  }

  // Ligne machine, pour grep/alerting sans parser le texte ci-dessus.
  console.log(JSON.stringify({
    event: "config_report",
    activeCount: active.length,
    totalCount: FEATURES.length,
    disabled: disabled.map((d) => ({ feature: d.feature, missing: d.missing })),
    incoherences,
    timestamp: new Date().toISOString(),
  }));
}
