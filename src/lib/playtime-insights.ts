import { getMinutesSinceWeekStart } from "@/lib/lyg/fetchFamilyPlaytimes7d";

export type PlaytimeWatchFlag =
  | "ZERO_PLAYTIME"
  | "STRONG_DROP"
  | "LOW_TWO_WEEKS"
  | "NON_LINK_ZERO"
  | "DEMOTED_ZERO";

export function getCurrentPlaytimeWeekStart(now: Date = new Date()): Date {
  return getMinutesSinceWeekStart(now).weekStart;
}

export function getPreviousPlaytimeWeekStart(now: Date = new Date()): Date {
  const currentWeekStart = getCurrentPlaytimeWeekStart(now);
  return new Date(currentWeekStart.getTime() - 7 * 24 * 60 * 60 * 1000);
}

export function buildPlaytimeWatchFlags(input: {
  currentPlaytime7d: number;
  previousPlaytime7d: number | null;
  discordId: string | null;
  grade: string | null;
}): PlaytimeWatchFlag[] {
  const flags = new Set<PlaytimeWatchFlag>();
  const current = Math.max(0, input.currentPlaytime7d || 0);
  const previous = input.previousPlaytime7d == null ? null : Math.max(0, input.previousPlaytime7d);

  if (current === 0) {
    flags.add("ZERO_PLAYTIME");
  }

  if (previous != null && previous >= 120 && current <= previous - 120) {
    flags.add("STRONG_DROP");
  }

  if (previous != null && previous < 100 && current < 100) {
    flags.add("LOW_TWO_WEEKS");
  }

  if (!input.discordId && current === 0) {
    flags.add("NON_LINK_ZERO");
  }

  if (input.grade === "Demote" && current === 0) {
    flags.add("DEMOTED_ZERO");
  }

  return Array.from(flags);
}