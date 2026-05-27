import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Chiffrement symétrique pour secrets stockés en DB.
 *
 * Algo : AES-256-GCM (authentifié — détecte toute altération du ciphertext).
 *
 * Format des ciphertexts (toujours base64) :
 *   [iv (12 bytes)] [tag (16 bytes)] [ciphertext (n bytes)]
 *
 * Clé : LYG_COOKIE_ENCRYPTION_KEY env, base64 de 32 octets.
 * À générer une fois :
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Si la clé manque ou est invalide, encrypt/decrypt jettent — on préfère
 * crash explicite plutôt que faux sens silencieux.
 */

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

function getKey(): Buffer {
  const raw = (process.env.LYG_COOKIE_ENCRYPTION_KEY ?? "").trim();
  if (!raw) {
    throw new Error(
      "LYG_COOKIE_ENCRYPTION_KEY env manquante. Générer avec : node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\""
    );
  }
  const buf = Buffer.from(raw, "base64");
  if (buf.length !== 32) {
    throw new Error(
      `LYG_COOKIE_ENCRYPTION_KEY doit faire 32 octets (256 bits), reçu ${buf.length} octets`
    );
  }
  return buf;
}

/**
 * Vérifie au démarrage que la clé est configurée correctement.
 * Renvoie null si OK, sinon un message d'erreur.
 */
export function checkSecretKeyHealth(): { ok: boolean; error: string | null } {
  try {
    getKey();
    return { ok: true, error: null };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export function encryptSecret(plain: string): string {
  if (typeof plain !== "string" || plain.length === 0) {
    throw new Error("encryptSecret: plain doit être une string non vide");
  }
  const key = getKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decryptSecret(ciphertextB64: string): string {
  if (typeof ciphertextB64 !== "string" || ciphertextB64.length === 0) {
    throw new Error("decryptSecret: ciphertext doit être une string non vide");
  }
  const buf = Buffer.from(ciphertextB64, "base64");
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error("decryptSecret: ciphertext trop court (corrompu ?)");
  }
  const key = getKey();
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const enc = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
  return dec.toString("utf8");
}

/**
 * Masque une valeur sensible pour les logs.
 *   "bcd6d5e31cf59af233e68e41b5302ef6" → "bcd6…02ef6"
 *
 * Garde 4 chars au début + 4 à la fin si la valeur est assez longue,
 * sinon "***" entièrement masqué.
 */
export function maskSecret(value: string | null | undefined): string {
  if (!value || typeof value !== "string") return "***";
  const v = value.trim();
  if (v.length < 12) return "***";
  return `${v.slice(0, 4)}…${v.slice(-4)}`;
}
