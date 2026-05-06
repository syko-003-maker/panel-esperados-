"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, CheckCircle2, ClipboardList, MessageSquareText, ShieldAlert } from "lucide-react";
import { MIN_ON20, TOTAL_MAX_POINTS } from "@/lib/recruitment/questionBank";
import { DataTile } from "@/components/staff/ui/DataTile";
import { MotionButtonFrame, MotionSection } from "@/components/staff/ui/motion";
import { SectionCard } from "@/components/staff/ui/SectionCard";
import { StatusBadge } from "@/components/staff/ui/StatusBadge";
import { Button } from "@/components/ui/button";

type Question = {
  id: string;
  section: "GENERAL" | "TRAP";
  label: string;
  pointsMax: number;
  hint?: string;
  step?: number;
  expectedAnswer?: string;
};

type Ticket = {
  id: string;
  status: "OPEN" | "CLAIMED" | "CLOSED_ACCEPTED" | "CLOSED_REJECTED";
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  candidateRpName: string;
  candidateAge: number | null;
  candidateSteamId: string | null;
  candidateDiscordId: string | null;
  ticketKey: string | null;
  discordThreadId: string | null;
  motivation: string | null;
  availabilities: string | null;
  claimedById: string | null;
  claimedAt: string | null;
  claimedBy: { id: string; name: string | null } | null;
  answersJson: Record<string, string> | null;
  scoresJson: Record<string, number> | null;
  totalPoints: number | null;
  totalOn20: number | null;
  staffNotes: string | null;
};

type Viewer = {
  userId: string | null;
  isChef: boolean;
};

type ApiResponse = {
  ticket: Ticket;
  questionBank: Question[];
  totals: { totalPoints: number; totalOn20: number };
  viewer: Viewer;
};

const STATUS_LABELS: Record<string, string> = {
  OPEN: "Ouverte",
  CLAIMED: "En cours",
  CLOSED_ACCEPTED: "Acceptée",
  CLOSED_REJECTED: "Refusée",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-500/20 text-blue-300 border border-blue-500/30",
  CLAIMED: "bg-yellow-500/20 text-yellow-300 border border-yellow-500/30",
  CLOSED_ACCEPTED: "bg-green-500/20 text-green-300 border border-green-500/30",
  CLOSED_REJECTED: "bg-red-500/20 text-red-300 border border-red-500/30",
};

const GUILD_ID = "1312845998753710151";

// fmtDate centralisé via @/lib/app-date-formatter
import { formatAppDate as fmtDate } from "@/lib/app-date-formatter";

function normalizeScores(value: Ticket["scoresJson"]) {
  if (!value || typeof value !== "object") return {};
  const next: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(parsed)) next[key] = parsed;
  }
  return next;
}

function formatStep(step: number | undefined) {
  const value = step ?? 0.5;
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function computeTotals(scores: Record<string, number>, questions: Question[]) {
  let totalPoints = 0;
  for (const question of questions) {
    const raw = scores[question.id];
    if (typeof raw !== "number" || !Number.isFinite(raw)) continue;
    totalPoints += Math.min(Math.max(raw, 0), question.pointsMax);
  }
  const totalOn20Raw = TOTAL_MAX_POINTS > 0 ? (totalPoints / TOTAL_MAX_POINTS) * 20 : 0;
  const totalOn20 = Math.round(totalOn20Raw * 100) / 100;
  return { totalPoints, totalOn20 };
}

export default function RecruitmentDetailClient({
  ticketId,
  backHref = "/staff/recruitment",
  backLabel = "← Retour aux recrutements",
}: {
  ticketId: string;
  backHref?: string;
  backLabel?: string;
}) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [questionBank, setQuestionBank] = useState<Question[]>([]);
  const [viewer, setViewer] = useState<Viewer>({ userId: null, isChef: false });
  const [scores, setScores] = useState<Record<string, number>>({});
  const [staffNotes, setStaffNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [pendingDecision, setPendingDecision] = useState<"ACCEPT" | "REJECT" | null>(null);
  const [decideLoading, setDecideLoading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [copied, setCopied] = useState(false);

  const router = useRouter();

  const ticketRef = useRef<Ticket | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => { ticketRef.current = ticket; }, [ticket]);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  useEffect(() => { savingRef.current = saving; }, [saving]);

  const sections = useMemo(() => {
    const bySection: Record<string, Question[]> = { GENERAL: [], TRAP: [] };
    for (const question of questionBank) {
      if (!bySection[question.section]) bySection[question.section] = [];
      bySection[question.section].push(question);
    }
    return bySection as { GENERAL: Question[]; TRAP: Question[] };
  }, [questionBank]);

  const totals = useMemo(() => computeTotals(scores, questionBank), [scores, questionBank]);

  const isClosed = ticket?.status === "CLOSED_ACCEPTED" || ticket?.status === "CLOSED_REJECTED";
  const isClaimedByViewer = Boolean(ticket?.claimedById && viewer.userId && ticket?.claimedById === viewer.userId);
  const canEdit = Boolean(ticket && !isClosed && (!ticket.claimedById || isClaimedByViewer || viewer.isChef));
  const canDecide = Boolean(ticket && !isClosed && (isClaimedByViewer || viewer.isChef));

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/recruitment/${ticketId}`, { cache: "no-store" });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean } & ApiResponse;
      if (!res.ok || !data?.ticket) throw new Error((data as any)?.error || "Échec du chargement");
      setTicket(data.ticket);
      setQuestionBank(data.questionBank ?? []);
      setViewer(data.viewer ?? { userId: null, isChef: false });
      setScores(normalizeScores(data.ticket.scoresJson));
      setStaffNotes(data.ticket.staffNotes ?? "");
      setDirty(false);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    if (!ticketRef.current || !canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/recruitment/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scoresJson: scores, staffNotes }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ticket) throw new Error(json?.error || "Sauvegarde échouée");
      setTicket(json.ticket);
      setDirty(false);
      setLastSavedAt(new Date().toISOString());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function poll() {
    const current = ticketRef.current;
    if (!current || dirtyRef.current || savingRef.current) return;
    const after = current.updatedAt;
    const res = await fetch(
      `/api/staff/recruitment/${ticketId}/poll?after=${encodeURIComponent(after)}`,
      { cache: "no-store" }
    );
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ok || !data.changed || !data.ticket) return;
    setTicket(data.ticket);
    setScores(normalizeScores(data.ticket.scoresJson));
    setStaffNotes(data.ticket.staffNotes ?? "");
    setDirty(false);
  }

  useEffect(() => { load(); }, [ticketId]);

  useEffect(() => {
    if (!ticket || !dirty || !canEdit) return;
    const id = setTimeout(() => { save(); }, 500);
    return () => clearTimeout(id);
  }, [scores, staffNotes, dirty, canEdit, ticket]);

  useEffect(() => {
    // 30s : 3x moins de requêtes Prisma vers /api/staff/recruitment/[id] sans
    // perte UX réelle sur une fiche détail rarement modifiée en simultané.
    const id = setInterval(() => { poll().catch(() => null); }, 30_000);
    return () => clearInterval(id);
  }, []);

  async function claim() {
    setError(null);
    const res = await fetch(`/api/staff/recruitment/${ticketId}/claim`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ticket) { setError(data?.error || "Échec de la prise en charge"); return; }
    setTicket(data.ticket);
  }

  async function applyDecision() {
    if (!pendingDecision || !ticket) return;
    setDecideLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/recruitment/${ticketId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision: pendingDecision }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ticket) throw new Error(data?.error || "Décision échouée");
      setTicket(data.ticket);
      if (pendingDecision === "ACCEPT") setShowAcceptModal(true);
      setPendingDecision(null);
      router.refresh(); // invalide le cache de la liste pour que le statut soit à jour
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDecideLoading(false);
    }
  }

  async function deleteRecruitment() {
    setDeleteLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/recruitment/${ticketId}`, { method: "DELETE" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.ok) throw new Error(data?.error || "Suppression échouée");
      router.refresh();
      router.push(backHref);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setDeleteLoading(false);
    }
  }

  const sectionLabels: Record<"GENERAL" | "TRAP", string> = {
    GENERAL: "Questions générales",
    TRAP: "Questions pièges",
  };

  return (
    <div className="space-y-6">
      {/* Back */}
      <Link href={backHref} className="text-sm text-muted-foreground hover:text-foreground transition-colors">
        {backLabel}
      </Link>

      {loading && <div className="text-sm text-muted-foreground">Chargement...</div>}

      {error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
          <span className="shrink-0">❌</span>
          <div>{error}</div>
        </div>
      )}

      {ticket && (
        <>
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
            <div>
              <h1 className="text-xl font-bold text-foreground mb-1">
                {ticket.ticketKey ? (
                  <span className="font-mono text-cyan-300 mr-2">{ticket.ticketKey}</span>
                ) : null}
                {ticket.candidateRpName}
              </h1>
              <div className="flex items-center gap-2 flex-wrap">
                <StatusBadge className={STATUS_COLORS[ticket.status] ?? ""}>
                  {STATUS_LABELS[ticket.status] ?? ticket.status}
                </StatusBadge>
                <span className="text-xs text-muted-foreground">Créé le {fmtDate(ticket.createdAt)}</span>
                {ticket.claimedBy && (
                  <span className="text-xs text-muted-foreground">· Pris en charge par {ticket.claimedBy.name ?? ticket.claimedBy.id}</span>
                )}
              </div>
            </div>
            <div className="flex items-center gap-2 flex-wrap">
              {ticket.discordThreadId && (
                <MotionButtonFrame>
                  <a
                    href={`https://discord.com/channels/${GUILD_ID}/${ticket.discordThreadId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 rounded-2xl border border-indigo-500/30 bg-indigo-500/12 px-3 py-2 text-xs font-medium text-indigo-200 transition-colors hover:bg-indigo-500/20"
                  >
                    Thread Discord →
                  </a>
                </MotionButtonFrame>
              )}
              {!ticket.claimedById && !isClosed && (
                <MotionButtonFrame>
                  <Button variant="outline" onClick={claim} size="sm" className="rounded-2xl border-white/10 bg-white/[0.04] text-sm">
                    Prendre en charge
                  </Button>
                </MotionButtonFrame>
              )}
            </div>
          </div>

          {/* Candidate info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <SectionCard title="Informations candidat">
              <div className="space-y-1 text-sm">
                <div><span className="text-muted-foreground">Nom RP : </span><span className="text-foreground">{ticket.candidateRpName}</span></div>
                {ticket.candidateAge && <div><span className="text-muted-foreground">Âge : </span><span className="text-foreground">{ticket.candidateAge}</span></div>}
                <div><span className="text-muted-foreground">Discord ID : </span><span className="font-mono text-xs text-cyan-300">{ticket.candidateDiscordId ?? "—"}</span></div>
                <div><span className="text-muted-foreground">Steam ID : </span><span className="font-mono text-xs text-foreground">{ticket.candidateSteamId ?? "—"}</span></div>
              </div>
            </SectionCard>

            <SectionCard title="Score">
              <div className="space-y-1 text-sm">
                <div>
                  <span className="text-muted-foreground">Total : </span>
                  <span className="text-foreground font-medium">{totals.totalPoints.toFixed(1)} / {TOTAL_MAX_POINTS}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">Note : </span>
                  <span className={`font-bold ${totals.totalOn20 < MIN_ON20 ? "text-red-400" : "text-green-400"}`}>
                    {totals.totalOn20.toFixed(2)} / 20
                    {totals.totalOn20 < MIN_ON20 ? " ⚠ insuffisant" : ""}
                  </span>
                </div>
                {lastSavedAt && (
                  <div className="text-xs text-muted-foreground">Sauvegardé à {fmtDate(lastSavedAt)}</div>
                )}
                {saving && <div className="text-xs text-muted-foreground">Sauvegarde...</div>}
                {dirty && canEdit && !saving && <div className="text-xs text-yellow-400">Modifications non sauvegardées</div>}
              </div>
            </SectionCard>

            {ticket.motivation && (
              <SectionCard title="Motivation">
                <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.motivation}</p>
              </SectionCard>
            )}

            {ticket.availabilities && (
              <SectionCard title="Disponibilités">
                <p className="text-sm text-foreground whitespace-pre-wrap">{ticket.availabilities}</p>
              </SectionCard>
            )}
          </div>

          <SectionCard
            title="Test de recrutement"
            description="Conduisez l'entretien oral à l'aide des réponses attendues ci-dessous. Posez chaque question au candidat et notez-le en fonction de sa réponse."
            icon={ClipboardList}
            actions={
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={totals.totalOn20 >= MIN_ON20 ? "success" : "danger"}>
                  {totals.totalOn20.toFixed(2)}/20
                </StatusBadge>
              </div>
            }
          >
            <MotionSection className="grid gap-3 md:grid-cols-3" delay={0.02}>
              <DataTile
                label="Score global"
                tone={totals.totalOn20 >= MIN_ON20 ? "success" : "warning"}
                value={<span className="text-xl font-semibold text-slate-50">{totals.totalPoints.toFixed(1)} / {TOTAL_MAX_POINTS}</span>}
              />
              <DataTile
                label="Note sur 20"
                tone={totals.totalOn20 >= MIN_ON20 ? "success" : "danger"}
                value={<span className="text-xl font-semibold text-slate-50">{totals.totalOn20.toFixed(2)} / 20</span>}
              />
              <DataTile
                label="Seuil minimum"
                tone={totals.totalOn20 >= MIN_ON20 ? "info" : "warning"}
                value={<span className="text-xl font-semibold text-slate-50">{MIN_ON20.toFixed(0)} / 20</span>}
              />
            </MotionSection>

            <div className="mt-4 flex flex-wrap items-center gap-2">
              <StatusBadge tone={totals.totalOn20 >= MIN_ON20 ? "success" : "danger"}>
                {totals.totalOn20 >= MIN_ON20 ? "Seuil atteint" : "Sous le seuil"}
              </StatusBadge>
            </div>
          </SectionCard>

          {/* Questions */}
          {(Object.keys(sections) as Array<"GENERAL" | "TRAP">).map((section) => (
            sections[section].length > 0 && (
              <MotionSection key={section} delay={section === "GENERAL" ? 0.04 : 0.08}>
              <SectionCard
                title={sectionLabels[section]}
                description={section === "GENERAL" ? "Fondamentaux et connaissances générales du candidat." : "Questions de vérification et cas plus sensibles à contrôler."}
                icon={section === "GENERAL" ? MessageSquareText : ShieldAlert}
              >
                <div className="space-y-6">
                  {sections[section].map((question, index) => {
                    const scoreRaw = scores[question.id]; // undefined si non encore noté
                    const hasScore = scoreRaw !== undefined;
                    return (
                      <div key={question.id} className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
                        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                          <div className="min-w-0 flex-1 space-y-3">
                            <div className="flex flex-wrap items-center gap-2">
                              <StatusBadge>
                                {hasScore ? `${scoreRaw!.toFixed(1)} / ${question.pointsMax}` : `— / ${question.pointsMax}`}
                              </StatusBadge>
                              <span className="text-[11px] uppercase tracking-[0.16em] text-slate-500">Question {index + 1}</span>
                            </div>

                            <div className="space-y-2">
                              <p className="text-sm font-semibold text-slate-50">{question.label}</p>
                              {question.hint ? <p className="text-xs text-slate-400">{question.hint}</p> : null}
                            </div>

                            {question.expectedAnswer && (
                              <div className="rounded-2xl border border-amber-500/20 bg-amber-500/[0.06] px-4 py-3">
                                <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-amber-400/80">
                                  <CheckCircle2 className="h-3.5 w-3.5" />
                                  Réponse attendue
                                </div>
                                <p className="whitespace-pre-wrap text-sm leading-6 text-foreground/90">
                                  {question.expectedAnswer}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="w-full rounded-2xl border border-white/8 bg-slate-950/45 p-4 lg:w-[17rem]">
                            <div className="grid gap-3">
                              <div>
                                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Note actuelle</div>
                                <div className="mt-1 text-lg font-semibold text-slate-50">
                                  {hasScore ? `${scoreRaw!.toFixed(1)} / ${question.pointsMax}` : `— / ${question.pointsMax}`}
                                </div>
                              </div>

                              {question.pointsMax > 0 ? (
                                <label className="grid gap-2">
                                  <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">Notation staff</span>
                                  <input
                                    type="number"
                                    min={0}
                                    max={question.pointsMax}
                                    step={question.step ?? 0.5}
                                    value={hasScore ? scoreRaw : ""}
                                    placeholder="Note"
                                    disabled={!canEdit}
                                    onChange={(e) => {
                                      const raw = e.target.value;
                                      if (raw === "") {
                                        setScores((prev) => {
                                          const next = { ...prev };
                                          delete next[question.id];
                                          return next;
                                        });
                                      } else {
                                        const next = Math.min(Math.max(Number(raw), 0), question.pointsMax);
                                        setScores((prev) => ({ ...prev, [question.id]: next }));
                                      }
                                      setDirty(true);
                                    }}
                                    className="rounded-xl border border-white/10 bg-slate-950/70 px-3 py-2 text-sm text-slate-100 placeholder:text-slate-500 outline-none focus:border-amber-500/40 disabled:opacity-50"
                                  />
                                  <span className="text-xs text-slate-500">Pas de {formatStep(question.step)} jusqu'à {question.pointsMax} point(s).</span>
                                </label>
                              ) : (
                                <div className="rounded-xl border border-white/8 bg-white/[0.03] px-3 py-2 text-xs text-slate-400">
                                  Question informative non notée.
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionCard>
              </MotionSection>
            )
          ))}

          {/* Notes staff */}
          <SectionCard title="Notes staff">
            <textarea
              rows={4}
              value={staffNotes}
              disabled={!canEdit}
              onChange={(e) => {
                setStaffNotes(e.target.value);
                setDirty(true);
              }}
              placeholder="Notes internes, observations..."
              className="w-full px-3 py-2 rounded-lg bg-card/70 border border-white/8 text-foreground placeholder-gray-500 text-sm focus:outline-none focus:border-white/20 resize-none disabled:opacity-50"
            />
          </SectionCard>

          {/* Decision closed */}
          {isClosed && (
            <SectionCard title="Décision finale">
              <div className="text-sm">
                <span className={`inline-block px-2.5 py-1 rounded-full text-xs font-semibold mb-2 ${STATUS_COLORS[ticket.status] ?? ""}`}>
                  {STATUS_LABELS[ticket.status] ?? ticket.status}
                </span>
                {ticket.closedAt && (
                  <div><span className="text-muted-foreground">Clôturée le : </span><span className="text-foreground">{fmtDate(ticket.closedAt)}</span></div>
                )}
              </div>
            </SectionCard>
          )}

          {/* Actions */}
          {canDecide && !pendingDecision && (
            <SectionCard title="Décision">
              <div className="flex gap-3 flex-wrap">
                <MotionButtonFrame>
                  <Button
                    onClick={() => setPendingDecision("ACCEPT")}
                    className="rounded-2xl bg-green-600 hover:bg-green-700 text-white border-0"
                  >
                    Accepter
                  </Button>
                </MotionButtonFrame>
                <MotionButtonFrame>
                  <Button
                    variant="destructive"
                    className="rounded-2xl"
                    onClick={() => setPendingDecision("REJECT")}
                  >
                    Refuser
                  </Button>
                </MotionButtonFrame>
              </div>
            </SectionCard>
          )}

          {pendingDecision && (
            <SectionCard title={pendingDecision === "ACCEPT" ? "Confirmer l'acceptation" : "Confirmer le refus"}>
              <div className="space-y-3">
                <p className="text-sm text-foreground">
                  {pendingDecision === "ACCEPT"
                    ? `Accepter la candidature de ${ticket.candidateRpName} ?`
                    : `Refuser la candidature de ${ticket.candidateRpName} ?`}
                </p>
                {pendingDecision === "ACCEPT" && !ticket.candidateSteamId && (
                  <div className="px-3 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-xs">
                    ⚠ Aucun Steam ID renseigné — la whitelist ne sera pas mise à jour.
                  </div>
                )}
                <div className="flex gap-3">
                  <MotionButtonFrame>
                    <Button
                      onClick={applyDecision}
                      disabled={decideLoading}
                      className={pendingDecision === "ACCEPT" ? "rounded-2xl bg-green-600 hover:bg-green-700 text-white border-0" : "rounded-2xl"}
                      variant={pendingDecision === "REJECT" ? "destructive" : "default"}
                    >
                      {decideLoading ? "En cours..." : "Confirmer"}
                    </Button>
                  </MotionButtonFrame>
                  <MotionButtonFrame>
                    <Button variant="ghost" className="rounded-2xl" onClick={() => setPendingDecision(null)} disabled={decideLoading}>
                      Annuler
                    </Button>
                  </MotionButtonFrame>
                </div>
              </div>
            </SectionCard>
          )}

          {/* Zone de danger — suppression */}
          {!pendingDelete && (
            <div className="pt-2">
              <button
                onClick={() => setPendingDelete(true)}
                className="text-xs text-red-400/60 hover:text-red-400 transition-colors underline underline-offset-2"
              >
                Supprimer ce recrutement
              </button>
            </div>
          )}

          {pendingDelete && (
            <SectionCard title="Supprimer le recrutement">
              <div className="space-y-3">
                <p className="text-sm text-foreground">
                  Supprimer définitivement le dossier de <span className="font-semibold">{ticket.candidateRpName}</span> ?
                  Cette action est irréversible.
                </p>
                <div className="flex gap-3">
                  <MotionButtonFrame>
                    <Button
                      variant="destructive"
                      className="rounded-2xl"
                      onClick={deleteRecruitment}
                      disabled={deleteLoading}
                    >
                      {deleteLoading ? "Suppression..." : "Supprimer définitivement"}
                    </Button>
                  </MotionButtonFrame>
                  <MotionButtonFrame>
                    <Button variant="ghost" className="rounded-2xl" onClick={() => setPendingDelete(false)} disabled={deleteLoading}>
                      Annuler
                    </Button>
                  </MotionButtonFrame>
                </div>
              </div>
            </SectionCard>
          )}
        </>
      )}

      {/* Modale rappel règlement — affichée uniquement après une acceptation réussie */}
      {showAcceptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-slate-900 shadow-2xl">
            <div className="border-b border-white/10 px-6 py-4">
              <h2 className="text-base font-semibold text-slate-50">Rappel à communiquer au nouveau membre</h2>
            </div>
            <div className="px-6 py-5 space-y-3 text-sm text-slate-200">
              <p className="font-semibold text-slate-100">📌 Règlement – Rappel important</p>
              <ul className="space-y-2 text-slate-300">
                <li>• <span className="text-slate-100 font-medium">SPE obligatoire</span> : Négociation / Conduite / Construction</li>
                <li>• <span className="text-slate-100 font-medium">300 minutes minimum</span> par semaine</li>
                <li>• <span className="text-slate-100 font-medium">Réunion obligatoire</span> 1 semaine sur 2</li>
                <li>• En cas de sanction (ban / warn / jail) → signaler dans le salon <span className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded">sanctions</span></li>
                <li>• Si absence réunion ou playtime insuffisant → prévenir dans le salon <span className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded">absences</span></li>
                <li>• <span className="text-slate-100 font-medium">150 000$</span> à chaque spawn, remboursable via la commande <span className="font-mono text-xs bg-slate-800 px-1.5 py-0.5 rounded">!famille</span></li>
              </ul>
            </div>
            <div className="border-t border-white/10 px-6 py-4 flex items-center justify-end gap-3">
              <button
                onClick={() => {
                  const text = [
                    "📌 Règlement – Rappel important",
                    "",
                    "• SPE obligatoire : Négociation / Conduite / Construction",
                    "• 300 minutes minimum par semaine",
                    "• Réunion obligatoire 1 semaine sur 2",
                    "• En cas de sanction (ban / warn / jail) → signaler dans le salon sanctions",
                    "• Si absence réunion ou playtime insuffisant → prévenir dans le salon absences",
                    "• 150 000$ à chaque spawn, remboursable via la commande !famille",
                  ].join("\n");
                  navigator.clipboard.writeText(text).then(() => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  });
                }}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-100 transition-colors hover:bg-white/[0.08]"
              >
                {copied ? "✅ Copié !" : "📋 Copier le rappel"}
              </button>
              <button
                onClick={() => { setShowAcceptModal(false); setCopied(false); }}
                className="rounded-2xl bg-slate-700 hover:bg-slate-600 px-4 py-2 text-sm font-semibold text-white transition-colors"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
