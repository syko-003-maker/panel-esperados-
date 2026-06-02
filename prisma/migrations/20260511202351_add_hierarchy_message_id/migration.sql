-- Add hierarchyMessageId to DiscordConfig for auto-sync embed hiérarchie
ALTER TABLE "DiscordConfig" ADD COLUMN IF NOT EXISTS "hierarchyMessageId" TEXT;
