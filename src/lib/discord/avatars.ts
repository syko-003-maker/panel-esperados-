import { prisma } from "@/lib/db";

/**
 * Source UNIQUE des avatars Discord.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * POURQUOI CE MODULE EXISTE
 * ────────────────────────────────────────────────────────────────────────────
 * Les photos de profil manquantes ont été un bug récurrent — une vingtaine de
 * fois. La cause n'était pas la donnée : c'était que QUATRE systèmes
 * interrogeaient Discord chacun de leur côté, avec leur propre cache et leur
 * propre rythme.
 *
 *   1. le proxy /api/avatar — un appel Discord PAR avatar affiché
 *   2. avatar-cache.ts      — « warm » à 5 requêtes en parallèle toutes les 100 ms
 *   3. avatar-hash-resolver — lecture d'Account.user.image
 *   4. le cache mémoire du proxy, distinct de celui d'avatar-cache
 *
 * Une liste de 40 membres déclenchait donc plusieurs dizaines d'appels en
 * moins d'une seconde ⇒ **HTTP 429** garanti. Et comme un échec était mis en
 * cache pendant une heure, l'avatar par défaut restait figé longtemps après.
 *
 * Tout passe désormais par ici : un cache, un garde-fou de quota, une file
 * d'attente, une écriture en base.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * RÈGLES QUI NE DOIVENT PAS ÊTRE CASSÉES
 * ────────────────────────────────────────────────────────────────────────────
 * · Un ÉCHEC n'est JAMAIS mis en cache. `undefined` = « on ne sait pas »
 *   (429, timeout, réseau) ; seul un 404 donne `null` = « pas d'avatar ».
 * · `Member.discordAvatarHash` prime sur `Account.user.image` : le premier est
 *   rafraîchi en continu, le second fige au dernier login OAuth. L'inverse
 *   servait un hash mort pour qui ne s'était pas reconnecté depuis longtemps.
 * · Les appels Discord sont SÉRIALISÉS et espacés. Aucune rafale.
 * · Toujours `.png`, jamais `.gif` — voir cdnUrl().
 */

/** Un hash valide reste bon longtemps : les gens changent rarement de photo. */
const TTL_HIT = 60 * 60 * 1000; // 1 h
/** Une absence d'avatar se revérifie plus souvent : la personne peut en mettre un. */
const TTL_MISS = 10 * 60 * 1000; // 10 min

/** Espacement entre deux appels Discord. ~4 req/s, très en dessous du quota. */
const PACE_MS = 250;

type Entry = { hash: string | null; at: number };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<string | null | undefined>>();

/** Fenêtre de repos imposée par un 429. Partagée par TOUS les appelants. */
let rateLimitedUntil = 0;

/** File sérielle : les appels Discord se suivent, ils ne se superposent jamais. */
let queue: Promise<unknown> = Promise.resolve();

function botToken(): string {
  return (process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN ?? "").trim();
}

function fresh(e: Entry | undefined): boolean {
  if (!e) return false;
  return Date.now() - e.at < (e.hash ? TTL_HIT : TTL_MISS);
}

/**
 * Interroge Discord pour un compte.
 *
 * Renvoie `undefined` quand on ne sait pas — c'est capital : mettre ce cas en
 * cache reviendrait à afficher l'avatar par défaut pendant une heure après un
 * simple pic de trafic.
 */
async function fetchLive(discordId: string): Promise<string | null | undefined> {
  const token = botToken();
  if (!token) return undefined;
  if (Date.now() < rateLimitedUntil) return undefined;

  try {
    const res = await fetch(`https://discord.com/api/v10/users/${discordId}`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(3500),
    });

    if (res.status === 429) {
      const retry = Number(res.headers.get("retry-after") ?? "60");
      rateLimitedUntil = Date.now() + Math.min(Math.max(retry, 5), 300) * 1000;
      return undefined;
    }
    if (res.status === 404) return null; // compte supprimé : il n'y a vraiment rien
    if (!res.ok) return undefined;

    const u = (await res.json().catch(() => null)) as { avatar?: string | null } | null;
    return u?.avatar ?? null;
  } catch {
    return undefined;
  }
}

/** Une résolution live, mise en file et dédupliquée. */
function resolveOne(discordId: string): Promise<string | null | undefined> {
  const running = inflight.get(discordId);
  if (running) return running;

  const p = queue
    .then(() => new Promise((r) => setTimeout(r, PACE_MS)))
    .then(() => fetchLive(discordId))
    .then(async (hash) => {
      if (hash !== undefined) {
        cache.set(discordId, { hash, at: Date.now() });
        // Persistance : le hash survit aux redémarrages et sert d'indice au
        // proxy, ce qui lui évite de rappeler Discord au prochain affichage.
        await prisma.member
          .updateMany({
            where: { discordId },
            data: { discordAvatarHash: hash, discordAvatarFetchedAt: new Date() },
          })
          .catch(() => {});
      }
      return hash;
    })
    .finally(() => inflight.delete(discordId));

  inflight.set(discordId, p);
  queue = p.catch(() => {});
  return p;
}

/**
 * Hashs connus, SANS jamais attendre Discord.
 *
 * Ordre : cache mémoire → Member.discordAvatarHash → Account.user.image.
 * Les identifiants encore inconnus sont mis en file pour un rafraîchissement
 * en arrière-plan, disponible au prochain affichage.
 */
export async function getKnownHashes(
  discordIds: readonly string[],
): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const ids = [...new Set(discordIds.map((i) => String(i ?? "").trim()).filter(Boolean))];
  if (ids.length === 0) return out;

  const missing: string[] = [];
  for (const id of ids) {
    const e = cache.get(id);
    if (fresh(e)) out.set(id, e!.hash);
    else missing.push(id);
  }
  if (missing.length === 0) return out;

  const members = await prisma.member
    .findMany({
      where: { discordId: { in: missing } },
      select: { discordId: true, discordAvatarHash: true },
    })
    .catch(() => []);

  const stillMissing = new Set(missing);
  for (const m of members) {
    if (!m.discordId || !m.discordAvatarHash) continue;
    out.set(m.discordId, m.discordAvatarHash);
    stillMissing.delete(m.discordId);
  }

  // Repli pour qui n'a pas de fiche membre (staff, comptes hors famille).
  if (stillMissing.size > 0) {
    const accounts = await prisma.account
      .findMany({
        where: { provider: "discord", providerAccountId: { in: [...stillMissing] } },
        select: { providerAccountId: true, user: { select: { image: true } } },
      })
      .catch(() => []);
    for (const a of accounts) {
      const hash = extractHashFromUrl(a.user?.image ?? null);
      if (hash) {
        out.set(a.providerAccountId, hash);
        stillMissing.delete(a.providerAccountId);
      }
    }
  }

  for (const id of stillMissing) out.set(id, null);

  // Ce qu'on ne connaît pas part se résoudre tranquillement, en arrière-plan.
  warm([...stillMissing]);
  return out;
}

/**
 * Résolution garantie : attend Discord pour les identifiants inconnus.
 * À réserver aux cas où l'on ne peut pas se contenter d'un hash approximatif.
 */
export async function getHashesLive(
  discordIds: readonly string[],
): Promise<Map<string, string | null>> {
  const known = await getKnownHashes(discordIds);
  const unknown = [...known.entries()].filter(([, h]) => h === null).map(([id]) => id);

  for (const id of unknown) {
    const h = await resolveOne(id);
    if (h !== undefined) known.set(id, h);
  }
  return known;
}

/** Rafraîchissement en arrière-plan, sans jamais bloquer l'appelant. */
export function warm(discordIds: readonly string[]): void {
  if (!botToken()) return;
  for (const id of discordIds) {
    if (!id) continue;
    if (fresh(cache.get(id))) continue;
    void resolveOne(id).catch(() => {});
  }
}

/** Hash contenu dans une URL CDN Discord, ou null. */
export function extractHashFromUrl(imageUrl: string | null | undefined): string | null {
  if (!imageUrl) return null;
  const m = imageUrl.match(/cdn\.discordapp\.com\/avatars\/\d+\/([a-zA-Z0-9_]+)\./);
  return m?.[1] ?? null;
}

/**
 * URL CDN d'un avatar — toujours en `.png`.
 *
 * Le préfixe `a_` signale un avatar animé, mais Discord le CONSERVE après
 * l'expiration du Nitro alors que l'asset animé, lui, disparaît : `.gif`
 * renvoie alors un **415** et l'image s'affiche vide. Vérifié sur un compte
 * réel. On perd l'animation, on ne perd jamais l'image.
 */
export function cdnUrl(discordId: string, hash: string, size = "64"): string {
  return `https://cdn.discordapp.com/avatars/${discordId}/${hash}.png?size=${size}`;
}

/** Avatar Discord par défaut, déterministe à partir de l'identifiant. */
export function defaultAvatarUrl(discordId: string): string {
  let idx = 0;
  try {
    idx = Number((BigInt(discordId) >> BigInt(22)) % BigInt(6));
  } catch {
    idx = (parseInt(discordId.slice(-4), 10) || 0) % 6;
  }
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

/** URL à mettre dans un `<img src>` : passe par le proxy, avec le hash en indice. */
export function avatarUrl(
  discordId: string | null | undefined,
  hash: string | null | undefined,
): string | null {
  if (!discordId) return null;
  const q = hash ? `?h=${encodeURIComponent(hash)}` : "";
  return `/api/avatar/${discordId}${q}`;
}

/** Ce que le proxy utilise : le hash connu, et rien de bloquant. */
export async function resolveForProxy(
  discordId: string,
  hint: string | null,
): Promise<string | null> {
  const e = cache.get(discordId);
  if (fresh(e)) {
    // Un rafraîchissement reste utile si le cache dit « pas d'avatar ».
    if (!e!.hash && hint) warm([discordId]);
    return e!.hash ?? hint;
  }

  // L'indice fourni par l'appelant suffit : on le sert tout de suite et on
  // rafraîchit en fond. C'est ce qui évite un appel Discord par avatar.
  if (hint) {
    warm([discordId]);
    return hint;
  }

  const known = await getKnownHashes([discordId]);
  const h = known.get(discordId) ?? null;
  if (h) return h;

  // Aucun indice, rien en base : là seulement on attend Discord.
  const live = await resolveOne(discordId).catch(() => undefined);
  return live ?? null;
}
