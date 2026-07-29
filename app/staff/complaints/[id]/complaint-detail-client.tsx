"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { Button } from "@/components/ui/button";

type ComplaintStatus = "OPEN" | "IN_REVIEW" | "RESOLVED" | "REJECTED" | "CLOSED";

type Message = {
  discordMessageId: string;
  authorNameSnapshot: string;
  authorDiscordId: string;
  authorRpName?: string | null;
  content: string;
  createdAtDiscord: string;
  editedAtDiscord?: string | null;
  deletedAtDiscord?: string | null;
};

type Complaint = {
  id: string;
  ticketKey: string | null;
  title: string;
  status: ComplaintStatus;
  authorDiscordId: string | null;
  authorTag: string | null;
  authorRpName: string | null;
  targetName: string | null;
  targetId?: string | null;
  discordThreadId: string | null;
  reason: string | null;
  details: string | null;
  targetFrom: string | null;
  summary: string | null;
  closedAt: string | null;
  closedByDiscordId: string | null;
  closedByDisplayName?: string | null;
  closeReason: string | null;
  createdAt: string;
  updatedAt: string;
};

const DISCORD_ROLE_LABELS: Record<string, string> = {
  "1429607761720770623": "Chef famille",
  "1312845999366209683": "Haut Gradé (E-M)",
  "1312845999215214618": "Recruteur",
};

const STATUS_LABELS: Record<ComplaintStatus, string> = {
  OPEN: "Ouverte",
  IN_REVIEW: "En cours",
  RESOLVED: "Résolue",
  REJECTED: "Refusée",
  CLOSED: "Fermée",
};

const STATUS_COLORS: Record<ComplaintStatus, string> = {
  OPEN: "bg-red-500/20 text-red-300 border border-red-500/30",
  IN_REVIEW: "bg-[hsl(var(--sunset-deep))]/20 text-rose-200 border border-[hsl(var(--sunset-deep))]/40",
  RESOLVED: "bg-amber-500/15 text-amber-200 border border-amber-500/25",
  REJECTED: "bg-orange-500/20 text-orange-300 border border-orange-500/30",
  CLOSED: "bg-slate-500/20 text-slate-300 border border-slate-500/30",
};

const CLOSE_REASON_LABELS: Record<string, string> = {
  TRAITE: "Traitée",
  NON_RESOLUE: "Non résolue",
  REFUSE: "Refusée",
};

const STATUS_SURFACES: Record<ComplaintStatus, string> = {
  OPEN: "from-red-500/12 via-red-500/5 to-transparent",
  IN_REVIEW: "from-[hsl(var(--sunset-deep))]/15 via-[hsl(var(--sunset-deep))]/5 to-transparent",
  RESOLVED: "from-amber-500/8 via-amber-500/3 to-transparent",
  REJECTED: "from-orange-500/12 via-orange-500/5 to-transparent",
  CLOSED: "from-slate-500/12 via-slate-500/5 to-transparent",
};

// fmtDate centralisé via @/lib/app-date-formatter
import { formatAppDate as fmtDate } from "@/lib/app-date-formatter";

function renderArchivedMessage(content: string, nameById: Map<string, string>) {
  return content
    // Mentions de rôle → @Label connu
    .replace(/<@&(\d{17,20})>/g, (raw, roleId: string) => {
      const label = DISCORD_ROLE_LABELS[roleId];
      return label ? `@${label}` : "@rôle";
    })
    // Mentions utilisateur → @Nom (résolu depuis les participants du thread)
    .replace(/<@!?(\d{17,20})>/g, (raw, userId: string) => {
      const name = nameById.get(userId);
      return name ? `@${name}` : "@utilisateur";
    })
    // Émojis custom <a:name:id> → :name:
    .replace(/<a?:(\w+):\d{17,20}>/g, ":$1:")
    // Mentions de salon
    .replace(/<#\d{17,20}>/g, "#salon");
}

// Couleur de pseudo stable par auteur (même esprit que Discord).
const NAME_PALETTE = [
  "text-rose-300",
  "text-sky-300",
  "text-emerald-300",
  "text-violet-300",
  "text-orange-300",
  "text-teal-300",
  "text-fuchsia-300",
] as const;
const AVATAR_PALETTE = [
  "bg-rose-500/25 ring-rose-400/40",
  "bg-sky-500/25 ring-sky-400/40",
  "bg-emerald-500/25 ring-emerald-400/40",
  "bg-violet-500/25 ring-violet-400/40",
  "bg-orange-500/25 ring-orange-400/40",
  "bg-teal-500/25 ring-teal-400/40",
  "bg-fuchsia-500/25 ring-fuchsia-400/40",
] as const;

function paletteIndex(id: string): number {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return h % NAME_PALETTE.length;
}

function initialsOf(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";
}

function ChatAvatar({ id, name, highlight }: { id: string; name: string; highlight: boolean }) {
  const cls = highlight
    ? "bg-amber-500/25 ring-amber-400/50"
    : AVATAR_PALETTE[paletteIndex(id)];
  return (
    <div
      className={`flex h-9 w-9 shrink-0 select-none items-center justify-center rounded-full text-[11px] font-bold text-slate-100 ring-2 ${cls}`}
      title={name}
    >
      {initialsOf(name)}
    </div>
  );
}

const DAY_FMT = new Intl.DateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const TIME_FMT = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function DataTile({ label, value, accent = "text-foreground" }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-card/60 px-4 py-3 shadow-[0_10px_30px_hsl(var(--sunset-surface2)/0.30)]">
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className={`mt-2 text-sm leading-6 ${accent}`}>{value}</div>
    </div>
  );
}

function getCloseReasonLabel(value: string | null) {
  if (!value) return "—";
  return CLOSE_REASON_LABELS[value] ?? value;
}

const GUILD_ID = "1312845998753710151";

export default function ComplaintDetailClient({
  ticketId,
  canWrite = true,
}: {
  ticketId: string;
  /** false pour Encadrant : on cache la section "Actions staff" (Trancher). */
  canWrite?: boolean;
}) {
  const [complaint, setComplaint] = useState<Complaint | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [confirmDecision, setConfirmDecision] = useState<"TRAITE" | "NON_RESOLUE" | "REFUSE" | "IN_REVIEW" | null>(null);
  const [summaryInput, setSummaryInput] = useState("");

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/complaints/${ticketId}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Échec du chargement");
      setComplaint(json.complaint);

      // Load messages
      await loadMessages();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages() {
    setMessagesLoading(true);
    try {
      const res = await fetch(`/api/staff/complaints/${ticketId}/messages`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json?.ok && Array.isArray(json.data)) {
        setMessages(json.data);
      }
    } catch (err: unknown) {
      // Messages are non-critical
      console.debug("Failed to load messages:", err);
    } finally {
      setMessagesLoading(false);
    }
  }

  async function applyDecision() {
    if (!confirmDecision) return;
    setDeciding(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/complaints/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: confirmDecision, summary: summaryInput || null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Échec de la décision");
      setComplaint(json.complaint);
      setConfirmDecision(null);
      setSummaryInput("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeciding(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  const isClosed = complaint?.status === "RESOLVED" || complaint?.status === "REJECTED" || complaint?.status === "CLOSED";
  const messageCountLabel = `${messages.length} message${messages.length > 1 ? "s" : ""} archivé${messages.length > 1 ? "s" : ""}`;

  return (
    <div className="space-y-8 pb-8">
      {/* Back */}
      <div className="flex items-center gap-3">
        <Link href="/staff/complaints" className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-white/20 hover:text-foreground">
          ← Retour aux plaintes
        </Link>
      </div>

      {loading && (
        <div className="text-sm text-muted-foreground">Chargement...</div>
      )}

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          <span className="shrink-0">❌</span>
          <div>{error}</div>
        </div>
      )}

      {complaint && (
        <>
          {/* Header */}
          <div className={`relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br ${STATUS_SURFACES[complaint.status]} shadow-[0_20px_70px_hsl(var(--sunset-surface3)/0.45)]`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,hsl(var(--sunset-deep)/0.18),transparent_28%),radial-gradient(circle_at_bottom_left,hsl(var(--sunset-surface2)/0.65),transparent_36%)]" />
            <div className="relative flex flex-col gap-6 px-6 py-6 sm:px-8 sm:py-7 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">Dossier plainte</div>
                  <div className="flex flex-wrap items-center gap-3">
                    {complaint.ticketKey && (
                      <span className="inline-flex items-center rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 font-mono text-xs text-amber-200">
                        {complaint.ticketKey}
                      </span>
                    )}
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold ${STATUS_COLORS[complaint.status]}`}>
                      {STATUS_LABELS[complaint.status]}
                    </span>
                  </div>
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-50 sm:text-3xl">
                    {complaint.title || "Plainte staff"}
                  </h1>
                  <p className="max-w-3xl text-sm leading-6 text-slate-300/90">
                    {complaint.details ?? complaint.reason ?? "Aucun détail complémentaire n'a été archivé pour cette plainte."}
                  </p>
                </div>

                <div className="flex flex-wrap gap-3">
                  <div className="rounded-2xl border border-white/10 bg-card/60 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Créée le</div>
                    <div className="mt-1 text-sm font-medium text-slate-200">{fmtDate(complaint.createdAt)}</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-card/60 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Cible</div>
                    <div className="mt-1 text-sm font-medium text-slate-200">{complaint.targetFrom ?? complaint.targetName ?? "Non renseignée"}</div>
                  </div>
                </div>
              </div>

              <div className="flex flex-col items-stretch gap-3 sm:flex-row lg:flex-col lg:items-end">
                {complaint.discordThreadId && (
                  <a
                    href={`https://discord.com/channels/${GUILD_ID}/${complaint.discordThreadId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-white/15 bg-white/[0.06] px-4 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-white/[0.10]"
                  >
                    Voir le thread Discord
                    <span aria-hidden="true">→</span>
                  </a>
                )}
                {isClosed && (
                  <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-slate-100/90">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-400">Statut final</div>
                    <div className="mt-1 font-medium">{getCloseReasonLabel(complaint.closeReason)}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Dossier : plaignant + motif, compact (fini les 4 cartes empilées) */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <SectionCard
              title="Plaignant"
              description="Identité du déposant"
              className="border-white/10 bg-card/60 shadow-[0_18px_50px_hsl(var(--sunset-surface2)/0.35)] lg:col-span-2"
            >
              <div className="flex items-center gap-3">
                <ChatAvatar
                  id={complaint.authorDiscordId ?? "0"}
                  name={complaint.authorRpName ?? complaint.authorTag ?? "?"}
                  highlight
                />
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-amber-200">
                    {complaint.authorRpName ?? "Nom RP inconnu"}
                  </div>
                  <div className="truncate text-xs text-slate-400">
                    {complaint.authorTag ?? complaint.authorDiscordId ?? "Discord inconnu"}
                  </div>
                </div>
              </div>
              <div className="mt-4 space-y-2 text-sm">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                  <span className="text-xs uppercase tracking-[0.14em] text-slate-500">Cible</span>
                  <span className="truncate font-medium text-slate-100">
                    {complaint.targetFrom ?? complaint.targetName ?? "Non renseignée"}
                  </span>
                </div>
                {complaint.authorDiscordId && (
                  <div className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2">
                    <span className="text-xs uppercase tracking-[0.14em] text-slate-500">ID Discord</span>
                    <span className="font-mono text-xs text-amber-200/90">{complaint.authorDiscordId}</span>
                  </div>
                )}
              </div>
            </SectionCard>

            <SectionCard
              title="Motif & détails"
              description="Ce qui a été déclaré à l'ouverture"
              className="border-white/10 bg-card/60 shadow-[0_18px_50px_hsl(var(--sunset-surface2)/0.35)] lg:col-span-3"
            >
              <div className="space-y-4">
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Raison</div>
                  <p className="mt-1.5 border-l-2 border-amber-500/40 pl-3 text-sm leading-7 text-slate-100">
                    {complaint.reason ?? "Aucune raison n'a été renseignée."}
                  </p>
                </div>
                <div>
                  <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Détails</div>
                  <p className="mt-1.5 whitespace-pre-wrap border-l-2 border-white/15 pl-3 text-sm leading-7 text-slate-200">
                    {complaint.details ?? "Aucun détail complémentaire n'a été archivé."}
                  </p>
                </div>
              </div>
            </SectionCard>
          </div>

          {/* Résumé / décision existante */}
          {isClosed && (
            <SectionCard title="Décision staff" description="Synthèse de clôture et identité du traitement" className="border-white/10 bg-card/60 shadow-[0_18px_50px_hsl(var(--sunset-surface2)/0.35)]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <DataTile label="Décision" value={getCloseReasonLabel(complaint.closeReason)} accent="text-slate-50" />
                  <DataTile label="Clôturée le" value={complaint.closedAt ? fmtDate(complaint.closedAt) : "—"} accent="text-slate-200" />
                  <DataTile label="Traitée par" value={complaint.closedByDisplayName ?? complaint.closedByDiscordId ?? "—"} accent="text-slate-50" />
                </div>
                {complaint.summary && (
                  <div className="rounded-2xl border border-white/10 bg-card/60 p-4">
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Résumé staff</div>
                    <p className="mt-3 text-sm leading-7 text-slate-100 whitespace-pre-wrap">{complaint.summary}</p>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Conversation archivée — rendu type Discord */}
          {messages.length > 0 && (() => {
            // Annuaire id → nom pour résoudre les mentions <@id> du thread.
            const nameById = new Map<string, string>();
            for (const m of messages) {
              if (m.authorDiscordId && !nameById.has(m.authorDiscordId)) {
                nameById.set(m.authorDiscordId, m.authorRpName ?? m.authorNameSnapshot);
              }
            }
            if (complaint.authorDiscordId) {
              nameById.set(
                complaint.authorDiscordId,
                complaint.authorRpName ?? complaint.authorTag ?? nameById.get(complaint.authorDiscordId) ?? "Plaignant"
              );
            }

            return (
              <SectionCard
                title="Conversation archivée"
                description={`${messageCountLabel} — copie du thread Discord`}
                className="border-white/10 bg-card/60 shadow-[0_18px_50px_hsl(var(--sunset-surface2)/0.35)]"
              >
                <div className="max-h-[36rem] overflow-y-auto rounded-2xl border border-white/10 bg-[hsl(var(--sunset-surface)/0.6)]">
                  <div className="px-3 py-3 sm:px-4">
                    {messages.map((msg, i) => {
                      const prev = i > 0 ? messages[i - 1] : null;
                      const cur = new Date(msg.createdAtDiscord);
                      const newDay =
                        !prev || new Date(prev.createdAtDiscord).toDateString() !== cur.toDateString();
                      // Regroupé : même auteur, < 7 min d'écart, même journée.
                      const grouped =
                        !newDay &&
                        !!prev &&
                        prev.authorDiscordId === msg.authorDiscordId &&
                        cur.getTime() - new Date(prev.createdAtDiscord).getTime() < 7 * 60_000;
                      const isPlaignant =
                        !!complaint.authorDiscordId && msg.authorDiscordId === complaint.authorDiscordId;
                      const displayName = msg.authorRpName ?? msg.authorNameSnapshot;
                      const nameCls = isPlaignant
                        ? "text-amber-300"
                        : NAME_PALETTE[paletteIndex(msg.authorDiscordId || displayName)];

                      return (
                        <div key={msg.discordMessageId}>
                          {newDay && (
                            <div className="my-3 flex items-center gap-3 first:mt-1">
                              <div className="h-px flex-1 bg-white/10" />
                              <span className="text-[11px] font-medium capitalize text-slate-500">
                                {DAY_FMT.format(cur)}
                              </span>
                              <div className="h-px flex-1 bg-white/10" />
                            </div>
                          )}

                          <div
                            className={`group flex gap-3 rounded-lg px-2 py-0.5 transition-colors hover:bg-white/[0.03] ${
                              grouped ? "mt-0" : "mt-2.5"
                            }`}
                          >
                            {grouped ? (
                              <div className="w-9 shrink-0 pt-1 text-right text-[10px] leading-5 text-slate-600 opacity-0 transition-opacity group-hover:opacity-100">
                                {TIME_FMT.format(cur)}
                              </div>
                            ) : (
                              <div className="pt-0.5">
                                <ChatAvatar
                                  id={msg.authorDiscordId || displayName}
                                  name={displayName}
                                  highlight={isPlaignant}
                                />
                              </div>
                            )}

                            <div className="min-w-0 flex-1">
                              {!grouped && (
                                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                  <span className={`text-sm font-semibold ${nameCls}`}>{displayName}</span>
                                  {isPlaignant && (
                                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-px text-[9px] font-bold uppercase tracking-wide text-amber-300">
                                      Plaignant
                                    </span>
                                  )}
                                  {msg.authorRpName && msg.authorNameSnapshot !== msg.authorRpName && (
                                    <span className="text-[11px] text-slate-500">@{msg.authorNameSnapshot}</span>
                                  )}
                                  <span className="text-[11px] text-slate-500" title={cur.toLocaleString("fr-FR")}>
                                    {TIME_FMT.format(cur)}
                                  </span>
                                </div>
                              )}

                              {msg.deletedAtDiscord ? (
                                <p className="text-sm italic leading-6 text-red-300/70 line-through decoration-red-400/40">
                                  {renderArchivedMessage(msg.content || "[Message vide]", nameById)}
                                  <span className="ml-2 align-middle text-[10px] uppercase tracking-wide text-red-400/80 no-underline">
                                    supprimé
                                  </span>
                                </p>
                              ) : (
                                <p className="whitespace-pre-wrap break-words text-sm leading-6 text-slate-100/95">
                                  {renderArchivedMessage(msg.content || "[Message vide]", nameById)}
                                  {msg.editedAtDiscord && (
                                    <span
                                      className="ml-1.5 text-[10px] text-slate-500"
                                      title={`Modifié le ${new Date(msg.editedAtDiscord).toLocaleString("fr-FR")}`}
                                    >
                                      (modifié)
                                    </span>
                                  )}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </SectionCard>
            );
          })()}

          {messagesLoading && (
            <div className="text-xs text-muted-foreground">Chargement des messages...</div>
          )}

          {/* Actions — bloc masqué pour Encadrant (lecture seule). */}
          {!isClosed && !confirmDecision && canWrite && (
            <SectionCard title="Actions staff" description="Décision de traitement et escalade éventuelle" className="border-white/10 bg-card/60 shadow-[0_18px_50px_hsl(var(--sunset-surface2)/0.35)]">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Choisissez une décision pour clôturer cette plainte.</p>
                <div className="flex flex-wrap gap-3">
                  {complaint.targetId && (
                    <Link href={`/staff/sanctions/new?complaintId=${complaint.id}&targetMemberId=${complaint.targetId}`}>
                      <Button
                        variant="outline"
                        className="border-[hsl(var(--sunset-magenta))]/40 text-rose-300 hover:bg-[hsl(var(--sunset-magenta))]/15"
                      >
                        ⚖️ Créer une sanction
                      </Button>
                    </Link>
                  )}
                  <Button
                    onClick={() => setConfirmDecision("IN_REVIEW")}
                    variant="outline"
                    className="border-white/15 text-slate-300 hover:bg-white/[0.08]"
                  >
                    Marquer En cours
                  </Button>
                  <Button
                    onClick={() => setConfirmDecision("TRAITE")}
                    className="bg-[hsl(var(--sunset-deep))]/70 hover:bg-[hsl(var(--sunset-magenta))]/80 text-rose-100 border border-[hsl(var(--sunset-magenta))]/40"
                  >
                    Marquer Résolue
                  </Button>
                  <Button
                    onClick={() => setConfirmDecision("NON_RESOLUE")}
                    variant="outline"
                    className="border-orange-500/40 text-orange-300 hover:bg-orange-500/10"
                  >
                    Non résolue
                  </Button>
                  <Button
                    onClick={() => setConfirmDecision("REFUSE")}
                    variant="destructive"
                  >
                    Refuser
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}

          {confirmDecision && !isClosed && (
            <SectionCard title="Confirmer la décision" description="Validation finale avant enregistrement" className="border-white/10 bg-card/60 shadow-[0_18px_50px_hsl(var(--sunset-surface2)/0.35)]">
              <div className="space-y-4">
                <p className="text-sm text-foreground">
                  Décision sélectionnée :{" "}
                  <strong>
                    {confirmDecision === "TRAITE" && "Résolue"}
                    {confirmDecision === "NON_RESOLUE" && "Non résolue"}
                    {confirmDecision === "REFUSE" && "Refusée"}
                    {confirmDecision === "IN_REVIEW" && "En cours de traitement"}
                  </strong>
                </p>
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">
                    Résumé / Motif <span className="opacity-50">(optionnel)</span>
                  </label>
                  <textarea
                    value={summaryInput}
                    onChange={(e) => setSummaryInput(e.target.value)}
                    placeholder="Explication de la décision..."
                    rows={3}
                    className="w-full px-3 py-2 rounded-lg bg-[hsl(var(--sunset-surface)/0.85)] border border-white/10 text-foreground placeholder-gray-500 text-sm focus:outline-none focus:border-amber-500/30 resize-none"
                  />
                </div>
                <div className="flex gap-3">
                  <Button onClick={applyDecision} disabled={deciding}>
                    {deciding ? "Enregistrement..." : "Confirmer"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => { setConfirmDecision(null); setSummaryInput(""); }}
                    disabled={deciding}
                  >
                    Annuler
                  </Button>
                </div>
              </div>
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
