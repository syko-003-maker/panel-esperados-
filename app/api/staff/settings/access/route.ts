import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireChefFamille } from "@/lib/guards";
import { getSession } from "@/auth";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { enqueueAssignRole, enqueueRemoveRole } from "@/lib/discord/discord";
import { createAuditLog } from "@/lib/audit";
import { getDiscordAvatarUrl } from "@/lib/discord/getDiscordAvatarUrl";
import { fetchWithTimeout } from "@/lib/http";

/** Appel Discord sur chemin utilisateur : 10 s. */
const DISCORD_TIMEOUT_MS = 10_000;
import {
  CHEF_FAMILLE_ROLE_ID,
  SOUS_CHEF_FAMILLE_ROLE_ID,
  ETAT_MAJOR_ROLE_ID,
  ENCADRANT_ROLE_ID,
  RECRUTEUR_ROLE_ID,
} from "@/lib/discord-roles";

const FAMILY_ID = process.env.FAMILY_ID ?? "esperados";
const GUILD_ID = process.env.GUILD_ID ?? process.env.DISCORD_GUILD_ID ?? "1312845998753710151";

// Rôles d'accès modifiables depuis la page. Chef / Sous-Chef volontairement
// EXCLUS (affichés en lecture seule) : on ne doit pas pouvoir se retirer le
// trône — ni le donner — d'un clic.
const MANAGED_ROLES = {
  ETAT_MAJOR: ETAT_MAJOR_ROLE_ID,
  ENCADRANT: ENCADRANT_ROLE_ID,
  RECRUTEUR: RECRUTEUR_ROLE_ID,
} as const;

type ManagedRoleKey = keyof typeof MANAGED_ROLES;

function buildRow(m: {
  id: string;
  rpName: string | null;
  discordId: string | null;
  discordDisplayName: string | null;
  discordUsername: string | null;
  discordAvatarHash: string | null;
  discordRoleIds: string[];
  discordInGuild: boolean | null;
  discordRolesUpdatedAt: Date | null;
}) {
  const roles = new Set(m.discordRoleIds ?? []);
  return {
    id: m.id,
    rpName: m.rpName,
    discordId: m.discordId,
    displayName: m.discordDisplayName ?? m.discordUsername ?? null,
    avatarUrl: getDiscordAvatarUrl(m.discordId, m.discordAvatarHash),
    inGuild: m.discordInGuild === true,
    rolesUpdatedAt: m.discordRolesUpdatedAt?.toISOString() ?? null,
    isChef: roles.has(CHEF_FAMILLE_ROLE_ID),
    isSousChef: roles.has(SOUS_CHEF_FAMILLE_ROLE_ID),
    isEtatMajor: roles.has(ETAT_MAJOR_ROLE_ID),
    isEncadrant: roles.has(ENCADRANT_ROLE_ID),
    isRecruteur: roles.has(RECRUTEUR_ROLE_ID),
  };
}

const MEMBER_SELECT = {
  id: true,
  rpName: true,
  discordId: true,
  discordDisplayName: true,
  discordUsername: true,
  discordAvatarHash: true,
  discordRoleIds: true,
  discordInGuild: true,
  discordRolesUpdatedAt: true,
} as const;

export async function GET() {
  const guard = await requireChefFamille();
  if (guard instanceof Response) return guard;

  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  // Uniquement les membres « gérables » : encore WL famille ET présents sur le
  // Discord. Les démotés sans WL / partis du serveur n'ont rien à faire ici
  // (vérifié : aucun détenteur d'accès n'est dans ce cas).
  const members = await prisma.member.findMany({
    where: {
      familyId: familyDbId,
      isActive: true,
      isGhost: false,
      discordId: { not: null },
      discordInGuild: true,
      wlClass: { not: null },
    },
    select: MEMBER_SELECT,
    orderBy: { rpName: "asc" },
  });

  const rows = members.map(buildRow);
  // Détenteurs d'un accès d'abord, puis alphabétique.
  rows.sort((a, b) => {
    const aHas = a.isChef || a.isSousChef || a.isEtatMajor || a.isEncadrant || a.isRecruteur;
    const bHas = b.isChef || b.isSousChef || b.isEtatMajor || b.isEncadrant || b.isRecruteur;
    if (aHas !== bHas) return aHas ? -1 : 1;
    return (a.rpName ?? "").localeCompare(b.rpName ?? "");
  });

  return NextResponse.json({ ok: true, members: rows });
}

export async function POST(req: Request) {
  const guard = await requireChefFamille();
  if (guard instanceof Response) return guard;

  const session = await getSession();
  const actorDiscordId = (session?.user as any)?.discordId ?? null;
  const actorName = (session?.user as any)?.name ?? actorDiscordId ?? "panel";

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }
  const action = String((body as any).action ?? "");

  // ── Toggle d'un rôle d'accès (appliqué sur Discord via l'outbox, puis
  // répercuté dans le mirror par l'event guildMemberUpdate du worker). ──────
  if (action === "SET_ROLE") {
    const discordId = String((body as any).discordId ?? "").trim();
    const roleKey = String((body as any).role ?? "") as ManagedRoleKey;
    const enabled = Boolean((body as any).enabled);

    if (!/^\d{17,20}$/.test(discordId)) {
      return NextResponse.json({ ok: false, error: "INVALID_DISCORD_ID" }, { status: 400 });
    }
    const roleId = MANAGED_ROLES[roleKey];
    if (!roleId) {
      return NextResponse.json({ ok: false, error: "INVALID_ROLE" }, { status: 400 });
    }

    const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
    const member = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId: familyDbId, discordId } },
      select: { id: true, rpName: true },
    });
    if (!member) {
      return NextResponse.json({ ok: false, error: "MEMBER_NOT_FOUND" }, { status: 404 });
    }

    const enqueue = enabled ? enqueueAssignRole : enqueueRemoveRole;
    await enqueue({
      familyId: FAMILY_ID,
      guildId: GUILD_ID,
      userDiscordId: discordId,
      roleId,
      entity: "access_settings",
      entityId: member.id,
      meta: { source: "settings_access", role: roleKey, actor: actorDiscordId },
    });

    await createAuditLog({
      actorType: "staff",
      actorId: actorDiscordId,
      actorName,
      action: enabled ? "ACCESS_ROLE_GRANTED" : "ACCESS_ROLE_REVOKED",
      entity: "Member",
      entityId: member.id,
      entityName: member.rpName,
      meta: { role: roleKey, roleId, discordId },
    });

    return NextResponse.json({ ok: true, queued: true });
  }

  // ── Resync du mirror d'UN membre depuis l'API Discord live. ──────────────
  if (action === "RESYNC") {
    const discordId = String((body as any).discordId ?? "").trim();
    if (!/^\d{17,20}$/.test(discordId)) {
      return NextResponse.json({ ok: false, error: "INVALID_DISCORD_ID" }, { status: 400 });
    }
    const token = (process.env.DISCORD_BOT_TOKEN ?? process.env.DISCORD_TOKEN ?? "").trim();
    if (!token) {
      return NextResponse.json({ ok: false, error: "BOT_TOKEN_MISSING" }, { status: 500 });
    }

    // Timeout + capture : ce fichier n'avait AUCUN bloc try. Sans cela, un
    // appel Discord qui expire remonterait en 500 au lieu d'un message clair.
    let res: Response;
    try {
      res = await fetchWithTimeout(
        `https://discord.com/api/v10/guilds/${GUILD_ID}/members/${discordId}`,
        { headers: { Authorization: `Bot ${token}` }, cache: "no-store", timeoutMs: DISCORD_TIMEOUT_MS }
      );
    } catch (err) {
      console.error("[settings/access] appel Discord echoue", {
        discordId,
        error: err instanceof Error ? err.message : String(err),
      });
      return NextResponse.json(
        { ok: false, error: "DISCORD_UNAVAILABLE" },
        { status: 503 }
      );
    }

    const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
    const now = new Date();

    if (res.status === 404) {
      await prisma.member.updateMany({
        where: { familyId: familyDbId, discordId },
        data: { discordInGuild: false, discordRoleIds: [], discordRolesUpdatedAt: now, discordLastError: null },
      });
    } else if (res.ok) {
      const payload = (await res.json()) as {
        roles?: string[];
        nick?: string | null;
        user?: { username?: string | null; global_name?: string | null };
      };
      const roles = Array.isArray(payload.roles) ? payload.roles : [];
      const username = payload.user?.global_name ?? payload.user?.username ?? null;
      await prisma.member.updateMany({
        where: { familyId: familyDbId, discordId },
        data: {
          discordInGuild: true,
          discordRoleIds: roles,
          discordRolesUpdatedAt: now,
          discordLastError: null,
          discordDisplayName: payload.nick ?? username,
          discordUsername: username,
        },
      });
    } else {
      return NextResponse.json({ ok: false, error: `DISCORD_HTTP_${res.status}` }, { status: 502 });
    }

    const fresh = await prisma.member.findUnique({
      where: { familyId_discordId: { familyId: familyDbId, discordId } },
      select: MEMBER_SELECT,
    });
    return NextResponse.json({ ok: true, member: fresh ? buildRow(fresh) : null });
  }

  return NextResponse.json({ ok: false, error: "INVALID_ACTION" }, { status: 400 });
}
