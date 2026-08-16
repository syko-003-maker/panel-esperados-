import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireStaffAccess } from "@/lib/rbac";
import { DEFAULT_FAMILY_ID, toFamilyCuid } from "@/lib/family";
import { enqueueRemoveRole } from "@/lib/discord/discord";
import { getAvertRoleId } from "@/lib/sanctions";

// This endpoint can be called without auth for cron jobs
// Use a secret header for security
const CRON_SECRET = process.env.CRON_SECRET;

/**
 * Deux secrets acceptés, comme toutes les routes `/api/cron/*`.
 *
 * Le worker ne dispose que d'`INGEST_SECRET` (il charge son propre .env.prod,
 * où `CRON_SECRET` est absent). N'accepter que `x-cron-secret` condamnait donc
 * cette route à répondre 401 au worker — sans bruit, puisque personne ne
 * l'appelait. `x-cron-secret` reste accepté pour les appels manuels existants.
 */
function validateCronSecret(req: Request): boolean {
  const cronSecret = req.headers.get("x-cron-secret");
  if (CRON_SECRET && cronSecret && cronSecret === CRON_SECRET) return true;

  const ingestSecret = req.headers.get("x-ingest-secret");
  const expectedIngest = process.env.INGEST_SECRET;
  if (expectedIngest && ingestSecret && ingestSecret === expectedIngest) return true;

  return false; // Aucun secret valide, ou aucun secret configuré — fail safe
}

/**
 * POST /api/admin/expire-sanctions
 * Auto-expire sanctions that have passed their expiresAt date
 * Called by cron job
 */
export async function POST(req: NextRequest) {
  // Validate cron secret
  if (!validateCronSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // Les 276 sanctions portent le CUID de la famille ; `DEFAULT_FAMILY_ID` est un
  // slug. Sans cette normalisation le `where` ne remontait rien : la route
  // répondait 200 en n'expirant strictement aucune sanction.
  const familyId = await toFamilyCuid(req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID);
  const now = new Date();

  try {
    const guildId = process.env.DISCORD_GUILD_ID ?? process.env.GUILD_ID ?? "";

    const expiredSanctions = await prisma.sanction.findMany({
      where: {
        familyId,
        status: "ACTIVE",
        expiresAt: { lt: now },
      },
      select: {
        id: true,
        familyId: true,
        discordId: true,
        type: true,
      },
    });

    if (expiredSanctions.length === 0) {
      return NextResponse.json({
        ok: true,
        expired: 0,
        message: "No expired sanctions found",
      });
    }

    for (const sanction of expiredSanctions) {
      const roleId = getAvertRoleId(sanction.type);
      const shouldQueueCleanup = Boolean(roleId && sanction.discordId && guildId);

      await prisma.sanction.update({
        where: { id: sanction.id },
        data: {
          status: "EXPIRED",
          closedAt: now,
          clearedStatus: shouldQueueCleanup ? "PENDING" : undefined,
          clearedError: shouldQueueCleanup ? null : undefined,
        } as any,
      });

      if (shouldQueueCleanup) {
        await enqueueRemoveRole({
          familyId: sanction.familyId,
          guildId,
          userDiscordId: sanction.discordId!,
          roleId: roleId!,
          entity: "Sanction",
          entityId: sanction.id,
          meta: {
            sanctionId: sanction.id,
            sanctionType: sanction.type,
            setClearedAt: false,
          },
        });
      }
    }

    console.log(JSON.stringify({
      event: "sanctions_expired",
      count: expiredSanctions.length,
      sanctions: expiredSanctions.map((s) => ({
        id: s.id,
        discordId: s.discordId,
        type: s.type,
      })),
      timestamp: now.toISOString(),
    }));

    return NextResponse.json({
      ok: true,
      expired: expiredSanctions.length,
      sanctions: expiredSanctions.map((s) => ({
        id: s.id,
        discordId: s.discordId,
        type: s.type,
      })),
    });
  } catch (error: any) {
    console.error("[/api/admin/expire-sanctions]", error);
    return NextResponse.json(
      { ok: false, error: error.message ?? "Expire sanctions failed" },
      { status: 500 }
    );
  }
}

/**
 * GET - for health check / status
 */
export async function GET(req: NextRequest) {
  // Health/status : accessible via secret cron (monitoring) OU staff connecté.
  // Avant : aucun contrôle (fuite mineure des compteurs de sanctions).
  if (!validateCronSecret(req)) {
    const guard = await requireStaffAccess();
    if (guard instanceof Response) return guard;
  }

  // Même normalisation que le POST : sans elle ce diagnostic renvoyait des
  // compteurs à zéro, ce qui aurait fait croire à l'absence de sanctions.
  const familyId = await toFamilyCuid(req.nextUrl.searchParams.get("familyId") ?? DEFAULT_FAMILY_ID);

  try {
    const counts = await prisma.sanction.groupBy({
      by: ["status"],
      where: { familyId },
      _count: true,
    });

    const pendingExpiration = await prisma.sanction.count({
      where: {
        familyId,
        status: "ACTIVE",
        expiresAt: { lt: new Date() },
      },
    });

    return NextResponse.json({
      ok: true,
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count])),
      pendingExpiration,
    });
  } catch (error: any) {
    return NextResponse.json(
      { ok: false, error: error.message },
      { status: 500 }
    );
  }
}
