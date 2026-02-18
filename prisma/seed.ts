import dotenv from "dotenv";

dotenv.config({ path: ".env" });
dotenv.config({ path: ".env.local", override: true });

const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const FAMILY_ID = "esperados";
const DEFAULT_FAMILY_NAME = "Los Esperados";
const DEFAULT_STEAM_ID = "76561198000000000";
const DEFAULT_RP_NAME = "Test Member";

async function main() {
  const seedSteamIdRaw = String(process.env.SEED_STEAM_ID ?? DEFAULT_STEAM_ID).trim();
  const seedDiscordIdRaw = process.env.SEED_DISCORD_ID;
  const seedDiscordId = seedDiscordIdRaw ? String(seedDiscordIdRaw).trim() : "";
  const steamId = seedSteamIdRaw || null;

  console.log("DEBUG SEED env:", {
    SEED_DISCORD_ID: seedDiscordId,
    SEED_STEAM_ID: seedSteamIdRaw,
  });

  await prisma.family.upsert({
    where: { slug: FAMILY_ID },
    update: { name: DEFAULT_FAMILY_NAME },
    create: { slug: FAMILY_ID, name: DEFAULT_FAMILY_NAME },
  });

  if (!seedDiscordId) {
    console.warn("SEED: SEED_DISCORD_ID not set, skipping member upsert");
    return;
  }

  const member = await prisma.member.upsert({
    where: { familyId_discordId: { familyId: FAMILY_ID, discordId: seedDiscordId } },
    update: {
      rpName: DEFAULT_RP_NAME,
      steamId,
    },
    create: {
      familyId: FAMILY_ID,
      discordId: seedDiscordId,
      steamId,
      rpName: DEFAULT_RP_NAME,
    },
  });

  console.log(`SEED: upserted member ${member.id} with discordId=${seedDiscordId}`);
}

main()
  .then(() => {
    console.log("SEED: done");
    process.exit(0);
  })
  .catch((err) => {
    console.error("SEED: failed", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
