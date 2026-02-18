import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const [sessions, tokens] = await Promise.all([
    prisma.session.deleteMany({}),
    prisma.verificationToken.deleteMany({}),
  ]);

  console.log("Cleared sessions:", sessions.count);
  console.log("Cleared verification tokens:", tokens.count);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
