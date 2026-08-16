/**
 * Les URL du panel et du worker, nommées par leur DESTINATAIRE.
 *
 * Jumeau côté panel de `discord-worker/src/lib/urls.ts`.
 *
 * PIÈGE À CONNAÎTRE : `INGEST_BASE_URL` ne désigne pas la même machine des
 * deux côtés.
 *   - côté worker : adresse interne du PANEL   (127.0.0.1:3000)
 *   - côté panel  : adresse interne du WORKER  (127.0.0.1:3001)
 * C'est pourquoi les helpers portent ici le nom de leur cible, et non celui
 * de la variable d'environnement qui les alimente.
 */

const DEFAULT_PUBLIC = "https://losesperados.fr";
const DEFAULT_PANEL_INTERNAL = "http://127.0.0.1:3000";
const DEFAULT_WORKER_INTERNAL = "http://127.0.0.1:3001";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/+$/, "");
}

function isInternalAddress(url: string): boolean {
  return /(^|\/\/)(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])(:|\/|$)/.test(url);
}

/**
 * URL publique du panel : liens destinés à un humain (Discord, e-mails,
 * tickets, recrutement) et redirections OAuth.
 *
 * Refuse une adresse interne et retombe sur le domaine public : un lien
 * `127.0.0.1` envoyé à un membre est inutilisable.
 */
export function getPublicPanelUrl(): string {
  const candidates = [process.env.NEXTAUTH_URL, process.env.PANEL_BASE_URL];

  for (const candidate of candidates) {
    const value = trimTrailingSlash(String(candidate ?? "").trim());
    if (!value) continue;
    if (isInternalAddress(value)) {
      console.warn(
        `[urls] valeur interne ignorée pour une URL publique : "${value}". ` +
        `Repli sur ${DEFAULT_PUBLIC}. Corriger NEXTAUTH_URL.`
      );
      continue;
    }
    return value;
  }

  return DEFAULT_PUBLIC;
}

/**
 * Adresse interne du PANEL lui-même (appels boucle locale panel → panel).
 * `PANEL_INTERNAL_BASE_URL` existe déjà dans .env.prod à cet usage.
 */
export function getInternalPanelUrl(): string {
  const value = trimTrailingSlash(String(process.env.PANEL_INTERNAL_BASE_URL ?? "").trim());
  if (value) return value;
  const port = String(process.env.PORT ?? "3000").trim() || "3000";
  return `http://127.0.0.1:${port}`;
}

/**
 * Adresse interne du WORKER : appels techniques panel → worker.
 *
 * Distincte des deux précédentes — les confondre était précisément la source
 * du problème. `WORKER_INTERNAL_URL` d'abord, `INGEST_BASE_URL` ensuite (qui,
 * côté panel, pointe déjà sur le worker).
 */
export function getInternalWorkerUrl(): string {
  for (const candidate of [process.env.WORKER_INTERNAL_URL, process.env.INGEST_BASE_URL]) {
    const value = trimTrailingSlash(String(candidate ?? "").trim());
    if (value) return value;
  }
  return DEFAULT_WORKER_INTERNAL;
}

/** Construit un lien public vers un chemin du panel. */
export function buildPublicPanelLink(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  return `${getPublicPanelUrl()}${normalized}`;
}
