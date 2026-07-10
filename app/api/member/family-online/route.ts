import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { ensureInFamilyLoopStarted, getInFamilyStatus, isInFamilyWarm } from "@/lib/in-family-loop";
import { DEMOTE_ROLE_ID } from "@/lib/discord-rbac";
import { BLACKLIST_ROLE_ID, getDiscordGrade } from "@/lib/discord-grade";

/**
 * GET /api/member/family-online — membres actuellement EN MÉTIER LOS (in-game).
 * Accessible à tout membre connecté (pas seulement le staff). Dérivé du même
 * loop in-family que le staff (playtime famille sur ~3 min), mais on n'expose
 * QUE le nom RP + le grade (pas de steamId / PII). Cache serveur 30 s (la liste
 * est la même pour tout le monde) → les dashboards rafraîchissent sans marteler.
 */

export const dynamic = "force-dynamic";

const CACHE_MS = 30_000;
let cache: { at: number; data: Array<{ name: string; grade: string | null }> } | null = null;

export async function GET() {
  const session = await auth();
  if (!session) {
    return NextResponse.json({ ok: false, error: "UNAUTHORIZED" }, { status: 401 });
  }

  ensureInFamilyLoopStarted();
  // Cache froid (redémarrage panel) : on ne sait rien encore → liste vide + warming.
  if (!isInFamilyWarm()) {
    return NextResponse.json({ ok: true, data: [], warming: true });
  }

  if (cache && Date.now() - cache.at < CACHE_MS) {
    return NextResponse.json({ ok: true, data: cache.data, cachedAt: cache.at });
  }

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const members = await prisma.member.findMany({
    where: { familyId: familyDbId, isActive: true, steamId: { not: null } },
    select: { rpName: true, steamId: true, grade: true, discordRoleIds: true },
  });

  const data = members
    .filter((m) => {
      if (!m.steamId) return false;
      // Exclure démote / blacklist (plus dans la famille active).
      const roles = Array.isArray(m.discordRoleIds) ? m.discordRoleIds : [];
      if (roles.includes(DEMOTE_ROLE_ID) || roles.includes(BLACKLIST_ROLE_ID)) return false;
      return getInFamilyStatus(m.steamId).inFamily;
    })
    .map((m) => {
      // Grade résolu en direct depuis les rôles Discord (comme le reste du
      // panel) : m.grade en base est souvent vide (ex. Novato, Réserviste)
      // alors que le rôle existe. Fallback sur m.grade si aucun rôle de grade.
      const roles = Array.isArray(m.discordRoleIds) ? m.discordRoleIds : [];
      return { name: m.rpName ?? "?", grade: getDiscordGrade(roles).grade ?? m.grade ?? null };
    })
    .sort((a, b) => a.name.localeCompare(b.name));

  cache = { at: Date.now(), data };
  return NextResponse.json({ ok: true, data, cachedAt: cache.at });
}
