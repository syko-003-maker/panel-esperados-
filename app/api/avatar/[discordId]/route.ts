import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy d'avatar Discord — source UNIQUE et increvable pour tous les avatars
 * du panel. Résout le hash EN DIRECT via l'API Discord (cache 1 h), retombe
 * sur le hash-indice (?h=) puis sur l'avatar Discord par défaut. Garantit
 * qu'un avatar n'est JAMAIS cassé/blanc, même si le hash stocké est périmé
 * (le membre a changé sa photo) — ce qui était la cause récurrente du bug.
 *
 * Public (les avatars Discord sont publics). Utilisé via <img src>, donc
 * fonctionne en composant serveur comme client.
 */

const TTL = 60 * 60 * 1000; // 1 h
const cache = new Map<string, { hash: string | null; at: number }>();
const inflight = new Map<string, Promise<string | null>>();

function defaultAvatar(id: string): string {
  let idx = 0;
  try { idx = Number((BigInt(id) >> BigInt(22)) % BigInt(6)); }
  catch { idx = (parseInt(id.slice(-4), 10) || 0) % 6; }
  return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
}

function cdnUrl(id: string, hash: string, size: string): string {
  const ext = hash.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${id}/${hash}.${ext}?size=${size}`;
}

async function liveHash(id: string): Promise<string | null> {
  const token = (process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN ?? "").trim();
  if (!token) return null;
  try {
    const res = await fetch(`https://discord.com/api/v10/users/${id}`, {
      headers: { Authorization: `Bot ${token}` },
      signal: AbortSignal.timeout(3500),
    });
    if (!res.ok) return null; // 404/429/5xx → on retombera sur l'indice ou le défaut
    const u = (await res.json().catch(() => null)) as { avatar?: string | null } | null;
    return u?.avatar ?? null;
  } catch {
    return null;
  }
}

function resolve(id: string): Promise<string | null> {
  const ex = inflight.get(id);
  if (ex) return ex;
  const p = liveHash(id)
    .then((h) => { cache.set(id, { hash: h, at: Date.now() }); return h; })
    .finally(() => inflight.delete(id));
  inflight.set(id, p);
  return p;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ discordId: string }> }) {
  const { discordId } = await params;
  const sp = req.nextUrl.searchParams;
  const hint = sp.get("h");
  const size = (sp.get("size") || "64").replace(/\D/g, "") || "64";

  const redirect = (url: string) =>
    NextResponse.redirect(url, { status: 302, headers: { "Cache-Control": "public, max-age=600" } });

  if (!/^\d{5,25}$/.test(discordId)) return redirect(defaultAvatar(discordId || "0"));

  let hash: string | null | undefined;
  const c = cache.get(discordId);
  if (c && Date.now() - c.at < TTL) {
    hash = c.hash; // frais en cache
  } else {
    // Résolution live, mais bornée : si Discord traîne, on sert l'indice et on
    // laisse le cache se peupler en arrière-plan pour le prochain affichage.
    hash = await Promise.race([
      resolve(discordId),
      new Promise<undefined>((r) => setTimeout(() => r(undefined), 3500)),
    ]);
  }

  if (hash === undefined) hash = hint; // pas résolu à temps → indice fourni par l'appelant
  if (hash) return redirect(cdnUrl(discordId, hash, size));
  return redirect(defaultAvatar(discordId));
}
