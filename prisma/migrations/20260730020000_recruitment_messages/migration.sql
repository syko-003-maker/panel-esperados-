-- Messages archivés d'un ticket de recrutement.
--
-- Le fil Discord est verrouillé puis archivé à la décision, et peut être
-- supprimé : sans copie, la conversation qui justifie la décision disparaît.

CREATE TABLE "RecruitmentMessage" (
    "id" TEXT NOT NULL,
    "recruitmentId" TEXT NOT NULL,
    "discordMessageId" TEXT NOT NULL,
    "authorDiscordId" TEXT NOT NULL DEFAULT 'unknown',
    "authorNameSnapshot" TEXT NOT NULL DEFAULT 'Unknown',
    "authorIsBot" BOOLEAN NOT NULL DEFAULT false,
    "content" TEXT NOT NULL DEFAULT '',
    "embedsText" TEXT,
    "attachmentsJson" JSONB,
    "createdAtDiscord" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "editedAtDiscord" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecruitmentMessage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "RecruitmentMessage_discordMessageId_key"
    ON "RecruitmentMessage"("discordMessageId");

CREATE INDEX "RecruitmentMessage_recruitmentId_createdAtDiscord_idx"
    ON "RecruitmentMessage"("recruitmentId", "createdAtDiscord");

ALTER TABLE "RecruitmentMessage"
    ADD CONSTRAINT "RecruitmentMessage_recruitmentId_fkey"
    FOREIGN KEY ("recruitmentId") REFERENCES "Recruitment"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
