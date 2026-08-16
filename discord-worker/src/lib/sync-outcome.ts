/**
 * Lecture du résultat d'un cron de synchronisation LYG côté panel.
 *
 * Les routes `/api/cron/*-auto-sync` renvoient un `ControlledSyncResult` et
 * répondent **200 dans les deux cas** : synchronisation réellement effectuée,
 * ou volontairement ignorée par une garde (intervalle minimal, backoff, verrou
 * déjà pris). Le worker journalisait donc « ok » à l'identique dans les deux
 * situations.
 *
 * Conséquence constatée en production : `SyncState` figé pendant 33 min alors
 * que les logs affichaient quatre `ok { status: 200 }` d'affilée — impossible
 * de distinguer un fonctionnement nominal d'une panne sans requêter la base.
 *
 * Le champ discriminant existe déjà dans la réponse : `reason` n'est présent
 * que sur les chemins qui n'ont rien exécuté.
 */

export type SyncOutcomeLabel = "SYNC" | "SKIP" | "UNKNOWN";

export type SyncOutcome = {
  /** Étiquette destinée au log, immédiatement lisible dans journalctl. */
  label: SyncOutcomeLabel;
  /** Motif du saut (`RATE_LIMIT`, `BACKOFF`, `LOCKED`) ; absent sur un vrai run. */
  reason?: string;
  /** Durée rapportée par le runner, utile pour repérer une synchro qui s'allonge. */
  durationMs?: number;
};

/**
 * Classe le corps de réponse d'un cron de synchronisation.
 *
 * `UNKNOWN` est renvoyé quand le corps n'a pas la forme attendue : mieux vaut
 * l'afficher tel quel que d'affirmer à tort qu'une synchronisation a eu lieu —
 * c'est précisément l'erreur que ce module corrige.
 */
export function readSyncOutcome(bodyText: string): SyncOutcome {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return { label: "UNKNOWN" };
  }

  if (!parsed || typeof parsed !== "object") return { label: "UNKNOWN" };

  const body = parsed as { reason?: unknown; durationMs?: unknown };
  const durationMs = typeof body.durationMs === "number" ? body.durationMs : undefined;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";

  if (reason) return { label: "SKIP", reason, durationMs };
  return { label: "SYNC", durationMs };
}
