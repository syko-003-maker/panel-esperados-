-- Dernier rang avant passage réserviste (pour restaurer au retour)
ALTER TABLE "Member" ADD COLUMN "preReservistGrade" TEXT;
ALTER TABLE "Member" ADD COLUMN "preReservistRoleId" TEXT;
