-- Auto-attendance écrasait les éditions manuelles du staff à chaque GET.
-- On ajoute un flag qui désactive l'auto pour les rows touchées manuellement.
ALTER TABLE "MeetingRow"
  ADD COLUMN "attendanceLockedByStaff" BOOLEAN NOT NULL DEFAULT false;
