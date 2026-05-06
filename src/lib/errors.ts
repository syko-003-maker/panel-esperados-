/**
 * Helpers d'erreur partagés (frontend + backend).
 * Évite les patterns `catch (err: any) { String(err?.message ?? err) }` dispersés
 * dans 30+ fichiers.
 */

export function getErrorMessage(err: unknown): string {
  if (err == null) return "Erreur inconnue";
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (typeof err === "object" && "message" in err && typeof (err as any).message === "string") {
    return (err as any).message;
  }
  try {
    const s = JSON.stringify(err);
    return s === "{}" ? String(err) : s;
  } catch {
    return String(err);
  }
}

/**
 * Convertit n'importe quoi en Error utilisable (pour Sentry / logs).
 */
export function toError(err: unknown): Error {
  if (err instanceof Error) return err;
  return new Error(getErrorMessage(err));
}
