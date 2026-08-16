/**
 * Dérivation du nonce d'idempotence pour les envois Discord de l'outbox.
 *
 * Discord déduplique les messages portant le même `nonce` quand
 * `enforce_nonce: true` : un rejeu renvoie le message existant au lieu d'en
 * créer un second. C'est ce qui protège du doublon dans le scénario
 * « message envoyé → crash → job rejoué ».
 *
 * Vérifié en conditions réelles sur ce serveur :
 *   - deux envois, même nonce → MÊME id de message, aucun doublon ;
 *   - la limite est de 25 caractères, strictement (27 → NONCE_TYPE_TOO_LONG) ;
 *   - si le message d'origine a été supprimé, le rejeu renvoie 10008
 *     (Unknown Message), classé « permanent » → pas de doublon non plus.
 *
 * Les `id` de DiscordOutbox mesurent 22 à 27 caractères : ils ne peuvent donc
 * PAS servir de nonce directement. D'où cette dérivation.
 */

import { createHash } from "node:crypto";

/** Limite imposée par l'API Discord, constatée empiriquement. */
export const DISCORD_NONCE_MAX_LENGTH = 25;

/**
 * Nonce déterministe et stable pour un job donné.
 *
 * Même `jobId` ⇒ même nonce, sans aucun état externe : c'est ce qui permet à
 * un rejeu, éventuellement après redémarrage du worker, de retomber exactement
 * sur la même valeur.
 *
 * Un suffixe optionnel distingue plusieurs envois issus d'un même job (cas de
 * RECRUITMENT_DECISION, qui poste six messages) — chacun doit avoir son propre
 * nonce, sinon Discord dédupliquerait des messages légitimement différents.
 *
 * Encodage hexadécimal tronqué : caractères sûrs pour Discord, 25 signes =
 * 100 bits conservés. Volontairement sans BigInt — le tsconfig du panel cible
 * ES2017 et type-vérifie ce dossier, un littéral BigInt y casserait le build.
 */
export function outboxNonce(jobId: string, suffix?: string): string {
  const input = suffix ? `${jobId}:${suffix}` : jobId;
  return createHash("sha256")
    .update(input)
    .digest("hex")
    .slice(0, DISCORD_NONCE_MAX_LENGTH);
}

/**
 * Options à fusionner dans un appel `channel.send()` / `user.send()` pour le
 * rendre idempotent.
 *
 * Renvoie un objet vide si l'identifiant de job est absent : mieux vaut un
 * envoi non protégé qu'un plantage — le comportement métier reste identique.
 */
export function nonceOptions(jobId: string | null | undefined, suffix?: string) {
  const id = String(jobId ?? "").trim();
  if (!id) return {};
  return { nonce: outboxNonce(id, suffix), enforceNonce: true as const };
}
