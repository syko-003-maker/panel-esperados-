import { prisma } from "@/lib/db";

const discordId = process.env.DISCORD_ID || "408937062838829056";
const fallbackUserId = process.env.USER_ID || null;

async function main() {
  const account = await prisma.account.findFirst({
    where: { provider: "discord", providerAccountId: discordId },
    include: { user: true },
  });

  const userId = account?.user?.id ?? fallbackUserId;
  if (!userId) {
    console.error("No user found for DISCORD_ID:", discordId, "and no USER_ID provided.");
    return;
  }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { isStaff: true },
    select: { id: true, email: true, name: true, isStaff: true },
  });

  console.log("Promoted user to staff:", updated);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
