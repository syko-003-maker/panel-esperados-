/**
 * Classification des erreurs de l'outbox + calcul du backoff.
 *
 * Avant : toute erreur mettait le job en FAILED définitivement. Un 429 Discord
 * ou une coupure réseau tuait donc le message pour de bon. Vérifié en base :
 * sur 1645 jobs, aucun n'avait jamais été retenté (`attempt` à 0 partout sauf
 * 5 échecs à 1).
 *
 * La classification s'appuie sur les erreurs que le projet lève RÉELLEMENT
 * (relevées dans le code et dans les 4 lignes FAILED en base), pas sur une
 * liste théorique.
 */

export type ErrorKind = "temporary" | "permanent";

/** Codes d'erreur Discord considérés comme définitifs (la ressource n'existe pas / n'existera pas). */
const PERMANENT_DISCORD_CODES = new Set<number>([
  10003, // Unknown Channel
  10004, // Unknown Guild
  10007, // Unknown Member  — le cas le plus fréquent ici (membre parti du serveur)
  10008, // Unknown Message
  10011, // Unknown Role
  10013, // Unknown User
  50001, // Missing Access
  50013, // Missing Permissions
  50033, // Invalid Recipient
  50035, // Invalid Form Body (payload invalide)
  50007, // Cannot send messages to this user (DM fermés)
]);

/** Statuts HTTP qui valent la peine d'être réessayés. */
const TEMPORARY_HTTP_STATUS = new Set<number>([429, 500, 502, 503, 504]);

/**
 * Marqueurs d'erreurs métier levées par le projet lui-même.
 * Elles décrivent toutes un état qui ne se résoudra pas tout seul.
 */
const PERMANENT_MARKERS = [
  "Unsupported outbox type:",           // type sans handler — ne se corrigera pas au retry
  "DISCORD_ROLE_HIERARCHY_BLOCK_ADD:",  // le rôle du bot est sous celui visé
  "DISCORD_ROLE_HIERARCHY_BLOCK_REMOVE:",
  "DISCORD_ROLE_NOT_FOUND:",
  "SANCTION_ACTION_NOT_IMPLEMENTED:",
  "SANCTION_NOTIFICATION_CHANNEL_INVALID:",
  "Invalid discordId:",
  "not found in guild",                 // formulation utilisée par fetchGuildMember
  "is not editable by the bot",
  "not found in guild (error code 10007)",
];

/** Marqueurs réseau / indisponibilité : transitoires par nature. */
const TEMPORARY_MARKERS = [
  "ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ENOTFOUND",
  "ENETUNREACH", "EPIPE", "socket hang up", "network", "fetch failed",
  "timed out", "timeout",               // inclut l'erreur de withJobTimeout
  "Service Unavailable", "Internal Server Error", "Gateway",
  "rate limit", "Too Many Requests",
];

function readNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Décide si une erreur mérite un retry.
 *
 * Ordre volontaire : on cherche d'abord une raison DÉFINITIVE. En cas de doute
 * on classe en `permanent` — réessayer dix fois une erreur irrécupérable coûte
 * dix appels Discord inutiles et masque le vrai problème dans les logs.
 */
export function classifyOutboxError(error: unknown): ErrorKind {
  const err = error as { code?: unknown; status?: unknown; httpStatus?: unknown; message?: unknown };

  // 1. Code d'erreur Discord (DiscordAPIError.code)
  const code = readNumber(err?.code);
  if (code !== null && PERMANENT_DISCORD_CODES.has(code)) return "permanent";

  // 2. Statut HTTP (DiscordAPIError.status / HTTPError)
  const status = readNumber(err?.status) ?? readNumber(err?.httpStatus);
  if (status !== null) {
    if (TEMPORARY_HTTP_STATUS.has(status)) return "temporary";
    // 4xx autre que 429 = la requête est mauvaise, la rejouer ne changera rien.
    if (status >= 400 && status < 500) return "permanent";
    if (status >= 500) return "temporary";
  }

  const message = String((err?.message ?? error) || "");

  // 3. Marqueurs métier définitifs
  if (PERMANENT_MARKERS.some((m) => message.includes(m))) return "permanent";

  // 4. Marqueurs réseau / indisponibilité
  const lower = message.toLowerCase();
  if (TEMPORARY_MARKERS.some((m) => lower.includes(m.toLowerCase()))) return "temporary";

  // 5. Inconnu → permanent (voir commentaire d'en-tête).
  return "permanent";
}

/**
 * Types de jobs autorisés au retry automatique.
 *
 * Chacun a une raison DÉMONTRÉE d'être rejouable sans produire de doublon :
 * soit son effet converge par nature, soit une garde métier le protège, soit
 * le nonce Discord neutralise le second envoi.
 *
 * Les trois types SANS handler (MEETING_NOTIFY_UPSERT, MEETING_NOTIFY_RECAP,
 * ACTIVITY_DIGEST) restent volontairement absents : « Unsupported outbox
 * type » est classé permanent, ils échouent donc immédiatement au lieu de
 * consommer dix tentatives pour rien.
 */
export const RETRYABLE_JOB_TYPES = new Set<string>([
  // Idempotents par nature ou par garde metier (etape B2).
  "SANCTION_APPLY",   // markSanctionAppliedOnce() en compare-and-set avant envoi
  "ASSIGN_ROLE",      // appartenance a un role = ensemble, converge au rejeu
  "REMOVE_ROLE",      // idem
  "DELETE_MESSAGE",   // supprimer deux fois donne le meme etat final

  // Rendus idempotents par le nonce Discord (etape B3) : un rejeu renvoie le
  // message existant au lieu d'en creer un second. Verifie en conditions
  // reelles, y compris sur DM (2 envois -> 1 seul message recu).
  "SEND_MESSAGE",
  "MEMBER_DM",
  "SANCTION_NOTIFY",
  "COMPLAINT_DECISION",
  "BANK_DEBT_PING_SINGLE",
  "BANK_DEBT_PING_BATCH",
  "RECRUITMENT_DECISION",
]);

export function isRetryableJobType(type: string): boolean {
  return RETRYABLE_JOB_TYPES.has(type);
}

/** Paliers de backoff, en millisecondes. Au-delà du dernier, on reste à 1 h. */
const BACKOFF_STEPS_MS = [
  5_000,      // 5 s
  15_000,     // 15 s
  45_000,     // 45 s
  120_000,    // 2 min
  300_000,    // 5 min
  900_000,    // 15 min
  1_800_000,  // 30 min
  3_600_000,  // 1 h
];

/**
 * Délai avant la prochaine tentative, avec jitter de ±20 %.
 *
 * Le jitter évite que tous les jobs accumulés pendant une panne Discord ne
 * repartent exactement à la même seconde et ne provoquent un second 429.
 *
 * @param attempt nombre de tentatives DÉJÀ effectuées (0 = première erreur)
 */
export function computeBackoffMs(attempt: number): number {
  const idx = Math.min(Math.max(attempt, 0), BACKOFF_STEPS_MS.length - 1);
  const base = BACKOFF_STEPS_MS[idx];
  const jitter = base * 0.2 * (Math.random() * 2 - 1); // ±20 %
  return Math.max(1_000, Math.round(base + jitter));
}
