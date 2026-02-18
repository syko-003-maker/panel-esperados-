import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { getMemberScopeOrNull } from "@/server/member/scope";

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
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
    }

    const scope = await getMemberScopeOrNull(session);
    if (!scope) {
      return NextResponse.json(
        { ok: false, code: "MEMBER_NOT_LINKED" },
        { status: 403 }
      );
    }

    const { discordId, rpName, memberId } = scope;
    const FAMILY_ID = "esperados";

    // Load member for steamId and other details
    let steamId: string | null = null;
    try {
      const member = await prisma.member.findUnique({
        where: { id: memberId },
        select: {
          steamId: true,
          familyId: true,
        },
      });
      steamId = member?.steamId ?? null;
    } catch (e) {
      // Table might not exist in test env
      steamId = null;
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
    });
  } catch (error) {
    console.error("[api/member/dashboard] error:", error);
    return NextResponse.json(
      { ok: false, error: "Internal server error" },
      { status: 500 }
    );
  }
}
