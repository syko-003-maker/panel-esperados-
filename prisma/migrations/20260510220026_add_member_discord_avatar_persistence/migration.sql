-- Add discord avatar hash persistence to Member
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "discordAvatarHash" TEXT;
ALTER TABLE "Member" ADD COLUMN IF NOT EXISTS "discordAvatarFetchedAt" TIMESTAMP(3);
