-- AlterTable: DiscordConfig — rappels de dettes intelligents
ALTER TABLE "DiscordConfig" ADD COLUMN "bankDebtPingCooldownDays" INTEGER NOT NULL DEFAULT 7;
ALTER TABLE "DiscordConfig" ADD COLUMN "bankDebtAutoEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DiscordConfig" ADD COLUMN "bankDebtEscalateAfter" INTEGER NOT NULL DEFAULT 3;
ALTER TABLE "DiscordConfig" ADD COLUMN "bankDebtStaffChannelId" TEXT;

-- CreateTable: BankDebtReminderState
CREATE TABLE "BankDebtReminderState" (
    "id" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "discordId" TEXT,
    "reminderCount" INTEGER NOT NULL DEFAULT 0,
    "firstRemindedAt" TIMESTAMP(3),
    "lastRemindedAt" TIMESTAMP(3),
    "lastDebtAmount" INTEGER NOT NULL DEFAULT 0,
    "peakDebtAmount" INTEGER NOT NULL DEFAULT 0,
    "staffAlertedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BankDebtReminderState_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BankDebtReminderState_memberId_key" ON "BankDebtReminderState"("memberId");
CREATE INDEX "BankDebtReminderState_familyId_idx" ON "BankDebtReminderState"("familyId");
