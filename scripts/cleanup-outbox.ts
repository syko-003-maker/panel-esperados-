import { prisma } from "@/lib/db";

async function main() {
  console.log("[cleanup-outbox] start");

  try {
    const result = await prisma.discordOutbox.updateMany({
      where: { status: { not: "SENT" } },
      data: { status: "FAILED", nextAttemptAt: new Date() },
    });

    console.log(`[cleanup-outbox] done: ${result.count} job(s) set to FAILED`);
  } catch (err) {
    console.error("[cleanup-outbox] failed:", err);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect().catch(() => null);
  }
}

main();
