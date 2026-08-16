/**
 * Description sûre d'une URL de connexion PostgreSQL, pour les journaux.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE
 * ────────────────────────────────────────────────────────────────────────────
 * Le log de démarrage de `auth.ts` découpait `DATABASE_URL` à la main :
 *
 *     dbUrl.match(/\/([^?]+)(\?|$)/)     // nom de la base
 *     dbUrl.match(/@([^/]+)/)            // hôte
 *
 * Les deux sont faux, et le premier dangereusement :
 *
 * · La regex du NOM DE BASE part du premier `/` — celui de `postgresql://` —
 *   et capture gloutonnement jusqu'au `?`. Sur
 *   `postgresql://user:motdepasse@127.0.0.1:5434/panel_db?schema=public`
 *   elle rend `/user:motdepasse@127.0.0.1:5434/panel_db`, soit le mot de passe
 *   en clair, alors même que la ligne voisine prenait soin de masquer l'URL.
 *
 * · La regex de l'HÔTE s'arrête au premier `@`. Un mot de passe contenant un
 *   `@` — parfaitement légal — décale l'hôte d'autant.
 *
 * L'analyseur d'URL de la plateforme sait faire les deux correctement, y compris
 * sur un schéma non standard comme `postgresql:`. On s'appuie sur lui.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * GARANTIE
 * ────────────────────────────────────────────────────────────────────────────
 * Aucun champ renvoyé ne contient jamais le mot de passe :
 * · `database` provient de `pathname`, situé APRÈS les identifiants ;
 * · `host` provient de `host`, qui les exclut par construction ;
 * · `url` est réécrite depuis les composants, mot de passe remplacé.
 *
 * Une URL illisible ne ressort pas telle quelle : elle pourrait contenir le
 * secret sans que l'analyseur ait su l'isoler.
 */

export type DatabaseUrlDescription = {
  /** Hôte et port, sans identifiants. `unknown` si indéterminable. */
  host: string;
  /** Nom de la base SEUL. `unknown` si indéterminable. */
  database: string;
  /** URL réécrite, mot de passe remplacé par `***`. */
  url: string;
};

const UNKNOWN: DatabaseUrlDescription = {
  host: "unknown",
  database: "unknown",
  url: "",
};

export function describeDatabaseUrl(raw: string | null | undefined): DatabaseUrlDescription {
  const value = (raw ?? "").trim();
  if (!value) return { ...UNKNOWN };

  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    // Volontairement PAS `url: value` : une chaîne que l'analyseur refuse peut
    // très bien porter le mot de passe, sans qu'on sache où il commence.
    return { ...UNKNOWN, url: "(illisible)" };
  }

  const host = parsed.host || "unknown";

  // `pathname` commence après l'hôte : les identifiants ne peuvent pas s'y
  // trouver. On retire le `/` de tête ; le reste est le nom de la base.
  const rawDatabase = parsed.pathname.replace(/^\/+/, "");
  let database = rawDatabase;
  try {
    database = decodeURIComponent(rawDatabase);
  } catch {
    // Séquence d'échappement invalide : la forme brute reste sûre.
  }

  if (parsed.password) parsed.password = "***";

  return {
    host,
    database: database || "unknown",
    url: parsed.toString(),
  };
}
