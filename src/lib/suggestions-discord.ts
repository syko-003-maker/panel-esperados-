import { prisma } from "@/lib/db";
import { resolveFamilyId, DEFAULT_FAMILY_ID } from "@/lib/family";

/** Helpers partagés par les endpoints /api/discord/suggestions/* (auth worker). */

const WORKER_SECRET = process.env.DISCORD_WORKER_SECRET ?? process.env.INGEST_SECRET;

export function checkWorkerAuth(req: Request): boolean {
  const provided =
    req.headers.get("x-ingest-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  return Boolean(WORKER_SECRET) && provided === WORKER_SECRET;
}

export async function memberByDiscord(discordId: string) {
  const familyDbId = await resolveFamilyId(DEFAULT_FAMILY_ID);
  return prisma.member.findFirst({
    where: { discordId, familyId: familyDbId, isActive: true },
    select: { id: true, rpName: true },
  });
}
