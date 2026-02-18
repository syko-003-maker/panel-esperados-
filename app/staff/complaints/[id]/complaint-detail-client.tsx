"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { TicketConversation } from "../../ui/TicketConversation";

type TicketStatus = "OPEN" | "TREATED" | "UNTREATED" | "CLOSED";

type Ticket = {
  id: string;
  channelId: string;
  status: TicketStatus;
  createdAtDiscord: string;
  closedAtDiscord: string | null;
};

type LastMessagePreview = {
  content: string;
  authorNameSnapshot: string | null;
  createdAtDiscord: string;
} | null;

type TicketDetail = {
  ticket: Ticket;
  messagesCount: number;
  lastMessagePreview: LastMessagePreview;
};

const STATUSES: TicketStatus[] = ["OPEN", "TREATED", "UNTREATED", "CLOSED"];

function fmtDate(iso: string | null) {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-BE");
}

function statusStyle(status: TicketStatus) {
  switch (status) {
    case "OPEN":
      return { background: "#ecfdf3", color: "#027a48" };
    case "TREATED":
      return { background: "#eff8ff", color: "#175cd3" };
    case "UNTREATED":
      return { background: "#fff4e6", color: "#b54708" };
    case "CLOSED":
      return { background: "#f2f4f7", color: "#344054" };
    default:
      return { background: "#f2f4f7", color: "#344054" };
  }
}

export default function ComplaintDetailClient({ ticketId }: { ticketId: string }) {
  const [data, setData] = useState<TicketDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updating, setUpdating] = useState(false);
  const [deciding, setDeciding] = useState(false);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/complaints/${ticketId}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load");
      setData({
        ticket: json.ticket,
        messagesCount: json.messagesCount,
        lastMessagePreview: json.lastMessagePreview,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(newStatus: TicketStatus) {
    if (!data) return;
    setUpdating(true);
    try {
      const res = await fetch(`/api/staff/complaints/${ticketId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to update");
      setData((prev) =>
        prev ? { ...prev, ticket: { ...prev.ticket, status: newStatus } } : prev
      );
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setUpdating(false);
    }
  }

  async function makeDecision(decision: "APPROVED" | "REJECTED" | "DISMISSED") {
    if (!data) return;
    
    const labels = { APPROVED: "APPROUVÉE", REJECTED: "REJETÉE", DISMISSED: "NON TRAITÉE" };
    const confirmMsg = `Êtes-vous sûr de vouloir marquer cette plainte comme "${labels[decision]}" ?`;
    if (!window.confirm(confirmMsg)) return;

    setDeciding(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/complaint/${ticketId}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to make decision");
      
      // Reload data
      await load();
      alert(`Décision "${labels[decision]}" enregistrée avec succès ! Discord a été notifié.`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setDeciding(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId]);

  if (loading) {
    return <div>Loading...</div>;
  }

  if (error) {
    return (
      <div style={{ padding: 10, border: "1px solid #f2bcbc", background: "#fff5f5" }}>
        {error}
      </div>
    );
  }

  if (!data) {
    return <div>Ticket not found</div>;
  }

  const { ticket, messagesCount, lastMessagePreview } = data;

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <div>
        <Link href="/staff/complaints" style={{ color: "#175cd3" }}>
          ← Back to list
        </Link>
      </div>

      <div style={{ display: "grid", gap: 16 }}>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>
          Complaint: {ticket.channelId}
        </h1>

        <div style={{ display: "grid", gap: 8 }}>
          <div>
            <strong>Status:</strong>{" "}
            <span
              style={{
                ...statusStyle(ticket.status),
                padding: "2px 8px",
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              {ticket.status}
            </span>
          </div>
          <div>
            <strong>Created:</strong> {fmtDate(ticket.createdAtDiscord)}
          </div>
          {ticket.closedAtDiscord && (
            <div>
              <strong>Closed:</strong> {fmtDate(ticket.closedAtDiscord)}
            </div>
          )}
          <div>
            <strong>Messages:</strong> {messagesCount}
          </div>
        </div>

        {lastMessagePreview && (
          <div
            style={{
              padding: 12,
              background: "#f9fafb",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>
              Last message by {lastMessagePreview.authorNameSnapshot || "Unknown"}
            </div>
            <div style={{ fontSize: 14, color: "#6b7280" }}>
              {fmtDate(lastMessagePreview.createdAtDiscord)}
            </div>

        {/* Decision Buttons */}
        {ticket.status !== "CLOSED" && (
          <div style={{ 
            padding: 16, 
            border: "2px solid #3b82f6", 
            borderRadius: 8, 
            background: "#eff6ff",
            marginTop: 16
          }}>
            <div style={{ fontWeight: 600, marginBottom: 12, color: "#1e40af" }}>
              📋 Décision Staff
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                disabled={deciding}
                onClick={() => makeDecision("APPROVED")}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "#10b981",
                  color: "white",
                  fontWeight: 600,
                  cursor: deciding ? "not-allowed" : "pointer",
                  opacity: deciding ? 0.6 : 1,
                }}
              >
                ✅ Approuver
              </button>
              <button
                type="button"
                disabled={deciding}
                onClick={() => makeDecision("REJECTED")}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "#ef4444",
                  color: "white",
                  fontWeight: 600,
                  cursor: deciding ? "not-allowed" : "pointer",
                  opacity: deciding ? 0.6 : 1,
                }}
              >
                ❌ Rejeter
              </button>
              <button
                type="button"
                disabled={deciding}
                onClick={() => makeDecision("DISMISSED")}
                style={{
                  padding: "8px 16px",
                  borderRadius: 6,
                  border: "none",
                  background: "#6b7280",
                  color: "white",
                  fontWeight: 600,
                  cursor: deciding ? "not-allowed" : "pointer",
                  opacity: deciding ? 0.6 : 1,
                }}
              >
                🚫 Classer sans suite
              </button>
              {deciding && <span style={{ color: "#1e40af", fontWeight: 600 }}>⏳ Enregistrement...</span>}
            </div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 8 }}>
              ✨ La décision sera notifiée sur Discord via le canal de logs configuré.
            </div>
          </div>
        )}
            <div style={{ marginTop: 8, whiteSpace: "pre-wrap" }}>
              {lastMessagePreview.content.length > 300
                ? lastMessagePreview.content.slice(0, 300) + "..."
                : lastMessagePreview.content}
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
          <strong>Update status:</strong>
          {STATUSES.map((s) => (
            <button
              key={s}
              type="button"
              disabled={updating || ticket.status === s}
              onClick={() => updateStatus(s)}
              style={{
                padding: "6px 12px",
                borderRadius: 6,
                border: "1px solid #d1d5db",
                background: ticket.status === s ? "#e5e7eb" : "#fff",
                cursor: ticket.status === s ? "default" : "pointer",
                opacity: updating ? 0.6 : 1,
              }}
            >
              {s}
            </button>
          ))}
          {updating && <span>Updating...</span>}
        </div>
      </div>

      {/* Conversation Discord */}
      <TicketConversation ticketKind="COMPLAINT" ticketId={ticketId} />
    </div>
  );
}
