import { getTemplate, renderTemplate } from "@/lib/discord/discord";
import { getPublicPanelUrl } from "@/lib/urls";

const PANEL_BASE_URL = getPublicPanelUrl();

type MemberLike = {
  rpName: string | null;
  steamId: string | null;
} | null;

type AbsenceLike = {
  id: string;
  startAt: Date;
  endAt: Date;
  reason: string | null;
  createdAt: Date;
};

type SanctionLike = {
  id: string;
  type: string;
  startAt: Date;
  endAt: Date | null;
  reason: string | null;
};

type AbsenceJustificationLike = {
  id: string;
  message: string;
  createdAt: Date;
  absence: AbsenceLike;
};

type SanctionJustificationLike = {
  id: string;
  message: string;
  createdAt: Date;
  sanction: SanctionLike;
};

type EmbedField = { name: string; value: string; inline?: boolean };
export type DiscordEmbed = {
  title?: string;
  description?: string;
  fields?: EmbedField[];
  color?: number;
  timestamp?: Date | string;
  footer?: { text: string };
};

function toPanelUrl(path: string) {
  if (!PANEL_BASE_URL) return path;
  const base = PANEL_BASE_URL.endsWith("/") ? PANEL_BASE_URL.slice(0, -1) : PANEL_BASE_URL;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function fmtDate(value: Date | string | null) {
  if (!value) return "-";
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("fr-BE");
}

function fmtRange(startAt: Date, endAt: Date | null) {
  if (!endAt) return `from ${fmtDate(startAt)}`;
  return `from ${fmtDate(startAt)} to ${fmtDate(endAt)}`;
}

function fmtMoney(value: number) {
  return new Intl.NumberFormat("fr-BE").format(Math.round(value));
}

function truncateField(value: string, max = 1024) {
  const clean = value.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3))}...`;
}

function truncateText(value: string, max = 1900) {
  const clean = value.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, Math.max(0, max - 3))}...`;
}

function buildMemberLabel(discordId: string, member: MemberLike) {
  const identity = member?.rpName || member?.steamId || "-";
  return `<@${discordId}> - RP: ${identity}`;
}

function buildMemberIdentity(params: {
  discordId: string | null;
  rpName: string | null;
  steamId: string | null;
}) {
  if (params.discordId) return `<@${params.discordId}>`;
  return params.rpName || params.steamId || "Unknown";
}

async function resolveTemplate(
  familyId: string,
  keys: string[],
  fallbackTitle: string,
  vars: Record<string, string>
) {
  for (const key of keys) {
    const template = await getTemplate(familyId, key);
    if (!template || !template.enabled) continue;

    const title = template.title?.trim() || fallbackTitle;
    const description = renderTemplate(template.content ?? "", vars).trim();
    return { title, description: description ? description : undefined };
  }

  return { title: fallbackTitle, description: undefined };
}

export async function buildAbsenceCreatedEmbed(params: {
  familyId: string;
  discordId: string;
  absence: AbsenceLike;
  member: MemberLike;
}) {
  const vars = {
    discordId: params.discordId,
    startAt: params.absence.startAt.toISOString(),
    endAt: params.absence.endAt.toISOString(),
    reason: params.absence.reason ?? "",
    absenceId: params.absence.id,
  };
  const { title, description } = await resolveTemplate(
    params.familyId,
    ["ME_ABSENCE_CREATED", "absence.requested"],
    "ABSENCE REQUESTED",
    vars
  );

  const fields: EmbedField[] = [
    { name: "Member", value: truncateField(buildMemberLabel(params.discordId, params.member)) },
    {
      name: "Period",
      value: truncateField(`from ${fmtDate(params.absence.startAt)} to ${fmtDate(params.absence.endAt)}`),
    },
    { name: "Reason", value: truncateField(params.absence.reason || "-") },
    { name: "Declared At", value: truncateField(fmtDate(params.absence.createdAt)) },
    {
      name: "Panel",
      value: truncateField(toPanelUrl(`/staff/absences?highlight=${encodeURIComponent(params.absence.id)}`)),
    },
  ];

  return { title, description, fields };
}

export async function buildAbsenceJustificationEmbed(params: {
  familyId: string;
  discordId: string;
  justification: AbsenceJustificationLike;
  member: MemberLike;
}) {
  const vars = {
    discordId: params.discordId,
    startAt: params.justification.absence.startAt.toISOString(),
    endAt: params.justification.absence.endAt.toISOString(),
    message: params.justification.message,
    absenceId: params.justification.absence.id,
    justificationId: params.justification.id,
  };
  const { title, description } = await resolveTemplate(
    params.familyId,
    ["ME_ABSENCE_JUSTIFIED", "absence_justification_created"],
    "ABSENCE JUSTIFICATION",
    vars
  );

  const fields: EmbedField[] = [
    { name: "Member", value: truncateField(buildMemberLabel(params.discordId, params.member)) },
    {
      name: "Period",
      value: truncateField(
        `from ${fmtDate(params.justification.absence.startAt)} to ${fmtDate(params.justification.absence.endAt)}`
      ),
    },
    { name: "Justification", value: truncateField(params.justification.message, 1000) || "-" },
    { name: "Declared At", value: truncateField(fmtDate(params.justification.createdAt)) },
    {
      name: "Panel",
      value: truncateField(toPanelUrl(`/staff/absences?highlight=${encodeURIComponent(params.justification.absence.id)}`)),
    },
  ];

  return { title, description, fields };
}

export async function buildSanctionJustificationEmbed(params: {
  familyId: string;
  discordId: string;
  justification: SanctionJustificationLike;
  member: MemberLike;
}) {
  const vars = {
    discordId: params.discordId,
    type: params.justification.sanction.type,
    reason: params.justification.sanction.reason ?? "",
    startAt: params.justification.sanction.startAt.toISOString(),
    endAt: params.justification.sanction.endAt ? params.justification.sanction.endAt.toISOString() : "",
    message: params.justification.message,
    sanctionId: params.justification.sanction.id,
    justificationId: params.justification.id,
  };
  const { title, description } = await resolveTemplate(
    params.familyId,
    ["ME_SANCTION_JUSTIFIED", "sanction_justification_created"],
    "SANCTION JUSTIFICATION",
    vars
  );

  const sanctionLabel = `${params.justification.sanction.type} - ${fmtRange(
    params.justification.sanction.startAt,
    params.justification.sanction.endAt
  )}`;

  const fields: EmbedField[] = [
    { name: "Member", value: truncateField(buildMemberLabel(params.discordId, params.member)) },
    { name: "Sanction", value: truncateField(sanctionLabel) },
    { name: "Justification", value: truncateField(params.justification.message, 1000) || "-" },
    { name: "Declared At", value: truncateField(fmtDate(params.justification.createdAt)) },
    {
      name: "Panel",
      value: truncateField(toPanelUrl(`/staff/sanctions?highlight=${encodeURIComponent(params.justification.sanction.id)}`)),
    },
  ];

  return { title, description, fields };
}

export async function buildBankDebtPingEmbed(params: {
  familyId: string;
  member: { discordId: string | null; rpName: string | null; steamId: string | null };
  deficitAmount: number;
  lastAt?: Date | null;
}) {
  const identity = buildMemberIdentity({
    discordId: params.member.discordId ?? null,
    rpName: params.member.rpName ?? null,
    steamId: params.member.steamId ?? null,
  });
  const formattedAmount = `${fmtMoney(params.deficitAmount)}$`;

  const vars = {
    discordId: params.member.discordId ?? "",
    mention: params.member.discordId ? `<@${params.member.discordId}>` : identity,
    rpName: params.member.rpName ?? "",
    steamId: params.member.steamId ?? "",
    deficitAmount: String(params.deficitAmount),
    deficitAmountFormatted: formattedAmount,
  };

  const { title, description } = await resolveTemplate(
    params.familyId,
    ["BANK_DEBT_PING_SINGLE"],
    "Los Esperados - Banque",
    vars
  );

  const fields: EmbedField[] = [
    { name: "Member", value: truncateField(identity) },
    { name: "Current debt", value: truncateField(formattedAmount) },
  ];

  if (params.lastAt) {
    fields.push({ name: "Last transaction", value: truncateField(fmtDate(params.lastAt)) });
  }

  fields.push({
    name: "Panel",
    value: truncateField(toPanelUrl("/me/banque")),
  });

  return { title, description, fields };
}

function formatScore(value: number | null | undefined) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return value.toFixed(2);
}

export async function buildRecruitmentDecisionEmbed(params: {
  candidateRpName: string;
  candidateDiscordId: string | null;
  candidateSteamId: string | null;
  decision: "ACCEPT" | "REJECT";
  totalPoints: number | null;
  totalOn20: number | null;
  recruiterName: string | null;
  closedAt?: Date | null;
}) {
  const decisionLabel = params.decision === "ACCEPT" ? "ACCEPTED" : "REJECTED";
  const scoreLabel = `${formatScore(params.totalOn20)}/20 (raw ${formatScore(params.totalPoints)})`;
  const discordLabel = params.candidateDiscordId ? `<@${params.candidateDiscordId}>` : "Non fourni";
  const steamLabel = params.candidateSteamId ? params.candidateSteamId : "Non fourni";
  const color = params.decision === "ACCEPT" ? 0x16a34a : 0xdc2626;

  const fields: EmbedField[] = [
    { name: "Nom RP", value: truncateField(params.candidateRpName || "Unknown"), inline: false },
    { name: "Discord", value: truncateField(discordLabel), inline: false },
    { name: "Steam ID", value: truncateField(steamLabel), inline: false },
    { name: "Decision", value: truncateField(decisionLabel), inline: false },
    { name: "Score", value: truncateField(scoreLabel), inline: false },
    { name: "Recruteur", value: truncateField(params.recruiterName || "Unknown"), inline: false },
  ];

  return {
    title: "Los Esperados — Recrutement",
    fields,
    color,
    timestamp: params.closedAt ?? new Date(),
  };
}

export async function buildSanctionNotifyEmbed(params: {
  sanctionId: string;
  action: "CREATED" | "UPDATED" | "CLOSED";
  memberName: string;
  memberDiscordId: string | null;
  type: string;
  status: string;
  reason?: string | null;
  amount?: number | null;
  startAt: Date | string;
  endAt?: Date | string | null;
  durationHours?: number | null;
  staffName: string;
}) {
  const mention = params.memberDiscordId ? `<@${params.memberDiscordId}>` : null;
  const memberLabel = mention ? `${params.memberName} (${mention})` : params.memberName;
  const durationLabel =
    params.durationHours && Number.isFinite(params.durationHours)
      ? `${Math.round(params.durationHours)} heures`
      : "—";
  const startLabel = fmtDate(params.startAt);
  const endLabel = params.endAt ? fmtDate(params.endAt) : "—";
  const reasonLabel = params.reason ? params.reason : "—";

  const fields: EmbedField[] = [
    { name: "Membre", value: truncateField(memberLabel), inline: false },
    { name: "Type", value: truncateField(params.type), inline: false },
    { name: "Statut", value: truncateField(params.status), inline: false },
    { name: "Duree", value: truncateField(durationLabel), inline: false },
    { name: "Debut", value: truncateField(startLabel), inline: false },
    { name: "Fin", value: truncateField(endLabel), inline: false },
    { name: "Raison", value: truncateField(reasonLabel, 1000), inline: false },
    { name: "Staff", value: truncateField(params.staffName), inline: false },
  ];

  if (params.amount !== null && params.amount !== undefined) {
    fields.push({ name: "Montant", value: truncateField(String(params.amount)), inline: false });
  }

  return {
    title: "Los Esperados — Sanction",
    fields,
    footer: { text: params.sanctionId },
  };
}

type MeetingEmbedRow = {
  name: string;
  status: string;
};

type MeetingEmbedCounts = {
  total: number;
  present: number;
  late: number;
  excused: number;
  absentJustified: number;
  absentUnjustified: number;
  unknown: number;
};

function formatCountsLine(counts: MeetingEmbedCounts) {
  return `P:${counts.present} L:${counts.late} E:${counts.excused} AJ:${counts.absentJustified} AU:${counts.absentUnjustified} U:${counts.unknown} / ${counts.total}`;
}

function listAbsentUnjustified(rows: MeetingEmbedRow[], limit = 10) {
  const names = rows
    .filter((row) => String(row.status).toUpperCase() === "ABSENT_UNJUSTIFIED")
    .map((row) => row.name || "Unknown");
  if (names.length === 0) return "-";
  const sliced = names.slice(0, limit);
  const suffix = names.length > limit ? " ..." : "";
  return `${sliced.join(", ")}${suffix}`;
}

export function buildMeetingEmbed(params: {
  meetingId: string;
  title: string;
  scheduledAt: Date | string;
  status: string;
  locked: boolean;
  counts: MeetingEmbedCounts;
  meetingNote?: string | null;
  rows: MeetingEmbedRow[];
}) {
  const statusLabel = params.locked ? "LOCKED" : params.status;
  const fields: EmbedField[] = [
    { name: "Date", value: truncateField(fmtDate(params.scheduledAt)), inline: false },
    { name: "Statut", value: truncateField(statusLabel), inline: false },
    { name: "Comptes", value: truncateField(formatCountsLine(params.counts)), inline: false },
    {
      name: "Absents injustifies",
      value: truncateField(listAbsentUnjustified(params.rows)),
      inline: false,
    },
  ];

  if (params.meetingNote && params.meetingNote.trim()) {
    fields.push({
      name: "Note",
      value: truncateField(params.meetingNote, 1000),
      inline: false,
    });
  }

  const color = params.locked ? 0x6b7280 : 0x2563eb;

  return {
    title: `Reunion - ${params.title || "Sans titre"}`,
    fields,
    color,
    footer: { text: `${params.meetingId} | Panel Esperados` },
    timestamp: new Date(),
  };
}

export function buildMeetingRecapText(params: {
  title: string;
  scheduledAt: Date | string;
  counts: MeetingEmbedCounts;
  meetingNote?: string | null;
  rows: MeetingEmbedRow[];
}) {
  const header = `Recap reunion ${fmtDate(params.scheduledAt)} - ${params.title || "Sans titre"}`;
  const countsLine = `Comptes: ${formatCountsLine(params.counts)}`;
  const absents = `Absents injustifies: ${listAbsentUnjustified(params.rows)}`;
  const note = params.meetingNote && params.meetingNote.trim() ? `Note: ${params.meetingNote.trim()}` : "";
  const lines = [header, countsLine, absents, note].filter(Boolean);
  return truncateText(lines.join("\n"));
}

function formatPlaytime(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.round(value)} min`;
}

function formatInactiveDays(value?: number | null) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "-";
  return `${Math.max(0, Math.floor(value))} jours`;
}

function formatSuggestedAction(value?: string | null) {
  const raw = String(value ?? "NONE").toUpperCase();
  if (raw === "WARN_ORAL") return "Avertissement oral";
  if (raw === "WARN_LIGHT") return "Avertissement leger";
  if (raw === "RECOMMEND_KICK") return "Recommander exclusion";
  return "Aucune";
}

export function buildActivityAlertEmbed(params: {
  type: "ACTIVITY_ALERT_INACTIVE" | "ACTIVITY_ALERT_LOW" | "ACTIVITY_ALERT_RECOMMEND_KICK";
  discordId: string;
  name?: string | null;
  playtimeMinutes?: number | null;
  lastSeenAt?: string | Date | null;
  inactiveDays?: number | null;
  suggestedAction?: string | null;
}) {
  const titleMap: Record<string, string> = {
    ACTIVITY_ALERT_INACTIVE: "Activite - Inactivite",
    ACTIVITY_ALERT_LOW: "Activite - Playtime faible",
    ACTIVITY_ALERT_RECOMMEND_KICK: "Activite - Recommandation exclusion",
  };

  const mention = params.discordId ? `<@${params.discordId}>` : "Unknown";
  const nameLabel = params.name ? `${params.name} (${mention})` : mention;

  const fields: EmbedField[] = [
    { name: "Membre", value: truncateField(nameLabel), inline: false },
    { name: "Playtime", value: truncateField(formatPlaytime(params.playtimeMinutes)), inline: false },
    { name: "Derniere activite", value: truncateField(fmtDate(params.lastSeenAt ?? null)), inline: false },
    { name: "Inactivite", value: truncateField(formatInactiveDays(params.inactiveDays)), inline: false },
    { name: "Action recommandee", value: truncateField(formatSuggestedAction(params.suggestedAction)), inline: false },
  ];

  return {
    title: titleMap[params.type] ?? "Activite - Alerte",
    fields,
    color: 0xf59e0b,
    timestamp: new Date(),
  };
}

export function buildActivityActionEmbed(params: {
  discordId: string;
  name?: string | null;
  type: "WARN_ORAL" | "WARN_LIGHT" | "KICK_DONE" | "NOTE";
  note?: string | null;
  byDiscordId?: string | null;
}) {
  const typeLabelMap: Record<string, string> = {
    WARN_ORAL: "Avertissement oral",
    WARN_LIGHT: "Avertissement leger",
    KICK_DONE: "Exclusion effectuee",
    NOTE: "Note",
  };

  const mention = params.discordId ? `<@${params.discordId}>` : "Unknown";
  const nameLabel = params.name ? `${params.name} (${mention})` : mention;
  const staffLabel = params.byDiscordId ? `<@${params.byDiscordId}>` : "Staff";

  const fields: EmbedField[] = [
    { name: "Membre", value: truncateField(nameLabel), inline: false },
    { name: "Action", value: truncateField(typeLabelMap[params.type] ?? params.type), inline: false },
    { name: "Staff", value: truncateField(staffLabel), inline: false },
  ];

  if (params.note) {
    fields.push({ name: "Note", value: truncateField(params.note, 1000), inline: false });
  }

  return {
    title: `Action staff - ${typeLabelMap[params.type] ?? params.type}`,
    fields,
    color: 0x0ea5e9,
    timestamp: new Date(),
  };
}

type ActivityDigestRow = {
  discordId: string;
  name?: string | null;
  playtimeMinutes?: number | null;
  inactiveDays?: number | null;
  lastSeenAt?: string | null;
};

type ActivityDigestMeta = {
  generatedAt?: string;
  counts: {
    total: number;
    exempt: number;
    inactive14d: number;
    lowPlaytime: number;
    recommendKick: number;
  };
  recommendKick: ActivityDigestRow[];
  lowPlaytime: ActivityDigestRow[];
  maxLines?: number;
};

function formatDigestLine(row: ActivityDigestRow) {
  const mention = row.discordId ? `<@${row.discordId}>` : row.name || "Unknown";
  const name = row.name && row.name !== row.discordId ? row.name : null;
  const playtime = formatPlaytime(row.playtimeMinutes ?? null);
  const inactive = formatInactiveDays(row.inactiveDays ?? null);
  const identity = name ? `${mention} - ${name}` : mention;
  return `${identity} | ${playtime} | ${inactive}`;
}

function buildDigestList(rows: ActivityDigestRow[], maxLines: number) {
  if (!rows.length) return "-";
  const slice = rows.slice(0, Math.max(0, maxLines));
  return slice.map(formatDigestLine).join("\n");
}

export function buildActivityDigestEmbed(meta: ActivityDigestMeta) {
  const maxLines =
    typeof meta.maxLines === "number" && Number.isFinite(meta.maxLines) ? meta.maxLines : 25;
  const counts = meta.counts ?? {
    total: 0,
    exempt: 0,
    inactive14d: 0,
    lowPlaytime: 0,
    recommendKick: 0,
  };

  const fields: EmbedField[] = [
    {
      name: "Resume",
      value: truncateField(
        `Total: ${counts.total} | Exemptes: ${counts.exempt} | Inactifs: ${counts.inactive14d} | Playtime faible: ${counts.lowPlaytime} | Recommandes exclusion: ${counts.recommendKick}`
      ),
      inline: false,
    },
    {
      name: "Top recommandations exclusion",
      value: truncateField(buildDigestList(meta.recommendKick ?? [], maxLines)),
      inline: false,
    },
    {
      name: "Top playtime faible",
      value: truncateField(buildDigestList(meta.lowPlaytime ?? [], maxLines)),
      inline: false,
    },
  ];

  return {
    title: "Digest Activite",
    fields,
    color: 0xf97316,
    timestamp: meta.generatedAt ? new Date(meta.generatedAt) : new Date(),
  };
}
