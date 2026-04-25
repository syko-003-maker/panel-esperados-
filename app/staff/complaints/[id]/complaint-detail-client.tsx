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
  IN_REVIEW: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  RESOLVED: "bg-green-500/20 text-green-300 border border-green-500/30",
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
  IN_REVIEW: "from-blue-500/12 via-blue-500/5 to-transparent",
  RESOLVED: "from-emerald-500/12 via-emerald-500/5 to-transparent",
  REJECTED: "from-orange-500/12 via-orange-500/5 to-transparent",
  CLOSED: "from-slate-500/12 via-slate-500/5 to-transparent",
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit",
  });
}

function renderArchivedMessage(content: string) {
  return content.replace(/<@&(\d{17,20})>/g, (raw, roleId: string) => {
    const label = DISCORD_ROLE_LABELS[roleId];
    return label ? `@${label}` : raw;
  });
}

function DataTile({ label, value, accent = "text-foreground" }: { label: string; value: ReactNode; accent?: string }) {
  return (
    <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-3 shadow-[0_10px_30px_rgba(15,23,42,0.24)]">
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

export default function ComplaintDetailClient({ ticketId }: { ticketId: string }) {
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
        <Link href="/staff/complaints" className="inline-flex items-center gap-2 rounded-full border border-slate-800 bg-slate-950/70 px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:border-slate-700 hover:text-foreground">
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
          <div className={`relative overflow-hidden rounded-[28px] border border-slate-800 bg-gradient-to-br ${STATUS_SURFACES[complaint.status]} shadow-[0_20px_70px_rgba(2,6,23,0.45)]`}>
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.14),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(15,23,42,0.65),transparent_36%)]" />
            <div className="relative flex flex-col gap-6 px-6 py-6 sm:px-8 sm:py-7 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-4">
                <div className="space-y-2">
                  <div className="text-[11px] font-medium uppercase tracking-[0.24em] text-slate-400">Dossier plainte</div>
                  <div className="flex flex-wrap items-center gap-3">
                    {complaint.ticketKey && (
                      <span className="inline-flex items-center rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 font-mono text-xs text-cyan-200">
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
                  <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 px-4 py-3">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-slate-500">Créée le</div>
                    <div className="mt-1 text-sm font-medium text-slate-200">{fmtDate(complaint.createdAt)}</div>
                  </div>
                  <div className="rounded-2xl border border-slate-800/80 bg-slate-950/50 px-4 py-3">
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
                    className="inline-flex items-center justify-center gap-2 rounded-2xl border border-indigo-400/25 bg-indigo-500/10 px-4 py-2.5 text-sm font-medium text-indigo-200 transition-colors hover:bg-indigo-500/20"
                  >
                    Voir le thread Discord
                    <span aria-hidden="true">→</span>
                  </a>
                )}
                {isClosed && (
                  <div className="rounded-2xl border border-emerald-500/15 bg-emerald-500/8 px-4 py-3 text-sm text-emerald-100/90">
                    <div className="text-[11px] uppercase tracking-[0.18em] text-emerald-200/70">Statut final</div>
                    <div className="mt-1 font-medium">{getCloseReasonLabel(complaint.closeReason)}</div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {/* Auteur */}
            <SectionCard title="Auteur de la plainte" description="Identité et référence du plaignant" className="border-slate-800/90 bg-slate-950/55 shadow-[0_18px_50px_rgba(2,6,23,0.32)]">
              <div className="grid gap-3 sm:grid-cols-2">
                <DataTile label="Nom RP" value={complaint.authorRpName ?? "Non renseigné"} />
                <DataTile label="Discord" value={complaint.authorTag ?? "Non renseigné"} accent="text-slate-200" />
                {!complaint.authorTag && complaint.authorDiscordId && (
                  <DataTile label="ID Discord" value={<span className="font-mono text-xs text-cyan-200">{complaint.authorDiscordId}</span>} />
                )}
              </div>
            </SectionCard>

            {/* Cible */}
            <SectionCard title="Cible de la plainte" description="Personne ou identifiant visé par le signalement" className="border-slate-800/90 bg-slate-950/55 shadow-[0_18px_50px_rgba(2,6,23,0.32)]">
              <div className="grid gap-3">
                <DataTile label="Pseudo ou identifiant" value={complaint.targetFrom ?? complaint.targetName ?? "Non renseigné"} />
              </div>
            </SectionCard>

            {/* Raison */}
            <SectionCard title="Raison" description="Motif principal déclaré dans la plainte" className="border-slate-800/90 bg-slate-950/55 shadow-[0_18px_50px_rgba(2,6,23,0.32)]">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-4">
                <p className="text-sm leading-7 text-slate-100">{complaint.reason ?? "Aucune raison n'a été renseignée."}</p>
              </div>
            </SectionCard>

            {/* Détails */}
            <SectionCard title="Détails" description="Contexte archivé et précisions utiles" className="border-slate-800/90 bg-slate-950/55 shadow-[0_18px_50px_rgba(2,6,23,0.32)]">
              <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 px-4 py-4">
                <p className="text-sm leading-7 text-slate-100 whitespace-pre-wrap">{complaint.details ?? "Aucun détail complémentaire n'a été archivé."}</p>
              </div>
            </SectionCard>
          </div>

          {/* Résumé / décision existante */}
          {isClosed && (
            <SectionCard title="Décision staff" description="Synthèse de clôture et identité du traitement" className="border-slate-800/90 bg-slate-950/55 shadow-[0_18px_50px_rgba(2,6,23,0.32)]">
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-3">
                  <DataTile label="Décision" value={getCloseReasonLabel(complaint.closeReason)} accent="text-slate-50" />
                  <DataTile label="Clôturée le" value={complaint.closedAt ? fmtDate(complaint.closedAt) : "—"} accent="text-slate-200" />
                  <DataTile label="Traitée par" value={complaint.closedByDisplayName ?? complaint.closedByDiscordId ?? "—"} accent="text-slate-50" />
                </div>
                {complaint.summary && (
                  <div className="rounded-2xl border border-slate-800/80 bg-slate-950/60 p-4">
                    <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">Résumé staff</div>
                    <p className="mt-3 text-sm leading-7 text-slate-100 whitespace-pre-wrap">{complaint.summary}</p>
                  </div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Historique messages */}
          {messages.length > 0 && (
            <SectionCard title="Historique des messages archivés" description={messageCountLabel} className="border-slate-800/90 bg-slate-950/55 shadow-[0_18px_50px_rgba(2,6,23,0.32)]">
              <div className="space-y-4 max-h-[34rem] overflow-y-auto pr-1">
                {messages.map((msg) => (
                  <div
                    key={msg.discordMessageId}
                    className="rounded-2xl border border-slate-800/80 bg-[linear-gradient(180deg,rgba(15,23,42,0.72),rgba(2,6,23,0.82))] p-4 shadow-[0_12px_30px_rgba(2,6,23,0.24)]"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <div className="text-sm font-semibold text-slate-100">
                          {msg.authorRpName ?? msg.authorNameSnapshot}
                        </div>
                        {msg.authorRpName && (
                          <div className="mt-0.5 text-xs text-slate-500">{msg.authorNameSnapshot}</div>
                        )}
                        <div className="mt-1 text-[11px] uppercase tracking-[0.16em] text-slate-500">Message archivé</div>
                      </div>
                      <div className="text-xs text-slate-400 sm:text-right">
                        {new Date(msg.createdAtDiscord).toLocaleString("fr-FR", {
                          year: "numeric",
                          month: "2-digit",
                          day: "2-digit",
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </div>
                    </div>
                    {msg.deletedAtDiscord && (
                      <div className="mt-3 rounded-xl border border-red-500/20 bg-red-500/10 px-3 py-2 text-xs text-red-300/90">
                        <em>[Message supprimé le {new Date(msg.deletedAtDiscord).toLocaleString("fr-FR")}]</em>
                      </div>
                    )}
                    {msg.editedAtDiscord && !msg.deletedAtDiscord && (
                      <div className="mt-3 text-xs text-yellow-300/70">
                        (Modifié le {new Date(msg.editedAtDiscord).toLocaleString("fr-FR")})
                      </div>
                    )}
                    <div className="mt-3 rounded-2xl border border-slate-800/80 bg-slate-950/70 px-4 py-3">
                      <p className="text-sm leading-7 text-slate-100 whitespace-pre-wrap break-words">{renderArchivedMessage(msg.content || "[Message vide]")}</p>
                    </div>
                  </div>
                ))}
              </div>
            </SectionCard>
          )}

          {messagesLoading && (
            <div className="text-xs text-muted-foreground">Chargement des messages...</div>
          )}

          {/* Actions */}
          {!isClosed && !confirmDecision && (
            <SectionCard title="Actions staff" description="Décision de traitement et escalade éventuelle" className="border-slate-800/90 bg-slate-950/55 shadow-[0_18px_50px_rgba(2,6,23,0.32)]">
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">Choisissez une décision pour clôturer cette plainte.</p>
                <div className="flex flex-wrap gap-3">
                  {complaint.targetId && (
                    <Link href={`/staff/sanctions/new?complaintId=${complaint.id}&targetMemberId=${complaint.targetId}`}>
                      <Button
                        variant="outline"
                        className="border-purple-500/40 text-purple-300 hover:bg-purple-500/10"
                      >
                        ⚖️ Créer une sanction
                      </Button>
                    </Link>
                  )}
                  <Button
                    onClick={() => setConfirmDecision("IN_REVIEW")}
                    variant="outline"
                    className="border-blue-500/40 text-blue-300 hover:bg-blue-500/10"
                  >
                    Marquer En cours
                  </Button>
                  <Button
                    onClick={() => setConfirmDecision("TRAITE")}
                    className="bg-green-600 hover:bg-green-700 text-white border-0"
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
            <SectionCard title="Confirmer la décision" description="Validation finale avant enregistrement" className="border-slate-800/90 bg-slate-950/55 shadow-[0_18px_50px_rgba(2,6,23,0.32)]">
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
                    className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-foreground placeholder-gray-500 text-sm focus:outline-none focus:border-slate-600 resize-none"
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
