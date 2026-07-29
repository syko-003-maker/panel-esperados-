import { prisma } from "@/lib/db";

/**
 * Journal des accès au panel.
 *
 * Deux moments comptent : l'authentification réussie, et le refus. Le second
 * est le plus utile — sans trace, un ancien membre qui tente encore d'entrer
 * est parfaitement invisible, et on ne peut ni le constater ni vérifier que le
 * blocage était justifié.
 *
 * L'écriture ne doit JAMAIS faire échouer une connexion : toute erreur est
 * avalée. Un journal est un outil de contrôle, pas un point de panne.
 */
export type AccessEvent = "LOGIN" | "BLOCKED" | "NOT_LINKED";

export async function logAccess(entry: {
  event: AccessEvent;
  reason?: string | null;
  discordId?: string | null;
  userId?: string | null;
  rpName?: string | null;
  username?: string | null;
  ip?: string | null;
  userAgent?: string | null;
}): Promise<void> {
  try {
    await prisma.accessLog.create({
      data: {
        event: entry.event,
        reason: entry.reason ?? null,
        discordId: entry.discordId ?? null,
        userId: entry.userId ?? null,
        rpName: entry.rpName ?? null,
        username: entry.username ?? null,
        ip: entry.ip ?? null,
        // Tronqué : certains navigateurs envoient des chaînes à rallonge, et on
        // n'a besoin que de reconnaître l'appareil.
        userAgent: entry.userAgent ? entry.userAgent.slice(0, 300) : null,
      },
    });
  } catch {
    // Silence volontaire : voir l'en-tête.
  }
}

/**
 * Évite d'écrire une ligne à chaque rechargement de page.
 *
 * Une session ouverte déclenche le callback à chaque navigation ; sans ce
 * garde-fou le journal deviendrait illisible en quelques minutes. On ne
 * réenregistre une connexion qu'après un vrai intervalle.
 */
const LOGIN_DEDUPE_MS = 30 * 60 * 1000;
const lastLogin = new Map<string, number>();

export function shouldLogLogin(key: string): boolean {
  const now = Date.now();
  const prev = lastLogin.get(key) ?? 0;
  if (now - prev < LOGIN_DEDUPE_MS) return false;

  lastLogin.set(key, now);

  // Le cache ne doit pas grossir indéfiniment sur un panel actif.
  if (lastLogin.size > 500) {
    for (const [k, t] of lastLogin) {
      if (now - t > LOGIN_DEDUPE_MS) lastLogin.delete(k);
    }
  }
  return true;
}
