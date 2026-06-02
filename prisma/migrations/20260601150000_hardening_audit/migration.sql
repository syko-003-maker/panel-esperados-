-- DropForeignKey
ALTER TABLE "LygCredential" DROP CONSTRAINT "LygCredential_familyId_fkey";

-- AlterTable
ALTER TABLE "LinkRequest" ALTER COLUMN "familyId" DROP DEFAULT;

-- AlterTable
ALTER TABLE "LygCredential" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "Meeting" ALTER COLUMN "familyId" DROP DEFAULT;

-- CreateIndex
CREATE INDEX "Absence_createdById_idx" ON "Absence"("createdById");

-- CreateIndex
CREATE INDEX "Account_userId_idx" ON "Account"("userId");

-- CreateIndex
CREATE INDEX "Complaint_createdById_idx" ON "Complaint"("createdById");

-- CreateIndex
CREATE INDEX "Recruitment_createdById_idx" ON "Recruitment"("createdById");

-- CreateIndex
CREATE INDEX "Sanction_createdById_idx" ON "Sanction"("createdById");

-- CreateIndex
CREATE INDEX "Sanction_closedById_idx" ON "Sanction"("closedById");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE INDEX "StaffUser_roleId_idx" ON "StaffUser"("roleId");

-- AddForeignKey
ALTER TABLE "LygCredential" ADD CONSTRAINT "LygCredential_familyId_fkey" FOREIGN KEY ("familyId") REFERENCES "Family"("id") ON DELETE CASCADE ON UPDATE CASCADE;

