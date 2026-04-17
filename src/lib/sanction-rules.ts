import { prisma } from "@/lib/db";
import { createAuditLog } from "@/lib/audit";
import { DEFAULT_FAMILY_ID } from "@/lib/family";
import type { SanctionType } from "@prisma/client";
import { getSanctionExpirationDate } from "@/lib/sanctions";

/**
 * Automatic sanction rules engine
 * Triggered when:
 * 1. A new sanction is created
 * 2. A sanction is cleared/expired
 *
 * Rules:
 * - 2x AVERT_LEGER actifs → AVERT_LOURD
 * - 1x AVERT_LOURD + 1x AVERT_LEGER actifs → DEMOTE
 * - 2x AVERT_LOURD actifs → DEMOTE
 */

export async function evaluateSanctionRules(
  memberId: string,
  familyId: string = DEFAULT_FAMILY_ID
) {
  // === CRITICAL SAFETY CHECK ===
  const enabled = process.env.ENABLE_AUTO_SANCTION_RULES === "1";
  if (!enabled) {
    // Silently return - rules are disabled (safe default)
    return;
  }

  try {
    const now = new Date();
    const activeSanctions = (await prisma.sanction.findMany({
      where: {
        memberId,
        familyId,
        status: "ACTIVE",
        clearedAt: null,
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    })) as any[];

    const avertLeger = activeSanctions.filter((s) => s.type === "AVERT_LEGER");
    const avertLourd = activeSanctions.filter((s) => s.type === "AVERT_LOURD");
    const demotes = activeSanctions.filter((s) => s.type === "DEMOTE");
    const blacklists = activeSanctions.filter((s) => s.type === "BLACKLIST");
    const hasActiveHeavy = avertLourd.length > 0;

    if (blacklists.length > 0 || demotes.length > 0) return;

    if (avertLourd.length >= 2) {
      await createAutoSanction(memberId, familyId, "DEMOTE", "Escalade automatique: 2 avertos lourds actifs");
      return;
    }

    if (hasActiveHeavy && avertLeger.length >= 1) {
      await createAutoSanction(memberId, familyId, "DEMOTE", "Escalade automatique: 1 averto lourd + 1 averto léger actifs");
      return;
    }

    if (avertLeger.length >= 2) {
      await createAutoSanction(memberId, familyId, "AVERT_LOURD", "Escalade automatique: 2 avertos légers actifs");
      return;
    }
  } catch (err) {
    console.error("[evaluateSanctionRules] Error:", err);
  }
}

async function createAutoSanction(
  memberId: string,
  familyId: string,
  type: SanctionType,
  reason: string
) {
  try {
    const member = await prisma.member.findUnique({
      where: { id: memberId },
      select: { id: true, discordId: true, rpName: true },
    });

    if (!member || !member.discordId) return;

    const duplicate = await prisma.sanction.findFirst({
      where: {
        familyId,
        memberId,
        type,
        status: "ACTIVE",
        clearedAt: null,
      },
      select: { id: true },
    });

    if (duplicate) return;

    const startAt = new Date();
    const sanction = await prisma.sanction.create({
      data: {
        familyId,
        memberId: member.id,
        discordId: member.discordId,
        type,
        reason,
        status: "ACTIVE",
        discordStatus: "PENDING",
        startAt,
        expiresAt: getSanctionExpirationDate(type, startAt),
        createdById: "SYSTEM",
      } as any,
    });

    const logChannelId = process.env.SANCTION_LOG_CHANNEL_ID;
    if (logChannelId) {
      const outbox = await prisma.discordOutbox.create({
        data: {
          familyId,
          type: "SANCTION_APPLY",
          status: "PENDING",
          channelId: logChannelId,
          userDiscordId: member.discordId,
          entity: "Sanction",
          entityId: sanction.id,
          meta: {
            sanctionId: sanction.id,
            memberId: member.id,
            memberDiscordId: member.discordId,
            memberName: member.rpName,
            type,
            reason,
          },
        } as any,
      });

      await prisma.sanction.update({
        where: { id: sanction.id },
        data: { outboxJobId: outbox.id } as any,
      });
    }

    await createAuditLog({
      actorType: "worker",
      actorId: "sanction-rules-engine",
      action: "SANCTION_AUTO_APPLIED",
      entity: "Sanction",
      entityId: sanction.id,
      meta: {
        memberId,
        type,
        reason,
        trigger: "auto-rules",
      },
    });
  } catch (err) {
    console.error("[createAutoSanction] Error:", err);
  }
}
