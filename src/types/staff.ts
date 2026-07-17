export type StaffAbsenceDto = {
  id: string;
  type: "MEETING" | "GENERAL";
  meetingDate: string | null;
  reason: string | null;
  startAt: string;
  endAt: string;
  upcoming?: boolean;
};

export type StaffMemberDto = {
  id: string;
  steamId: string | null;
  discordId: string | null;
  rpName: string | null;
  /** Pseudo Discord (nickname serveur) — pour repérer un nom in-game différent. */
  discordDisplayName: string | null;
  familyName: string | null;
  currentGradeName: string | null;
  rankRoleId: string | null;
  rankLabel: string | null;
  grade: string | null;
  gradeLevel: number | null;
  discordAvatarHash: string | null;
  discordRolesUpdatedAt: string | null;
  discordLastError: string | null;
  playtime7d: number;
  playtime7dUpdatedAt: string | null;
  /** Exception de playtime requis (réunion). null = seuil par défaut (300). */
  playtimeRequiredMinutes: number | null;
  updatedAt: string;
  previousPlaytime7d: number | null;
  playtimeDelta7d: number | null;
  activeAbsence?: StaffAbsenceDto | null;
};

export type MemberItem = StaffMemberDto;
