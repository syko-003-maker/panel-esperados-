import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireFullWriter } from "@/lib/guards";
import {
  fetchFamilyWeaponsState,
  lygWeaponAdd,
  lygWeaponRemove,
  WEAPON_CLASS_BUDGETS,
  WEAPON_CLASSES,
} from "@/lib/lyg/family-admin";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { createAuditLog } from "@/lib/audit";
import {
  CHEF_FAMILLE_ROLE_ID,
  SOUS_CHEF_FAMILLE_ROLE_ID,
  getDiscordRolesForUser,
} from "@/lib/discord-roles";

/**
 * GET  /api/staff/family/weapons
 *   → catalogue + armes par classe + totaux + budgets (lecture seule, EM+)
 *
 * POST /api/staff/family/weapons
 *   { action: "add"|"remove", weaponId: string, class: 1..4 }
 *   → ajoute / retire une arme sur families.lyg.fr
 *   Restrictions : Chef famille / Sous-Chef famille + propriétaire du cookie.
 *   Add : valide le budget de points AVANT d'appeler LYG (évite de cramer
 *         les 500k€/arme sur un ajout qui dépasse).
 */

async function ensureChefFamille(callerDiscordId: string): Promise<boolean> {
  const ownerDiscordId = process.env.OWNER_DISCORD_ID ?? "";
  const adminIds = (process.env.ADMIN_DISCORD_IDS ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if ((ownerDiscordId && callerDiscordId === ownerDiscordId) || adminIds.includes(callerDiscordId)) {
    return true;
  }
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
  return callerRoles.some((r) => chefRoles.includes(r));
}

export async function GET() {
  const guard = await requireFullWriter();
  if (guard instanceof Response) return guard;

  const result = await fetchFamilyWeaponsState();
  if (!result.ok) {
    const status = result.expired ? 409 : 502;
    return NextResponse.json(
      { ok: false, error: result.expired ? "LYG_COOKIE_EXPIRED" : "LYG_FETCH_FAILED", message: result.error },
      { status }
    );
  }
  return NextResponse.json({ ok: true, ...result.state });
}

export async function POST(req: Request) {
  const guard = await requireFullWriter();
  if (guard instanceof Response) return guard;

  const session: any = (guard as any).session ?? {};
  const callerDiscordId = session.discordId ?? session.user?.discordId ?? null;
  const callerName = session.user?.name ?? null;
  if (!callerDiscordId) {
    return NextResponse.json({ ok: false, error: "MISSING_DISCORD_ID" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false, error: "INVALID_BODY" }, { status: 400 });
  }

  const action = String((body as any).action ?? "").toLowerCase();
  if (action !== "add" && action !== "remove") {
    return NextResponse.json({ ok: false, error: "INVALID_ACTION" }, { status: 400 });
  }

  const weaponId = String((body as any).weaponId ?? "").trim();
  if (!/^[a-z0-9_]+$/i.test(weaponId)) {
    return NextResponse.json({ ok: false, error: "INVALID_WEAPON_ID" }, { status: 400 });
  }

  const classNum = Number((body as any).class);
  if (!WEAPON_CLASSES.includes(classNum as any)) {
    return NextResponse.json(
      { ok: false, error: "INVALID_CLASS", message: "class doit être 1, 2, 3 ou 4" },
      { status: 400 }
    );
  }

  // ── Chef famille requis (gestion loadout = direction famille) ────────────
  const isChef = await ensureChefFamille(callerDiscordId);
  if (!isChef) {
    return NextResponse.json(
      {
        ok: false,
        error: "CHEF_FAMILLE_REQUIRED",
        message: "Seuls le Chef famille et le Sous-Chef famille peuvent gérer les armes des classes WL.",
      },
      { status: 403 }
    );
  }

  // ── Cookie configuré + caller propriétaire (single-user mode) ────────────
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
        message: `Le cookie LYG appartient à ${cred.ownerName ?? cred.ownerDiscordId}. Seul lui peut gérer les armes.`,
      },
      { status: 403 }
    );
  }

  // ── État courant (pour valider budget côté add + nom de l'arme en audit) ──
  const current = await fetchFamilyWeaponsState();
  if (!current.ok) {
    const status = current.expired ? 409 : 502;
    return NextResponse.json(
      { ok: false, error: current.expired ? "LYG_COOKIE_EXPIRED" : "LYG_FETCH_FAILED", message: current.error },
      { status }
    );
  }

  const catalogItem = current.state.catalog.find((w) => w.id === weaponId);
  const weaponName = catalogItem?.name ?? weaponId;
  const weaponCost = catalogItem?.cost ?? 0;
  const classWeapons = current.state.classes[classNum] ?? [];
  const alreadyHas = classWeapons.some((w) => w.id === weaponId);

  if (action === "add") {
    if (!catalogItem) {
      return NextResponse.json(
        { ok: false, error: "WEAPON_NOT_IN_CATALOG", message: "Cette arme n'existe pas dans le catalogue LYG." },
        { status: 400 }
      );
    }
    if (alreadyHas) {
      return NextResponse.json(
        { ok: false, error: "WEAPON_ALREADY_ASSIGNED", message: `${weaponName} est déjà attribuée à la classe WL${classNum}.` },
        { status: 409 }
      );
    }
    const currentTotal = current.state.totals[classNum] ?? 0;
    const budget = WEAPON_CLASS_BUDGETS[classNum] ?? 0;
    if (currentTotal + weaponCost > budget) {
      return NextResponse.json(
        {
          ok: false,
          error: "BUDGET_EXCEEDED",
          message: `Budget dépassé : WL${classNum} est à ${currentTotal}/${budget} pts, ${weaponName} coûte ${weaponCost} pts (total ${currentTotal + weaponCost}).`,
        },
        { status: 409 }
      );
    }
  } else if (action === "remove" && !alreadyHas) {
    return NextResponse.json(
      { ok: false, error: "WEAPON_NOT_ASSIGNED", message: `${weaponName} n'est pas attribuée à la classe WL${classNum}.` },
      { status: 409 }
    );
  }

  // ── Action LYG ────────────────────────────────────────────────────────────
  const res =
    action === "add"
      ? await lygWeaponAdd(weaponId, classNum)
      : await lygWeaponRemove(weaponId, classNum);

  const auditAction = action === "add" ? "LYG_WEAPON_ADD" : "LYG_WEAPON_REMOVE";
  await createAuditLog({
    actorType: "staff",
    actorId: callerDiscordId,
    actorName: callerName,
    action: res.ok ? auditAction : `${auditAction}_FAILED`,
    entity: "Member",
    entityId: `weapons:class${classNum}:${weaponId}`,
    entityName: `${weaponName} → WL${classNum}`,
    familyId: familyDbId,
    meta: {
      class: classNum,
      weaponId,
      weaponName,
      weaponCost,
      lygStatus: res.status,
      tookMs: res.tookMs,
      ...(res.ok ? {} : { error: (res as any).error }),
    },
  }).catch(() => {});

  if (!res.ok) {
    const status = res.expired ? 409 : 502;
    return NextResponse.json(
      {
        ok: false,
        error: res.expired ? "LYG_COOKIE_EXPIRED" : "LYG_ACTION_FAILED",
        message: (res as any).error ?? "Action LYG échouée",
        lygStatus: res.status,
      },
      { status }
    );
  }

  // ── Re-fetch l'état pour renvoyer la version à jour ──────────────────────
  const after = await fetchFamilyWeaponsState();
  return NextResponse.json({
    ok: true,
    action,
    weaponId,
    weaponName,
    class: classNum,
    lygStatus: res.status,
    tookMs: res.tookMs,
    ...(after.ok ? after.state : {}),
  });
}
