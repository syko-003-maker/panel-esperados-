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
import { isCurrentSessionChefFamille } from "@/lib/rbac";
import { CHEF_FAMILLE_ROLE_ID, SOUS_CHEF_FAMILLE_ROLE_ID, getDiscordRolesForUser } from "@/lib/discord-roles";
import { logWarn } from "@/lib/obs";

/**
 * Refus tracé.
 *
 * Cette route rejetait sans rien écrire nulle part : l'audit `LYG_FAMILY_*`
 * n'est produit qu'APRÈS toutes les gardes, donc une action bloquée en amont
 * ne laissait aucune trace — ni audit, ni log. Une tentative de whitelist
 * échouée était rigoureusement indiagnosticable après coup.
 *
 * La réponse renvoyée est inchangée (même corps, même statut) : seule une
 * ligne de log est ajoutée, nommant la garde qui a bloqué.
 *
 * Aucun secret n'est journalisé : jamais le cookie LYG ni son chiffré, jamais
 * le contenu de `LygCredential` au-delà de l'identité de son propriétaire.
 */
function refuse(
  guard: string,
  status: number,
  body: Record<string, unknown>,
  context: Record<string, unknown> = {}
): NextResponse {
  logWarn("lyg_family_action_refused", { guard, status, ...context });
  return NextResponse.json(body, { status });
}

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
    return refuse("MISSING_DISCORD_ID", 401, { ok: false, error: "MISSING_DISCORD_ID" });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return refuse("INVALID_BODY", 400, { ok: false, error: "INVALID_BODY" }, { callerDiscordId });
  }

  const action = String((body as any).action ?? "").toLowerCase();
  if (!ALLOWED_ACTIONS.has(action)) {
    return refuse(
      "INVALID_ACTION",
      400,
      { ok: false, error: "INVALID_ACTION" },
      { callerDiscordId, action }
    );
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
      let mirrorRolesUsed = callerRoles.length > 0;
      if (callerRoles.length === 0) {
        callerRoles = await getDiscordRolesForUser(callerDiscordId);
        mirrorRolesUsed = false;
      }
      const chefRoles = [CHEF_FAMILLE_ROLE_ID, SOUS_CHEF_FAMILLE_ROLE_ID].filter(Boolean);
      const isChef = callerRoles.some((r) => chefRoles.includes(r));
      if (!isChef) {
        return refuse(
          "CHEF_FAMILLE_REQUIRED",
          403,
          {
            ok: false,
            error: "CHEF_FAMILLE_REQUIRED",
            message:
              "Seuls le Chef famille et le Sous-Chef famille peuvent reclasser les WL. L'EM peut consulter et utiliser Supprimer.",
          },
          // `rolesFrom` distingue les deux causes possibles d'un refus ici :
          // un vrai manque de rôle, ou un miroir Discord vide/en erreur qui a
          // forcé le repli sur l'appel Discord live.
          {
            callerDiscordId,
            action,
            rolesFrom: mirrorRolesUsed ? "db_mirror" : "discord_live",
            callerRoleCount: callerRoles.length,
          }
        );
      }
    }
  }

  const steamId = String((body as any).steamId ?? "").trim();
  if (!/^\d{17}$/.test(steamId)) {
    // On journalise la longueur, pas la valeur brute : suffisant pour
    // distinguer « champ vide » de « SteamID mal formé » sans recopier une
    // donnée personnelle dans les logs.
    return refuse(
      "INVALID_STEAMID",
      400,
      { ok: false, error: "INVALID_STEAMID" },
      { callerDiscordId, action, steamIdLength: steamId.length }
    );
  }

  const currentClassRaw = (body as any).currentClass;
  const needsClass = action === "up" || action === "down";
  let currentClass: number | undefined;
  if (needsClass) {
    const n = Number(currentClassRaw);
    if (!Number.isInteger(n) || n < 1 || n > 5) {
      return refuse(
        "INVALID_CURRENT_CLASS",
        400,
        { ok: false, error: "INVALID_CURRENT_CLASS", message: "currentClass 1..5 requis pour up/down" },
        // Cause typique : la ligne cliquée avait `wlClass` à null, le client
        // envoie alors `currentClass: null` et l'action est refusée.
        { callerDiscordId, action, currentClassRaw: String(currentClassRaw ?? "") }
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
    return refuse(
      "LYG_COOKIE_NOT_CONFIGURED",
      409,
      { ok: false, error: "LYG_COOKIE_NOT_CONFIGURED", message: "Aucun cookie LYG configuré. Va dans Paramètres → LYG." },
      { callerDiscordId, action }
    );
  }
  if (cred.expired) {
    return refuse(
      "LYG_COOKIE_EXPIRED",
      409,
      { ok: false, error: "LYG_COOKIE_EXPIRED", message: "Le cookie LYG est expiré. Redonne-en un nouveau." },
      { callerDiscordId, action, cookieOwnerDiscordId: cred.ownerDiscordId }
    );
  }
  // Le cookie est utilisable par son propriétaire OU par la direction famille
  // (Chef + Sous-Chef). Le Sous-Chef peut donc déclencher les actions LYG via
  // le cookie partagé du Chef.
  const isLeadership = await isCurrentSessionChefFamille();
  if (cred.ownerDiscordId !== callerDiscordId && !isLeadership) {
    return refuse(
      "NOT_COOKIE_OWNER",
      403,
      {
        ok: false,
        error: "NOT_COOKIE_OWNER",
        message: `Le cookie LYG appartient à ${cred.ownerName ?? cred.ownerDiscordId}. Seuls lui, le Chef et le Sous-Chef famille peuvent l'utiliser.`,
      },
      { callerDiscordId, action, cookieOwnerDiscordId: cred.ownerDiscordId, isLeadership }
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
      // WL va de 1 (Chef) à 4 (plus bas) — il n'y a PAS de WL5.
      nextClass = Math.min(4, currentClass + 1);
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
