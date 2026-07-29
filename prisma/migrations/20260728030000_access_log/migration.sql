-- Journal des accès au panel : connexions, tentatives et refus.
CREATE TABLE "AccessLog" (
    "id" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "event" TEXT NOT NULL,
    "reason" TEXT,
    "discordId" TEXT,
    "userId" TEXT,
    "rpName" TEXT,
    "username" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,

    CONSTRAINT "AccessLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AccessLog_at_idx" ON "AccessLog"("at");
CREATE INDEX "AccessLog_discordId_at_idx" ON "AccessLog"("discordId", "at");
CREATE INDEX "AccessLog_event_at_idx" ON "AccessLog"("event", "at");
