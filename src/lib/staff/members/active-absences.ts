/**
 * Enrichit chaque row avec son éventuelle absence active (incluant les
 * absences qui démarrent dans les 48h suivantes — pour anticipation UI).
 *
 * Extrait de app/api/staff/members/route.ts (Lot 7).
 */

import { prisma } from "@/lib/db";
import { parseAbsenceMeta } from "@/lib/meetings";
import type { StaffMemberDto } from "@/types/staff";

const UPCOMING_WINDOW_MS = 48 * 60 * 60 * 1000;

export interface ActiveAbsencePayload {
  id: string;
  type: string | null;
  meetingDate: string | null;
  reason: string | null;
  startAt: string;
  endAt: string;
  upcoming: boolean;
}

export async function enrichRowsWithActiveAbsences(params: {
  rows: StaffMemberDto[];
  familyId: string;
}): Promise<void> {
  const { rows, familyId } = params;
  if (rows.length === 0) return;

  const now = new Date();
  const memberIds = rows.map((row) => row.id);
  const discordIds = rows
    .map((row) => row.discordId)
    .filter((value): value is string => typeof value === "string" && value.trim() !== "");

  if (memberIds.length === 0 && discordIds.length === 0) return;

  const upcoming = new Date(now.getTime() + UPCOMING_WINDOW_MS);

  const absences = await prisma.absence.findMany({
    where: {
      familyId,
      status: "APPROVED",
      startAt: { lte: upcoming },
      endAt: { gte: now },
      OR: [
        ...(memberIds.length > 0 ? [{ memberId: { in: memberIds } }] : []),
        ...(discordIds.length > 0 ? [{ discordId: { in: discordIds } }] : []),
      ],
    },
    orderBy: [{ endAt: "asc" }, { createdAt: "desc" }],
    select: {
      id: true,
      memberId: true,
      discordId: true,
      reason: true,
      notes: true,
      startAt: true,
      endAt: true,
    },
  });

  const byMemberId = new Map<string, ActiveAbsencePayload>();
  const byDiscordId = new Map<string, ActiveAbsencePayload>();

  for (const absence of absences) {
    const meta = parseAbsenceMeta(absence.notes);
    const payload: ActiveAbsencePayload = {
      id: absence.id,
      type: meta.type,
      meetingDate: meta.meetingDate,
      reason: absence.reason,
      startAt: absence.startAt.toISOString(),
      endAt: absence.endAt.toISOString(),
      upcoming: absence.startAt > now,
    };

    if (absence.memberId && !byMemberId.has(absence.memberId)) {
      byMemberId.set(absence.memberId, payload);
    }
    if (absence.discordId && !byDiscordId.has(absence.discordId)) {
      byDiscordId.set(absence.discordId, payload);
    }
  }

  for (const row of rows) {
    (row as any).activeAbsence =
      byMemberId.get(row.id) ?? (row.discordId ? byDiscordId.get(row.discordId) ?? null : null);
  }
}
