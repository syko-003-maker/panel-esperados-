export type RecruitmentLegacyNotes = {
  staffNotes?: string | null;
  claimedById?: string | null;
  claimedAt?: string | null;
  answersJson?: Record<string, string>;
  scoresJson?: Record<string, number>;
};

function normalizeNoteString(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

export function parseRecruitmentNotes(notes: string | null): RecruitmentLegacyNotes {
  if (!notes) return {};
  try {
    const parsed = JSON.parse(notes);
    if (parsed && typeof parsed === "object") return parsed as RecruitmentLegacyNotes;
  } catch {
    // ignore
  }
  return { staffNotes: notes };
}

export function buildRecruitmentNotes(
  existing: RecruitmentLegacyNotes,
  updates: RecruitmentLegacyNotes
) {
  const next: RecruitmentLegacyNotes = { ...existing, ...updates };
  const staffNotes = normalizeNoteString(next.staffNotes);
  const hasStructured =
    Boolean(next.claimedById) ||
    Boolean(next.claimedAt) ||
    Boolean(next.answersJson && Object.keys(next.answersJson).length > 0) ||
    Boolean(next.scoresJson && Object.keys(next.scoresJson).length > 0);

  if (!hasStructured) {
    return staffNotes;
  }

  return JSON.stringify({
    staffNotes,
    claimedById: normalizeNoteString(next.claimedById),
    claimedAt: normalizeNoteString(next.claimedAt),
    answersJson: next.answersJson ?? null,
    scoresJson: next.scoresJson ?? null,
  });
}
