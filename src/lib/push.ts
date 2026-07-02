import webpush from "web-push";
import { prisma } from "@/lib/db";
import { publishNotification } from "@/lib/notify-bus";

/**
 * Envoi de notifications Web Push (PWA). Configuré via les clés VAPID.
 * sendPushToDiscordIds : envoie à tous les appareils abonnés des membres
 * ciblés, et purge automatiquement les abonnements morts (404/410).
 */

let configured = false;
function ensureConfigured(): boolean {
  if (configured) return true;
  const pub = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT || "mailto:staff@losesperados.fr";
  if (!pub || !priv) return false;
  webpush.setVapidDetails(subject, pub, priv);
  configured = true;
  return true;
}

export type PushPayload = { title: string; body: string; url?: string; tag?: string };

export async function sendPushToDiscordIds(
  discordIds: string[],
  payload: PushPayload
): Promise<{ sent: number; pruned: number }> {
  // Pont appli desktop : on publie dans le bus mémoire quoi qu'il arrive
  // (indépendant du web push, qui ne marche pas dans Electron).
  if (discordIds.length) publishNotification(discordIds, payload);
  if (!ensureConfigured() || discordIds.length === 0) return { sent: 0, pruned: 0 };
  const subs = await prisma.pushSubscription.findMany({ where: { discordId: { in: discordIds } } });
  let sent = 0, pruned = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          JSON.stringify(payload)
        );
        sent++;
        await prisma.pushSubscription.update({ where: { id: s.id }, data: { lastSeenAt: new Date() } }).catch(() => {});
      } catch (e: unknown) {
        const code = (e as { statusCode?: number })?.statusCode;
        if (code === 404 || code === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } }).catch(() => {});
          pruned++;
        }
      }
    })
  );
  return { sent, pruned };
}


/**
 * Envoie à tout le staff (membres actifs, en guilde, portant un rôle staff).
 * Résolu depuis le mirror des rôles Discord — même source que les guards.
 */
export async function sendPushToStaff(payload: PushPayload): Promise<{ sent: number; pruned: number }> {
  try {
    const { getStaffRoleIds } = await import("@/lib/discord-rbac");
    const staffRoleIds = getStaffRoleIds();
    if (!staffRoleIds.length) return { sent: 0, pruned: 0 };
    const members = await prisma.member.findMany({
      where: {
        isActive: true,
        discordInGuild: true,
        discordId: { not: null },
        discordRoleIds: { hasSome: staffRoleIds },
      },
      select: { discordId: true },
    });
    const ids = members.map((m) => m.discordId).filter((x): x is string => !!x);
    return sendPushToDiscordIds(ids, payload);
  } catch {
    return { sent: 0, pruned: 0 };
  }
}
