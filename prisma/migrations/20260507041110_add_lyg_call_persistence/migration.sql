-- CreateTable
CREATE TABLE "LygCall" (
    "id" TEXT NOT NULL,
    "service" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "ok" BOOLEAN NOT NULL,
    "status" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LygCall_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LygCall_createdAt_idx" ON "LygCall"("createdAt");

-- CreateIndex
CREATE INDEX "LygCall_service_createdAt_idx" ON "LygCall"("service", "createdAt");
