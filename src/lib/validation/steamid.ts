/**
 * Steam ID 64 validation utility
 * Format: STEAM_0:X:YYYYYYY -> SteamID64 = 76561197960265728 + (X * 2) + (YYYYYYY * 2)
 * SteamID64 format: /^7656119\d{10}$/
 */

const STEAMID64_REGEX = /^7656119\d{10}$/;

/**
 * Valide un SteamID64
 * @param steamId - SteamID64 à valider
 * @returns true si valide, false sinon
 */
export function isValidSteamId64(steamId: string | null | undefined): boolean {
  if (!steamId) return false;
  const normalized = steamId.trim();
  return STEAMID64_REGEX.test(normalized);
}

/**
 * Normalise un SteamID64 (trim + return null si invalide)
 * @param steamId - SteamID64 à normaliser
 * @returns SteamID64 normalisé ou null si invalide
 */
export function normalizeSteamId64(steamId: string | null | undefined): string | null {
  if (!steamId) return null;
  const normalized = steamId.trim();
  return isValidSteamId64(normalized) ? normalized : null;
}

/**
 * Valide et lance une erreur si invalide
 * @param steamId - SteamID64 à valider
 * @throws Error si invalide
 */
export function assertValidSteamId64(steamId: string): asserts steamId is string {
  if (!isValidSteamId64(steamId)) {
    throw new Error(`Invalid SteamID64 format: ${steamId}. Expected format: 7656119XXXXXXXXXX`);
  }
}
