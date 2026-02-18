"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { MIN_ON20, TOTAL_MAX_POINTS } from "@/lib/recruitment/questionBank";

type Question = {
  id: string;
  section: "GENERAL" | "TRAP";
  label: string;
  pointsMax: number;
  hint?: string;
  step?: number;
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

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-BE");
}

function normalizeAnswers(value: Ticket["answersJson"]) {
  if (!value || typeof value !== "object") return {};
  const next: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    next[key] = String(raw ?? "");
  }
  return next;
}

function normalizeScores(value: Ticket["scoresJson"]) {
  if (!value || typeof value !== "object") return {};
  const next: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value)) {
    const parsed = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(parsed)) next[key] = parsed;
  }
  return next;
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

function statusLabel(status: Ticket["status"]) {
  if (status === "CLOSED_ACCEPTED") return "ACCEPTED";
  if (status === "CLOSED_REJECTED") return "REJECTED";
  return status;
}

export default function RecruitmentDetailClient({ ticketId }: { ticketId: string }) {
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [questionBank, setQuestionBank] = useState<Question[]>([]);
  const [viewer, setViewer] = useState<Viewer>({ userId: null, isChef: false });
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [scores, setScores] = useState<Record<string, number>>({});
  const [staffNotes, setStaffNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  const ticketRef = useRef<Ticket | null>(null);
  const dirtyRef = useRef(false);
  const savingRef = useRef(false);

  useEffect(() => {
    ticketRef.current = ticket;
  }, [ticket]);

  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  useEffect(() => {
    savingRef.current = saving;
  }, [saving]);

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
      if (!res.ok || !data?.ticket) throw new Error((data as any)?.error || "Failed to load");
      setTicket(data.ticket);
      setQuestionBank(data.questionBank ?? []);
      setViewer(data.viewer ?? { userId: null, isChef: false });
      setAnswers(normalizeAnswers(data.ticket.answersJson));
      setScores(normalizeScores(data.ticket.scoresJson));
      setStaffNotes(data.ticket.staffNotes ?? "");
      setDirty(false);
    } catch (err: any) {
      setError(String(err?.message ?? err));
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
        body: JSON.stringify({ answersJson: answers, scoresJson: scores, staffNotes }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ticket) throw new Error(json?.error || "Save failed");
      setTicket(json.ticket);
      setDirty(false);
      setLastSavedAt(new Date().toISOString());
    } catch (err: any) {
      setError(String(err?.message ?? err));
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
    if (!res.ok || !data?.ok) return;
    if (!data.changed || !data.ticket) return;

    setTicket(data.ticket);
    setAnswers(normalizeAnswers(data.ticket.answersJson));
    setScores(normalizeScores(data.ticket.scoresJson));
    setStaffNotes(data.ticket.staffNotes ?? "");
    setDirty(false);
  }

  useEffect(() => {
    load();
  }, [ticketId]);

  useEffect(() => {
    if (!ticket) return;
    if (!dirty || !canEdit) return;
    const id = setTimeout(() => {
      save();
    }, 500);
    return () => clearTimeout(id);
  }, [answers, scores, staffNotes, dirty, canEdit, ticket]);

  useEffect(() => {
    const id = setInterval(() => {
      poll().catch(() => null);
    }, 1500);
    return () => clearInterval(id);
  }, []);

  async function claim() {
    setError(null);
    const res = await fetch(`/api/staff/recruitment/${ticketId}/claim`, { method: "POST" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ticket) {
      setError(data?.error || "Claim failed");
      return;
    }
    setTicket(data.ticket);
  }

  async function decide(decision: "ACCEPT" | "REJECT") {
    if (!ticket) return;
    const ok = window.confirm(`Confirmer la decision: ${decision === "ACCEPT" ? "ACCEPTER" : "REFUSER"}?`);
    if (!ok) return;
    setError(null);
    const res = await fetch(`/api/staff/recruitment/${ticketId}/decide`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ decision }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || !data?.ticket) {
      setError(data?.error || "Decision failed");
      return;
    }
    setTicket(data.ticket);
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
        <div>
          <h2 style={{ marginBottom: 6 }}>{ticket?.candidateRpName ?? "Recrutement"}</h2>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Created: {ticket ? fmtDate(ticket.createdAt) : "-"} | Status: {ticket ? statusLabel(ticket.status) : "-"}
          </div>
          <div style={{ fontSize: 13, opacity: 0.7 }}>
            Recrute par: {ticket?.claimedBy?.name ?? ticket?.claimedById ?? "-"}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <Link href="/staff/recruitment" style={{ textDecoration: "none" }}>
            Retour liste
          </Link>
          {!ticket?.claimedById && !isClosed ? (
            <button type="button" onClick={claim}>
              Prendre en charge
            </button>
          ) : null}
        </div>
      </div>

      {loading ? <div style={{ opacity: 0.7 }}>Loading...</div> : null}
      {error ? (
        <div style={{ padding: 10, border: "1px solid #f2bcbc", background: "#fff5f5" }}>{error}</div>
      ) : null}

      {ticket ? (
        <div style={{ display: "grid", gap: 12 }}>
          <div style={{ display: "grid", gap: 6, gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <div style={{ fontSize: 13 }}>
              <strong>Age</strong>: {ticket.candidateAge ?? "-"}
            </div>
            <div style={{ fontSize: 13 }}>
              <strong>Discord ID</strong>: {ticket.candidateDiscordId ?? "-"}
            </div>
            <div style={{ fontSize: 13 }}>
              <strong>Steam ID</strong>: {ticket.candidateSteamId ?? "-"}
            </div>
            <div style={{ fontSize: 13 }}>
              <strong>Closed</strong>: {ticket.closedAt ? fmtDate(ticket.closedAt) : "-"}
            </div>
          </div>

          <div style={{ display: "grid", gap: 12 }}>
            {(Object.keys(sections) as Array<"GENERAL" | "TRAP">).map((section) => (
              <div key={section} style={{ border: "1px solid #e4e4e7", padding: 12, borderRadius: 6 }}>
                <h3 style={{ marginBottom: 8 }}>{section}</h3>
                <div style={{ display: "grid", gap: 12 }}>
                  {sections[section].map((question) => {
                    const answerValue = answers[question.id] ?? "";
                    const scoreValue = scores[question.id] ?? 0;
                    return (
                      <div key={question.id} style={{ display: "grid", gap: 6 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
                          <strong>{question.label}</strong>
                          <span style={{ fontSize: 12, opacity: 0.7 }}>{question.pointsMax} pts</span>
                        </div>
                        {question.hint ? <div style={{ fontSize: 12, opacity: 0.7 }}>{question.hint}</div> : null}
                        <textarea
                          rows={3}
                          value={answerValue}
                          disabled={!canEdit}
                          onChange={(e) => {
                            setAnswers((prev) => ({ ...prev, [question.id]: e.target.value }));
                            setDirty(true);
                          }}
                        />
                        <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
                          <input
                            type="range"
                            min={0}
                            max={question.pointsMax}
                            step={question.step ?? 0.5}
                            value={scoreValue}
                            disabled={!canEdit || question.pointsMax === 0}
                            onChange={(e) => {
                              const raw = Number(e.target.value);
                              const next = Math.min(Math.max(raw, 0), question.pointsMax);
                              setScores((prev) => ({ ...prev, [question.id]: next }));
                              setDirty(true);
                            }}
                            style={{ flex: 1 }}
                          />
                          <div style={{ width: 60, textAlign: "right" }}>{scoreValue.toFixed(1)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <div>
              Total: {totals.totalPoints.toFixed(1)} / {TOTAL_MAX_POINTS}
            </div>
            <div>
              Score: {totals.totalOn20.toFixed(2)} / 20
              {totals.totalOn20 < MIN_ON20 ? (
                <span style={{ marginLeft: 8, color: "#b42318" }}>LOW</span>
              ) : null}
            </div>
          </div>

          <div style={{ display: "grid", gap: 6 }}>
            <label>Notes staff</label>
            <textarea
              rows={4}
              value={staffNotes}
              disabled={!canEdit}
              onChange={(e) => {
                setStaffNotes(e.target.value);
                setDirty(true);
              }}
            />
          </div>

          <div style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
            {saving ? <span>Saving...</span> : null}
            {lastSavedAt ? <span style={{ fontSize: 12, opacity: 0.7 }}>Saved {fmtDate(lastSavedAt)}</span> : null}
            {dirty && canEdit ? <span style={{ fontSize: 12, opacity: 0.7 }}>Pending changes</span> : null}
          </div>

          {isClosed ? (
            <div style={{ padding: 10, background: "#f8f8f8" }}>
              Decision: {statusLabel(ticket.status)} | Closed at {fmtDate(ticket.closedAt)}
            </div>
          ) : null}

          {canDecide ? (
            <div style={{ display: "flex", gap: 12 }}>
              <button type="button" onClick={() => decide("ACCEPT")}>ACCEPTER</button>
              <button type="button" onClick={() => decide("REJECT")}>REFUSER</button>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
