-- Add ghost member support fields to Member (safe additive migration)
ALTER TABLE "Member" ADD COLUMN "isGhost" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Member" ADD COLUMN "createdFrom" TEXT;
