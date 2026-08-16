/**
 * Les deux URL du panel, nommées par leur DESTINATAIRE.
 *
 * Le projet mélangeait quatre variables (`PANEL_BASE_URL`, `INGEST_BASE_URL`,
 * `PANEL_URL`, `NEXTAUTH_URL`) avec des ordres de priorité différents d'un
 * fichier à l'autre. Résultat : des liens « Voir sur le panel » postés dans
 * Discord pointant sur `http://127.0.0.1:3000`, donc inutilisables.
 *
 * PIÈGE À CONNAÎTRE : `INGEST_BASE_URL` ne désigne pas la même machine des
 * deux côtés.
 *   - côté worker : c'est l'adresse interne du PANEL   (127.0.0.1:3000)
 *   - côté panel  : c'est l'adresse interne du WORKER  (127.0.0.1:3001)
 * D'où ce module côté worker, et son jumeau côté panel.
 */

const DEFAULT_INTERNAL = "http://127.0.0.1:3000";
const DEFAULT_PUBLIC = "https://losesperados.fr";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function isInternalAddress(url: string): boolean {
  return /(^|\/\/)(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(:|\/|$)/.test(url);
}

/**
 * Adresse interne du panel : appels techniques worker → panel.
 *
 * À utiliser pour tout `fetch` vers `/api/...`. Ne doit JAMAIS servir à
 * construire un lien affiché à un humain.
 */
export function getInternalPanelUrl(): string {
  const value = trimTrailingSlash(String(process.env.INGEST_BASE_URL ?? "").trim());
  return value || DEFAULT_INTERNAL;
}

/**
 * URL publique du panel : liens cliqués par un humain (Discord, DM, embeds).
 *
 * Garde-fou volontaire : si la valeur configurée est une adresse interne, on
 * la REFUSE et on retombe sur le domaine public. Un lien cassé posté à des
 * centaines de membres coûte plus cher qu'une variable mal réglée, et le
 * contrôle de démarrage signale déjà l'incohérence.
 */
export function getPublicPanelUrl(): string {
  const candidates = [process.env.PANEL_BASE_URL, process.env.NEXTAUTH_URL];

  for (const candidate of candidates) {
    const value = trimTrailingSlash(String(candidate ?? "").trim());
    if (!value) continue;
    if (isInternalAddress(value)) {
      console.warn(
        `[urls] valeur interne ignorée pour une URL publique : "${value}". ` +
        `Repli sur ${DEFAULT_PUBLIC}. Corriger PANEL_BASE_URL.`
      );
      continue;
    }
    return value;
  }

  return DEFAULT_PUBLIC;
}

/** Construit un lien public vers un chemin du panel. */
export function buildPublicPanelLink(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getPublicPanelUrl()}${normalized}`;
}
