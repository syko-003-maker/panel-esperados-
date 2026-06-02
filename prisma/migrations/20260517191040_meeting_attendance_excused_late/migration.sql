-- L'enum DB confondait Excusé / Absence justifiée (les deux → JUSTIFIED)
-- et En retard / Présent (les deux → PRESENT). On ajoute les deux valeurs
-- manquantes pour que la sélection UI soit préservée jusqu'à la base.
ALTER TYPE "MeetingRowAttendanceStatus" ADD VALUE IF NOT EXISTS 'EXCUSED';
ALTER TYPE "MeetingRowAttendanceStatus" ADD VALUE IF NOT EXISTS 'LATE';
