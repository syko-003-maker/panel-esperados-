import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";
import { getMemberDebt } from "@/lib/bank-debts";
import { getDiscordAvatarUrl } from "@/lib/discord/getDiscordAvatarUrl";
import { isMemberPlaytimeHidden } from "@/lib/member-playtime-visibility";
import { HIDDEN_MEMBER_DISCORD_IDS } from "@/lib/staff/member-scope";

/**
 * GET /api/member/dashboard
 * Retourne les données utiles pour le dashboard du membre:
 * - Infos membre (rpName, discordId, steamId)
 * - Banque: dernières transactions
 * - Sanctions: nombre actif
 * - Absences: nombre ouvert
 *
 * ✅ Sécurisé: session requise + membre lié
 * ✅ Graceful: retourne null/[] si tables manquent, ne crash pas
 */
export async function GET(req: NextRequest) {
  try {
    const session = await auth();
    if (!session) {
      console.warn("[dashboard] No session");
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const userId = (session as any)?.user?.id ?? (session as any)?.userId;
    const sessionDiscordId = (session as any)?.discordId ?? (session as any)?.user?.discordId;

    const scope = await getMemberScopeOrNull(session);
    if (!scope) {
      console.warn("[dashboard] scope null", { userId, discordId: sessionDiscordId });
      return NextResponse.json(
        { ok: false, code: "MEMBER_NOT_LINKED" },
        { status: 403 }
      );
    }

    const { discordId, rpName, memberId } = scope;

    // Load member for steamId and familyId
    let steamId: string | null = null;
    let FAMILY_ID: string | null = null;
    let playtime7d = 0;
    let playtimeRequiredMinutes: number | null = null;
    try {
      const member = await prisma.member.findUnique({
        where: { id: memberId },
        select: {
          steamId: true,
          familyId: true,
          playtime7d: true,
          playtimeRequiredMinutes: true,
        },
      });
      steamId = member?.steamId ?? null;
      FAMILY_ID = member?.familyId ?? null;
      playtime7d = typeof member?.playtime7d === "number" ? member.playtime7d : 0;
      playtimeRequiredMinutes = member?.playtimeRequiredMinutes ?? null;
    } catch (e) {
      steamId = null;
    }

    // If member familyId not available, resolve from slug
    if (!FAMILY_ID) {
      try {
        FAMILY_ID = await resolveFamilyId(DEFAULT_FAMILY_ID);
      } catch (e) {
        console.error("[dashboard] resolveFamilyId failed and member has no familyId", e);
        return NextResponse.json(
          { ok: false, error: "Erreur de configuration famille" },
          { status: 500 }
        );
      }
    }

    // Load bank transactions (last 5)
    let bank: any = {
      lastTransactions: [],
      balance: null,
      lastUpdate: null,
    };
    try {
      if (steamId) {
        const transactions = await prisma.bankLog.findMany({
          where: { familyId: FAMILY_ID, steamId },
          orderBy: { at: "desc" },
          take: 5,
          select: {
            at: true,
            type: true,
            money: true,
            raw: true,
          },
        });
        bank.lastTransactions = transactions.map((t: any) => ({
          date: t.at.toISOString(),
          type: t.type,
          amount: t.money,
          raw: t.raw,
        }));
        if (transactions.length > 0) {
          bank.lastUpdate = transactions[0].at.toISOString();
        }
      }
    } catch (e) {
      // BankLog table might not exist
      bank.lastTransactions = [];
      bank.lastUpdate = null;
    }

    // Load active sanctions count
    let sanctions: any = {
      activeCount: 0,
      last: null,
    };
    try {
      sanctions.activeCount = await prisma.sanction.count({
        where: {
          familyId: FAMILY_ID,
          discordId,
          status: "ACTIVE",
          clearedAt: null,
        },
      });
      // Get last sanction
      const lastSanction = await prisma.sanction.findFirst({
        where: {
          familyId: FAMILY_ID,
          discordId,
        },
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          type: true,
          reason: true,
          status: true,
          createdAt: true,
        },
      });
      if (lastSanction) {
        sanctions.last = {
          id: lastSanction.id,
          type: lastSanction.type,
          reason: lastSanction.reason,
          status: lastSanction.status,
          createdAt: lastSanction.createdAt.toISOString(),
        };
      }
    } catch (e) {
      // Sanction table might not exist
      sanctions.activeCount = 0;
      sanctions.last = null;
    }

    // Load open absences count
    let absences: any = {
      openCount: 0,
      last: null,
    };
    try {
      const now = new Date();
      absences.openCount = await prisma.absence.count({
        where: {
          familyId: FAMILY_ID,
          discordId,
          status: { in: ["PENDING", "APPROVED"] },
          endAt: { gte: now },
        },
      });
      // Get last absence
      const lastAbsence = await prisma.absence.findFirst({
        where: {
          familyId: FAMILY_ID,
          discordId,
        },
        orderBy: { startAt: "desc" },
        select: {
          id: true,
          reason: true,
          status: true,
          startAt: true,
          endAt: true,
        },
      });
      if (lastAbsence) {
        absences.last = {
          id: lastAbsence.id,
          reason: lastAbsence.reason,
          status: lastAbsence.status,
          startAt: lastAbsence.startAt.toISOString(),
          endAt: lastAbsence.endAt.toISOString(),
        };
      }
    } catch (e) {
      // Absence table might not exist
      absences.openCount = 0;
      absences.last = null;
    }

    // Calcul du déficit bancaire (réutilise la même logique que le module staff)
    let debt: { eligible: boolean; net: number; deficitAmount: number } = {
      eligible: false,
      net: 0,
      deficitAmount: 0,
    };
    try {
      const debtResult = await getMemberDebt({ familyId: FAMILY_ID, memberId });
      if ("net" in debtResult && typeof debtResult.net === "number") {
        debt = {
          eligible: debtResult.net < 0,
          net: debtResult.net,
          deficitAmount: debtResult.deficitAmount ?? 0,
        };
      }
    } catch {
      // Non bloquant : le déficit reste à 0 si le calcul échoue
    }

    // ── Hiérarchie famille : qui contacter, visible directement par le membre.
    // Construit depuis le mirror des rôles Discord. Chacun apparaît une seule
    // fois, dans son tier le plus haut (Chef > Sous-Chef > Chef EM > EM > Encadrant).
    const LEADERSHIP_TIERS: Array<{ tier: string; roleId: string }> = [
      { tier: "Chef famille", roleId: "1429607761720770623" },
      { tier: "Sous-Chef famille", roleId: "1488610892282335314" },
      { tier: "Chef État-Major", roleId: "1312845999366209686" }, // Consejero
      { tier: "État-Major", roleId: "1312845999366209683" },
      { tier: "Encadrant", roleId: "1497293700831903774" },
    ];
    let leadership: Array<{ tier: string; members: Array<{ rpName: string | null; avatarUrl: string | null }> }> = [];
    try {
      const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
      const leaders = await prisma.member.findMany({
        where: {
          familyId: familyDbId,
          isActive: true,
          isGhost: false,
          discordInGuild: true,
          discordRoleIds: { hasSome: LEADERSHIP_TIERS.map((t) => t.roleId) },
          // Masqués : absents de la hiérarchie affichée aux membres. Le
          // `discordId: null` évite d'écarter au passage les membres sans
          // Discord — `NOT IN` vaut NULL sur une colonne nulle, donc exclut.
          OR: [
            { discordId: null },
            { discordId: { notIn: [...HIDDEN_MEMBER_DISCORD_IDS] } },
          ],
        },
        select: { rpName: true, discordId: true, discordAvatarHash: true, discordRoleIds: true },
      });
      const seen = new Set<string>();
      leadership = LEADERSHIP_TIERS.map(({ tier, roleId }) => ({
        tier,
        members: leaders
          .filter((m) => {
            if (!m.discordId || seen.has(m.discordId)) return false;
            if (!(m.discordRoleIds as string[]).includes(roleId)) return false;
            seen.add(m.discordId);
            return true;
          })
          .sort((a, b) => (a.rpName ?? "").localeCompare(b.rpName ?? ""))
          .map((m) => ({
            rpName: m.rpName,
            avatarUrl: getDiscordAvatarUrl(m.discordId, m.discordAvatarHash),
          })),
      })).filter((t) => t.members.length > 0);
    } catch {
      // Non bloquant : le dashboard reste utilisable sans la hiérarchie.
    }

    // Playtime membre : visible lundi→vendredi, masqué samedi & dimanche.
    // (Calculé côté serveur → la valeur n'est même pas envoyée le week-end.)
    const playtimeHidden = isMemberPlaytimeHidden();
    const requiredMinutes =
      typeof playtimeRequiredMinutes === "number" && playtimeRequiredMinutes >= 0
        ? playtimeRequiredMinutes
        : 300;
    const playtime = playtimeHidden
      ? { visible: false, minutes: null as number | null, requiredMinutes }
      : { visible: true, minutes: playtime7d, requiredMinutes };

    return NextResponse.json({
      ok: true,
      member: {
        rpName,
        discordId,
        steamId,
      },
      bank,
      sanctions,
      absences,
      debt,
      leadership,
      playtime,
    });
  } catch (error) {
    console.error("[api/member/dashboard] error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
