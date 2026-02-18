"use client";

import { useState } from "react";

type TicketMessage = {
  id: string;
  discordMessageId: string;
  authorDiscordId: string | null;
  authorTag: string | null;
  content: string | null;
  createdAt: string;
  isDeleted: boolean;
};

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-BE");
}

export function TicketConversation({
  ticketKind,
  ticketId,
}: {
  ticketKind: "COMPLAINT" | "RECRUITMENT";
  ticketId: string;
}) {
  const [messages, setMessages] = useState<TicketMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadMessages() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/staff/tickets/messages?ticketKind=${ticketKind}&ticketId=${ticketId}`,
        { cache: "no-store" }
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to load messages");
      setMessages(json.messages ?? []);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }

  async function syncTicket() {
    setSyncing(true);
    setError(null);
    try {
      const res = await fetch("/api/staff/tickets/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticketKind, ticketId }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Failed to sync");

      // Wait a bit then reload
      setTimeout(() => {
        loadMessages();
      }, 2000);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div className="border border-slate-800 rounded-lg bg-slate-900/40 p-4 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-semibold text-foreground">Conversation Discord</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={loadMessages}
            disabled={loading}
            className="px-3 py-2 rounded text-sm font-semibold border border-slate-800 hover:bg-slate-900/20 disabled:opacity-60"
          >
            {loading ? "Chargement..." : "Charger"}
          </button>
          <button
            type="button"
            onClick={syncTicket}
            disabled={syncing}
            className="px-3 py-2 rounded text-sm font-semibold bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-60"
          >
            {syncing ? "Sync..." : "🔄 Rafraîchir"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="p-3 border border-red-200 bg-red-50 text-red-800 rounded text-sm mb-3">
          {error}
        </div>
      ) : null}

      {messages.length === 0 ? (
        <div className="text-sm text-gray-500 text-center py-6">
          Aucun message. Cliquez sur &quot;Charger&quot; pour voir la conversation.
        </div>
      ) : (
        <div className="grid gap-3 max-h-96 overflow-y-auto">
          {messages.map((msg) => (
            <div
              key={msg.id}
              className={`p-3 rounded border ${
                msg.isDeleted
                  ? "border-slate-800 bg-slate-900/20 opacity-60"
                  : "border-slate-800 bg-slate-900/40"
              }`}
            >
              <div className="flex items-start justify-between mb-2">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-sm text-foreground">
                    {msg.authorTag || msg.authorDiscordId || "Inconnu"}
                  </span>
                  {msg.isDeleted && (
                    <span className="text-xs text-red-600 font-semibold">(Supprimé)</span>
                  )}
                </div>
                <span className="text-xs text-gray-500">{fmtDate(msg.createdAt)}</span>
              </div>
              <div className="text-sm text-foreground whitespace-pre-wrap">
                {msg.content || "(message vide)"}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
