"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getDiscordThreadUrl } from "@/lib/discord-config";
import { TicketConversation } from "../../ui/TicketConversation";
import { useConfirm } from "@/components/staff/ui/use-confirm";

function CopyLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (e) {
      console.error("Failed to copy:", e);
    }
  };

  return (
    <button
      onClick={copyToClipboard}
      className="bg-gray-200 text-gray-800 px-3 py-2 rounded hover:bg-gray-300 text-sm"
    >
      {copied ? "✓ Copié !" : "📋 Copier le lien"}
    </button>
  );
}

type Recruitment = {
  id: string;
  ticketKey: string;
  status: "OPEN" | "FINI";
  dbStatus: string;
  authorDiscordId: string;
  authorTag: string | null;
  steamId: string | null;
  rpName: string | null;
  motivation: string | null;
  availabilities: string | null;
  payload: Record<string, unknown> | null;
  threadId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedByDiscordId: string | null;
  closeReason: string | null;
};

export function RecruitmentDetailClient({
  recruitment: initialData,
}: {
  recruitment: Recruitment;
}) {
  const router = useRouter();
  const { confirm, dialog: confirmDialog } = useConfirm();
  const [recruitment, setRecruitment] = useState(initialData);
  const [loading, setLoading] = useState(false);
  const [deciding, setDeciding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const updateStatus = async (newStatus: "PENDING" | "ARCHIVED") => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/staff/recruitments/${recruitment.ticketKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: newStatus }),
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Erreur");
        return;
      }

      // Refresh page
      router.refresh();
    } catch (e) {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  const makeDecision = async (decision: "ACCEPT" | "REJECT") => {
    const isAccept = decision === "ACCEPT";
    const ok = await confirm({
      title: isAccept ? "Accepter ce recrutement ?" : "Refuser ce recrutement ?",
      description: isAccept
        ? "Le candidat sera intégré à la famille et recevra les rôles correspondants sur Discord."
        : "Le candidat sera notifié du refus. Cette décision peut être révisée plus tard si besoin.",
      confirmLabel: isAccept ? "Accepter" : "Refuser",
      tone: isAccept ? "info" : "danger",
    });
    if (!ok) return;

    setDeciding(true);
    setError(null);

    try {
      const res = await fetch(`/api/staff/recruitment/${recruitment.id}/decide`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision }),
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Erreur");
        return;
      }

      alert(`Décision "${decision}" enregistrée avec succès ! Discord a été notifié.`);
      router.refresh();
    } catch (e) {
      setError("Erreur réseau");
      console.error("Decision error:", e);
    } finally {
      setDeciding(false);
    }
  };

  return (
    <div className="space-y-6">
      {confirmDialog}
      <div className="mb-4">
        <Link href="/staff/recruitments" className="text-blue-600 hover:underline">
          ← Retour à la liste
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">Recrutement {recruitment.ticketKey}</h1>
        <span
          className={`px-3 py-1 rounded text-sm font-medium ${
            recruitment.status === "OPEN"
              ? "bg-green-500/20 text-green-400 border border-green-500/30"
              : "bg-slate-500/20 text-slate-400 border border-slate-500/30"
          }`}
        >
          {recruitment.status}
        </span>
      </div>

      {error && (
        <div className="bg-red-500/10 text-red-400 px-4 py-2 rounded mb-4 border border-red-500/30">
          {error}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Infos principales */}
        <div className="border rounded p-4">
          <h2 className="font-semibold mb-3">Informations</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Discord ID</dt>
              <dd className="font-mono">{recruitment.authorDiscordId}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Tag</dt>
              <dd>{recruitment.authorTag ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Steam ID</dt>
              <dd className="font-mono">{recruitment.steamId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Nom RP</dt>
              <dd>{recruitment.rpName ?? "—"}</dd>
            </div>
          </dl>
        </div>

        {/* Meta */}
        <div className="border rounded p-4">
          <h2 className="font-semibold mb-3">Métadonnées</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Créé le</dt>
              <dd>{new Date(recruitment.createdAt).toLocaleString("fr-FR")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Mis à jour</dt>
              <dd>{new Date(recruitment.updatedAt).toLocaleString("fr-FR")}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fermé le</dt>
              <dd>
                {recruitment.closedAt
                  ? new Date(recruitment.closedAt).toLocaleString("fr-FR")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Fermé par</dt>
              <dd>{recruitment.closedByDiscordId ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Motivation & Dispo */}
      <div className="mt-6 border rounded p-4">
        <h2 className="font-semibold mb-3">Motivation</h2>
        <p className="text-sm whitespace-pre-wrap bg-slate-900/20 p-3 rounded">
          {recruitment.motivation ?? "—"}
        </p>
      </div>

      <div className="mt-4 border rounded p-4">
        <h2 className="font-semibold mb-3">Disponibilités</h2>
        <p className="text-sm whitespace-pre-wrap bg-slate-900/20 p-3 rounded">
          {recruitment.availabilities ?? "—"}
        </p>
      </div>

      {/* Payload brut */}
      {recruitment.payload && Object.keys(recruitment.payload).length > 0 && (
        <div className="mt-4 border rounded p-4">
          <h2 className="font-semibold mb-3">Payload Brut</h2>
          <pre className="text-xs bg-slate-900/20 p-3 rounded overflow-auto">
            {JSON.stringify(recruitment.payload, null, 2)}
          </pre>
        </div>
      )}

      {/* Décision Staff */}
      <div className="mt-6 border rounded p-4">
        <h2 className="font-semibold mb-3">Décision Staff</h2>
        {recruitment.status === "OPEN" ? (
          <div className="flex gap-3 flex-wrap">
            <button
              onClick={() => makeDecision("ACCEPT")}
              disabled={deciding}
              className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {deciding ? "⏳ Traitement..." : "✅ Accepter"}
            </button>
            <button
              onClick={() => makeDecision("REJECT")}
              disabled={deciding}
              className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {deciding ? "⏳ Traitement..." : "❌ Refuser"}
            </button>
          </div>
        ) : (
          <div className="bg-slate-500/20 text-slate-400 px-4 py-2 rounded border border-slate-500/30 inline-block">
            ℹ️ Ce recrutement est déjà fermé ({recruitment.dbStatus})
          </div>
        )}
        <p className="text-xs text-slate-500 mt-3">
          ✨ Discord sera notifié automatiquement avec le résultat de l'évaluation au channel <code className="bg-slate-900/20 px-2 py-0.5 rounded">TICKETS_LOGS_CHANNEL_ID</code>.
        </p>
      </div>

      {/* Conversation Discord */}
      <div className="mt-6">
        <TicketConversation ticketKind="RECRUITMENT" ticketId={recruitment.id} />
      </div>
    </div>
  );
}
