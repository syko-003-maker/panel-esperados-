import { NextResponse } from "next/server";
import { requireStaffFull } from "@/lib/guards";

/**
 * Liste les salons / catégories / rôles du serveur Discord, par NOM.
 * Sert aux sélecteurs de la page Config (fini les IDs collés à la main).
 * Cache mémoire 60 s — la topologie d'un serveur ne bouge presque jamais.
 */

const GUILD_ID = (process.env.GUILD_ID ?? process.env.DISCORD_GUILD_ID ?? "1312845998753710151").trim();

type ChannelMeta = { id: string; name: string; type: number; parentId: string | null; parentName: string | null; position: number };
type RoleMeta = { id: string; name: string; color: number; position: number };
type GuildMeta = { channels: ChannelMeta[]; categories: { id: string; name: string }[]; roles: RoleMeta[] };

let cache: { at: number; data: GuildMeta } | null = null;
const CACHE_MS = 60_000;

async function fetchGuildMeta(): Promise<GuildMeta> {
  const token = (process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN ?? "").trim();
  if (!token) throw new Error("BOT_TOKEN_MISSING");

  const headers = { Authorization: `Bot ${token}` };
  const [chRes, roleRes] = await Promise.all([
    fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/channels`, { headers, cache: "no-store" }),
    fetch(`https://discord.com/api/v10/guilds/${GUILD_ID}/roles`, { headers, cache: "no-store" }),
  ]);
  if (!chRes.ok) throw new Error(`DISCORD_CHANNELS_HTTP_${chRes.status}`);
  if (!roleRes.ok) throw new Error(`DISCORD_ROLES_HTTP_${roleRes.status}`);

  const rawChannels = (await chRes.json()) as Array<{
    id: string; name: string; type: number; parent_id?: string | null; position?: number;
  }>;
  const rawRoles = (await roleRes.json()) as Array<{
    id: string; name: string; color: number; position: number; managed?: boolean;
  }>;

  // type 4 = catégorie ; 0 = texte ; 5 = annonces ; 15 = forum ; 2 = vocal
  const categories = rawChannels
    .filter((c) => c.type === 4)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((c) => ({ id: c.id, name: c.name }));
  const catName = new Map(categories.map((c) => [c.id, c.name]));

  const channels: ChannelMeta[] = rawChannels
    .filter((c) => c.type === 0 || c.type === 5 || c.type === 15)
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parentId: c.parent_id ?? null,
      parentName: c.parent_id ? (catName.get(c.parent_id) ?? null) : null,
      position: c.position ?? 0,
    }));

  const roles: RoleMeta[] = rawRoles
    .filter((r) => r.id !== GUILD_ID) // exclut @everyone
    .sort((a, b) => b.position - a.position)
    .map((r) => ({ id: r.id, name: r.name, color: r.color, position: r.position }));

  return { channels, categories, roles };
}

export async function GET() {
  const guard = await requireStaffFull();
  if (guard instanceof Response) return guard;

  try {
    if (cache && Date.now() - cache.at < CACHE_MS) {
      return NextResponse.json({ ok: true, ...cache.data, cached: true });
    }
    const data = await fetchGuildMeta();
    cache = { at: Date.now(), data };
    return NextResponse.json({ ok: true, ...data, cached: false });
  } catch (err) {
    // Cache périmé en secours plutôt qu'une page cassée.
    if (cache) return NextResponse.json({ ok: true, ...cache.data, cached: true, stale: true });
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg }, { status: 502 });
  }
}
