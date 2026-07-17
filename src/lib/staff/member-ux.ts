import type { MemberItem } from "@/types/staff";
import { getMemberScopeFlags, isLinkedStaffMember } from "@/lib/staff/member-scope";

export type MemberStatus = "active" | "demoted" | "blacklisted" | "non_link" | "reservist";
export type ActivityBand = "inactive" | "low" | "active" | "high";
export type QuickFilter = "all" | "active" | "inactive" | "low" | "top" | "watch";
export type MemberFlagTone = "slate" | "emerald" | "amber" | "rose" | "cyan";

export type MemberFlag = {
  key: string;
  label: string;
  tone: MemberFlagTone;
  description: string;
};

const ACTIVITY_EXEMPT_GRADE_KEYWORDS = [
  "blacklist",
  "reserviste",
  "reservist",
  "chef famille",
  "chef de famille",
  "chef family",
  "wl1",
] as const;

export const ACTIVITY_VISUAL_THRESHOLDS = [
  {
    key: "inactive",
    label: "Inactif",
    minMinutes: 0,
    maxMinutes: 0,
    badgeClassName: "border-rose-500/30 bg-rose-500/12 text-rose-200",
    meterClassName: "from-rose-400/90 to-rose-500/70",
    rowClassName: "bg-rose-950/10 hover:bg-rose-950/18",
  },
  {
    key: "low",
    label: "Faible activité",
    minMinutes: 1,
    maxMinutes: 99,
    badgeClassName: "border-amber-500/30 bg-amber-500/12 text-amber-200",
    meterClassName: "from-amber-300/90 to-amber-500/75",
    rowClassName: "bg-amber-950/10 hover:bg-amber-950/18",
  },
  {
    key: "active",
    label: "Actif",
    minMinutes: 100,
    maxMinutes: 299,
    badgeClassName: "border-emerald-500/30 bg-emerald-500/12 text-emerald-200",
    meterClassName: "from-emerald-300/90 to-emerald-500/75",
    rowClassName: "bg-emerald-950/6 hover:bg-emerald-950/12",
  },
  {
    key: "high",
    label: "Très actif",
    minMinutes: 300,
    maxMinutes: Number.POSITIVE_INFINITY,
    badgeClassName: "border-cyan-500/30 bg-cyan-500/12 text-cyan-200",
    meterClassName: "from-cyan-300/90 to-cyan-500/75",
    rowClassName: "bg-cyan-950/8 hover:bg-cyan-950/14",
  },
] as const;

export const FLAG_TONE_CLASSNAMES: Record<MemberFlagTone, string> = {
  slate: "border-slate-600/60 bg-slate-800/70 text-slate-200",
  emerald: "border-emerald-500/30 bg-emerald-500/12 text-emerald-200",
  amber: "border-amber-500/30 bg-amber-500/12 text-amber-200",
  rose: "border-rose-500/30 bg-rose-500/12 text-rose-200",
  cyan: "border-cyan-500/30 bg-cyan-500/12 text-cyan-200",
};

export function normalizePlaytimeMinutes(playtime7d: number | null | undefined): number {
  return typeof playtime7d === "number" && Number.isFinite(playtime7d) ? Math.max(0, Math.floor(playtime7d)) : 0;
}

// Seuil de playtime requis par défaut (réunion). Une exception par membre
// (`playtimeRequiredMinutes`) remplace ce seuil : toute la logique d'activité
// (bandes, score, "à surveiller") se calcule alors RELATIVEMENT à ce seuil, pas
// à 300 fixe. Sinon un membre à 150 requis (accordé) serait compté comme les
// autres (à 300) et flaggé à tort.
export const DEFAULT_PLAYTIME_REQUIRED_MINUTES = 300;

export function getMemberRequiredMinutes(member: { playtimeRequiredMinutes?: number | null }): number {
  const v = member?.playtimeRequiredMinutes;
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : DEFAULT_PLAYTIME_REQUIRED_MINUTES;
}

export function hasCustomPlaytimeRequirement(member: { playtimeRequiredMinutes?: number | null }): boolean {
  const v = member?.playtimeRequiredMinutes;
  return (
    typeof v === "number" && Number.isFinite(v) && v > 0 && Math.floor(v) !== DEFAULT_PLAYTIME_REQUIRED_MINUTES
  );
}

export function getMemberStatus(member: MemberItem): MemberStatus {
  const flags = getMemberScopeFlags(member);

  if (flags.isBlacklisted) {
    return "blacklisted";
  }

  if (flags.isDemoted) {
    return "demoted";
  }

  if (flags.isReservist) {
    return "reservist";
  }

  if (!isLinkedStaffMember(member)) return "non_link";
  return "active";
}

function normalizeGradeLabel(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

export function isActivityExempt(member: MemberItem): boolean {
  if (getMemberStatus(member) === "blacklisted") return true;
  if (member.activeAbsence) return true;

  const gradeCandidates = [member.grade, member.rankLabel]
    .map(normalizeGradeLabel)
    .filter(Boolean);

  return gradeCandidates.some((candidate) =>
    ACTIVITY_EXEMPT_GRADE_KEYWORDS.some((keyword) => candidate.includes(keyword)),
  );
}

// Bandes calculées RELATIVEMENT au seuil requis : inactif=0, faible <1/3,
// actif entre 1/3 et le seuil, "très actif" une fois le seuil atteint. Pour 300
// requis ça donne exactement les paliers historiques (100 / 300).
export function getActivityBand(
  playtime7d: number | null | undefined,
  required: number = DEFAULT_PLAYTIME_REQUIRED_MINUTES,
) {
  const minutes = normalizePlaytimeMinutes(playtime7d);
  const req = required > 0 ? required : DEFAULT_PLAYTIME_REQUIRED_MINUTES;
  const byKey = (k: string) =>
    ACTIVITY_VISUAL_THRESHOLDS.find((t) => t.key === k) ??
    ACTIVITY_VISUAL_THRESHOLDS[ACTIVITY_VISUAL_THRESHOLDS.length - 1];
  if (minutes <= 0) return byKey("inactive");
  if (minutes >= req) return byKey("high");
  if (minutes >= req / 3) return byKey("active");
  return byKey("low");
}

export function getActivityScore(
  playtime7d: number | null | undefined,
  required: number = DEFAULT_PLAYTIME_REQUIRED_MINUTES,
): number {
  const minutes = normalizePlaytimeMinutes(playtime7d);
  const req = required > 0 ? required : DEFAULT_PLAYTIME_REQUIRED_MINUTES;
  return Math.max(0, Math.min(100, Math.round((minutes / req) * 100)));
}

export function getActivityProgress(
  playtime7d: number | null | undefined,
  required: number = DEFAULT_PLAYTIME_REQUIRED_MINUTES,
): number {
  return Math.max(4, getActivityScore(playtime7d, required));
}

export function formatPlaytimeDelta(delta: number | null | undefined): string {
  if (delta == null) return "-";
  if (delta === 0) return "=";

  const minutes = Math.max(0, Math.floor(Math.abs(delta)));
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  const sign = delta > 0 ? "+" : "-";

  if (hours <= 0) {
    return `${sign}${remainder} min`;
  }

  return remainder > 0 ? `${sign}${hours}h ${remainder}` : `${sign}${hours}h`;
}

export function isWatchMember(member: MemberItem, analyticsAvailable: boolean): boolean {
  if (isActivityExempt(member)) return false;

  const status = getMemberStatus(member);
  const minutes = normalizePlaytimeMinutes(member.playtime7d);
  const delta = member.playtimeDelta7d ?? null;

  if (status === "non_link" && minutes === 0) return true;
  if (status === "demoted" && minutes === 0) return true;
  if (status === "reservist" && minutes === 0) return false;
  if (analyticsAvailable && typeof delta === "number" && delta <= -120) return true;
  // "À surveiller" = actif mais sous le tiers de SON seuil requis (perso ou 300).
  const req = getMemberRequiredMinutes(member);
  return status === "active" && minutes < Math.max(1, req / 3);
}

export function getMemberFlags(member: MemberItem, analyticsAvailable: boolean): MemberFlag[] {
  const flags: MemberFlag[] = [];
  const status = getMemberStatus(member);
  const req = getMemberRequiredMinutes(member);
  const activity = getActivityBand(member.playtime7d, req);
  const minutes = normalizePlaytimeMinutes(member.playtime7d);
  const delta = member.playtimeDelta7d ?? null;
  const exempt = isActivityExempt(member);

  // Exception de playtime requis (accordée à ce membre) : badge visible pour
  // que le staff sache qu'il n'est PAS jugé sur les 300 min habituelles.
  if (hasCustomPlaytimeRequirement(member)) {
    flags.push({
      key: "custom-playtime",
      label: `Seuil ${req} min`,
      tone: "cyan",
      description: `Playtime requis personnalisé : ${req} min en réunion (au lieu de 300).`,
    });
  }

  if (status === "blacklisted") {
    flags.push({
      key: "blacklisted",
      label: "Blacklist",
      tone: "slate",
      description: "Profil blacklist, conserve pour historique.",
    });
  }

  if (exempt) {
    flags.push({
      key: "activity-exempt",
      label: "Exempt activite",
      tone: "slate",
      description: "Hors quota d'activite (role exempt).",
    });
  }

  if (status === "non_link" && minutes === 0) {
    flags.push({
      key: "priority-non-link-zero",
      label: "Priorité",
      tone: "rose",
      description: "Non link avec activité nulle.",
    });
  } else if (status === "demoted" && minutes === 0) {
    flags.push({
      key: "priority-demote-zero",
      label: "Priorité",
      tone: "rose",
      description: "Demote avec activité nulle.",
    });
  }

  if (!exempt && analyticsAvailable && typeof delta === "number" && delta <= -120) {
    flags.push({
      key: "delta-drop",
      label: "Baisse forte",
      tone: "amber",
      description: "Baisse importante par rapport à la semaine précédente.",
    });
  }

  if (!exempt && status === "active" && minutes < Math.max(1, req / 3)) {
    flags.push({
      key: "watch",
      label: "À surveiller",
      tone: "amber",
      description: `Activité faible sur la semaine (sous ${Math.round(req / 3)} min).`,
    });
  }

  if (status === "demoted") {
    flags.push({
      key: "demoted",
      label: "Demote",
      tone: "rose",
      description: "Membre actuellement demote.",
    });
  }

  if (status === "reservist") {
    flags.push({
      key: "reservist",
      label: "Réserviste",
      tone: "slate",
      description: "Membre en statut reserviste.",
    });
  }

  if (status === "non_link") {
    flags.push({
      key: "non-link",
      label: "Non link",
      tone: "amber",
      description: "Discord ID absent sur la fiche membre.",
    });
  }

  if (!exempt) {
    flags.push({
      key: activity.key,
      label: activity.label,
      tone: activity.key === "inactive" ? "rose" : activity.key === "low" ? "amber" : activity.key === "high" ? "cyan" : "emerald",
      description: `Seuil visuel ${activity.minMinutes} à ${Number.isFinite(activity.maxMinutes) ? activity.maxMinutes : "+"} minutes.`,
    });
  }

  return flags;
}

export function matchesQuickFilter(member: MemberItem, quickFilter: QuickFilter, analyticsAvailable: boolean): boolean {
  const activity = getActivityBand(member.playtime7d, getMemberRequiredMinutes(member));
  const exempt = isActivityExempt(member);

  switch (quickFilter) {
    case "active":
      return !exempt && (activity.key === "active" || activity.key === "high");
    case "inactive":
      return !exempt && activity.key === "inactive";
    case "low":
      return !exempt && activity.key === "low";
    case "top":
      return activity.key === "high";
    case "watch":
      return isWatchMember(member, analyticsAvailable);
    case "all":
    default:
      return true;
  }
}

export function getMemberRowClassName(member: MemberItem, analyticsAvailable: boolean): string {
  const status = getMemberStatus(member);

  if (status === "blacklisted") {
    return "bg-slate-950/35 hover:bg-slate-900/45";
  }

  if (isActivityExempt(member)) {
    return "bg-slate-900/20 hover:bg-slate-900/35";
  }

  if (status === "demoted") {
    return "bg-rose-950/16 hover:bg-rose-950/24";
  }

  if (status === "reservist") {
    return "bg-slate-950/20 hover:bg-slate-900/30";
  }

  if (status === "non_link") {
    return "bg-amber-950/14 hover:bg-amber-950/22";
  }

  if (isWatchMember(member, analyticsAvailable) && normalizePlaytimeMinutes(member.playtime7d) === 0) {
    return "bg-rose-950/10 hover:bg-rose-950/18";
  }

  return getActivityBand(member.playtime7d, getMemberRequiredMinutes(member)).rowClassName;
}
