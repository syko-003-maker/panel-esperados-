import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFullWriter } from "@/lib/guards";
import {
  lygFamilyAdd,
  lygFamilyRankDown,
  lygFamilyRankUp,
  lygFamilyRemove,
  type LygFamilyActionType,
} from "@/lib/lyg/family-admin";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { createAuditLog } from "@/lib/audit";
import { CHEF_FAMILLE_ROLE_ID, SOUS_CHEF_FAMILLE_ROLE_ID, getDiscordRolesForUser } from "@/lib/discord-roles";

/**
 * POST /api/staff/family/lyg
 *
 * Dispatch unique pour les 4 actions LYG temps-réel :
 *   { action: "up"|"down"|"remove"|"add", steamId: string, currentClass?: number }
 *
 * Restrictions :
 *   - requireFullWriter (Chef/Sous-Chef/EM seulement, refuse Encadrant)
 *   - L'utilisateur DOIT être le propriétaire du cookie LYG enregistré
 *     (single-user mode — pour limiter le rayon d'utilisation du cookie volé)
 *
 * Effets de bord :
 *   - Appelle families.lyg.fr/modules/edit.php avec le cookie chiffré
 *   - Update wlClass / wlOwner en DB si succès (sans attendre le prochain sync)
 *   - Audit log de l'action
 */

const ALLOWED_ACTIONS = new Set(["up", "down", "remove", "add"]);

export async function POST(req: Request) {
  const guard = await requireFullWriter();
  if (guard instanceof Response) return guard;

  const session: any = (guard as any).session ?? {};
  const callerDiscordId =
    session.discordId ?? session.user?.discordId ?? null;
  const callerName = session.user?.name ?? null;
  if (!callerDiscordId) {
    return NextResponse.json({ ok: false, error: "MISSING_DISCORD_ID" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const action = String((body as any).action ?? "").toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) {
    return NextResponse.json({ ok: false, error: "INVALID_ACTION" }, { status: 400 });
  }

  // ── Permission par action ───────────────────────────────────────────────
  //   up / down : Chef Famille + Sous-Chef Famille uniquement.
  //               L'EM ne peut pas reclasser des membres — réservé à la
  //               direction de la famille.
  //   remove / add : Chef Famille + Sous-Chef Famille + EM (failsafe).
  //                  Remove est rarement utilisé directement (les sanctions
  //                  DEMOTE / BLACKLIST déclenchent l'auto-remove).
  if (action === "up" || action === "down") {
    // Override owner / admin toujours autorisé
    const ownerDiscordId = process.env.OWNER_DISCORD_ID ?? "";
    const adminIds = (process.env.ADMIN_DISCORD_IDS ?? "")
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean);
    const isPrivileged =
      (ownerDiscordId && callerDiscordId === ownerDiscordId) ||
      adminIds.includes(callerDiscordId);

    if (!isPrivileged) {
      // Vérifie que le caller a bien le rôle Chef famille ou Sous-Chef famille.
      // On lit en priorité le DB mirror (rapide), puis Discord live en fallback.
      const familyDb = await resolveFamilyId(DEFAULT_FAMILY_ID);
      const mirror = await prisma.member.findUnique({
        where: { familyId_discordId: { familyId: familyDb, discordId: callerDiscordId } },
        select: { discordRoleIds: true, discordInGuild: true, discordLastError: true },
      });
      let callerRoles: string[] = [];
      if (mirror && !mirror.discordLastError && mirror.discordInGuild) {
        callerRoles = (mirror.discordRoleIds as string[]) ?? [];
      }
      if (callerRoles.length === 0) {
        callerRoles = await getDiscordRolesForUser(callerDiscordId);
      }
      const chefRoles = [CHEF_FAMILLE_ROLE_ID, SOUS_CHEF_FAMILLE_ROLE_ID].filter(Boolean);
      const isChef = callerRoles.some((r) => chefRoles.includes(r));
      if (!isChef) {
        return NextResponse.json(
          {
            ok: false,
            error: "CHEF_FAMILLE_REQUIRED",
            message:
              "Seuls le Chef famille et le Sous-Chef famille peuvent reclasser les WL. L'EM peut consulter et utiliser Supprimer.",
          },
          { status: 403 }
        );
      }
    }
  }

  const steamId = String((body as any).steamId ?? "").trim();
  if (!/^\d{17}$/.test(steamId)) {
    return NextResponse.json({ ok: false, error: "INVALID_STEAMID" }, { status: 400 });
  }

  const currentClassRaw = (body as any).currentClass;
  const needsClass = action === "up" || action === "down";
  let currentClass: number | undefined;
  if (needsClass) {
    const n = Number(currentClassRaw);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return NextResponse.json(
        { ok: false, error: "INVALID_CURRENT_CLASS", message: "currentClass 1..5 requis pour up/down" },
        { status: 400 }
      );
    }
    currentClass = n;
  }

  // Vérifie qu'un cookie est configuré ET que le caller en est propriétaire.
  // Cette restriction limite le rayon d'utilisation : même si un autre
  // staff a accès à requireFullWriter, il ne peut pas effectuer des actions
  // LYG sous le cookie d'un autre.
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  const cred = await prisma.lygCredential.findUnique({ where: { familyId: familyDbId } });
  if (!cred) {
    return NextResponse.json(
      { ok: false, error: "LYG_COOKIE_NOT_CONFIGURED", message: "Aucun cookie LYG configuré. Va dans Paramètres → LYG." },
      { status: 409 }
    );
  }
  if (cred.expired) {
    return NextResponse.json(
      { ok: false, error: "LYG_COOKIE_EXPIRED", message: "Le cookie LYG est expiré. Redonne-en un nouveau." },
      { status: 409 }
    );
  }
  if (cred.ownerDiscordId !== callerDiscordId) {
    return NextResponse.json(
      {
        ok: false,
        error: "NOT_COOKIE_OWNER",
        message: `Le cookie LYG appartient à ${cred.ownerName ?? cred.ownerDiscordId}. Seul lui peut déclencher des actions LYG. Sinon, mets à jour le cookie avec le tien.`,
      },
      { status: 403 }
    );
  }

  // Trouve le membre cible en DB (pour audit + mise à jour locale).
  const member = await prisma.member.findFirst({
    where: { familyId: familyDbId, steamId },
    select: {
      id: true,
      rpName: true,
      wlClass: true,
      wlOwner: true,
      wlClassIntent: true,
    },
  });

  // Appel proxy LYG.
  let result;
  if (action === "up") {
    result = await lygFamilyRankUp(steamId, currentClass!);
  } else if (action === "down") {
    result = await lygFamilyRankDown(steamId, currentClass!);
  } else if (action === "remove") {
    result = await lygFamilyRemove(steamId);
  } else {
    result = await lygFamilyAdd(steamId);
  }

  // Audit log : on enregistre toujours (succès comme échec) pour traçabilité.
  await createAuditLog({
    actorType: "staff",
    actorId: callerDiscordId,
    actorName: callerName,
    action: `LYG_FAMILY_${action.toUpperCase()}${result.ok ? "" : "_FAILED"}`,
    entity: "Member",
    entityId: member?.id ?? steamId,
    entityName: member?.rpName ?? null,
    meta: {
      steamId,
      currentClass: needsClass ? currentClass : undefined,
      lygStatus: result.status,
      tookMs: result.tookMs,
      ...(result.ok ? {} : { error: (result as any).error, expired: (result as any).expired }),
    },
  });

  if (!result.ok) {
    return NextResponse.json(
      {
        ok: false,
        error: (result as any).expired ? "LYG_COOKIE_EXPIRED" : "LYG_ACTION_FAILED",
        message: (result as any).error,
        lygStatus: result.status,
      },
      { status: (result as any).expired ? 409 : 502 }
    );
  }

  // Succès : on met à jour wlClass/wlOwner localement pour refléter
  // l'état nouveau sans attendre le prochain sync (qui re-vérifiera).
  if (member) {
    let nextClass: number | null = member.wlClass;
    if (action === "up" && typeof currentClass === "number") {
      nextClass = Math.max(1, currentClass - 1);
    } else if (action === "down" && typeof currentClass === "number") {
      nextClass = Math.min(5, currentClass + 1);
    } else if (action === "remove") {
      nextClass = null;
    } else if (action === "add") {
      // LYG ajoute à class 4 par défaut (constaté dans la DB : 31 membres class 4)
      nextClass = 4;
    }

    await prisma.member.update({
      where: { id: member.id },
      data: {
        wlClass: nextClass,
        wlClassIntent: nextClass,
        wlIntentUpdatedAt: new Date(),
        wlIntentBy: callerDiscordId,
      },
    });
  } else if (action === "add") {
    // Pas de Member en DB encore — la prochaine sync va le créer. On ne fait
    // rien ici, c'est OK.
  }

  return NextResponse.json({ ok: true, action, lygStatus: result.status, tookMs: result.tookMs });
}
