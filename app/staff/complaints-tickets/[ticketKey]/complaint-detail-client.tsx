"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getDiscordThreadUrl } from "@/lib/discord-config";
import { StyledSelect } from "@/components/staff/ui/StyledSelect";

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

type Complaint = {
  id: string;
  ticketKey: string;
  status: string;
  authorDiscordId: string | null;
  authorTag: string | null;
  targetName: string | null;
  title: string;
  description: string;
  summary: string | null;
  payload: Record<string, unknown> | null;
  threadId: string | null;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  closedByDiscordId: string | null;
  closeReason: string | null;
};

const STATUS_OPTIONS = [
  { value: "OPEN", label: "OPEN" },
  { value: "RESOLVED", label: "TRAITÉ" },
  { value: "REJECTED", label: "NON RÉSOLU / REFUSÉ" },
  { value: "CLOSED", label: "FERMÉ" },
];

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-green-100 text-green-800",
  RESOLVED: "bg-blue-100 text-blue-800",
  REJECTED: "bg-orange-100 text-orange-800",
  CLOSED: "bg-gray-100 text-gray-800",
};

export function ComplaintDetailClient({
  complaint: initialData,
}: {
  complaint: Complaint;
}) {
  const router = useRouter();
  const [complaint, setComplaint] = useState(initialData);
  const [newStatus, setNewStatus] = useState(complaint.status);
  const [newSummary, setNewSummary] = useState(complaint.summary ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const updateComplaint = async () => {
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/staff/complaints-tickets/${complaint.ticketKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: newStatus,
          summary: newSummary || null,
        }),
      });

      const data = await res.json();
      if (!data.ok) {
        setError(data.error ?? "Erreur");
        return;
      }

      setSuccess(true);
      router.refresh();
    } catch (e) {
      setError("Erreur réseau");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-4">
        <Link href="/staff/complaints-tickets" className="text-blue-600 hover:underline">
          ← Retour à la liste
        </Link>
      </div>

      <div className="flex items-center gap-4 mb-6">
        <h1 className="text-2xl font-bold">Plainte {complaint.ticketKey}</h1>
        <span
          className={`px-3 py-1 rounded text-sm font-medium ${
            STATUS_COLORS[complaint.status] ?? STATUS_COLORS.CLOSED
          }`}
        >
          {complaint.status}
        </span>
      </div>

      {error && (
        <div className="bg-red-100 text-red-800 px-4 py-2 rounded mb-4">
          {error}
        </div>
      )}

      {success && (
        <div className="bg-green-100 text-green-800 px-4 py-2 rounded mb-4">
          Mis à jour avec succès
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Infos principales */}
        <div className="border rounded p-4">
          <h2 className="font-semibold mb-3">Informations</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-gray-500">Auteur Discord</dt>
              <dd className="font-mono">{complaint.authorDiscordId ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Tag</dt>
              <dd>{complaint.authorTag ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Cible</dt>
              <dd>{complaint.targetName ?? "—"}</dd>
            </div>
          </dl>
        </div>

        {/* Meta */}
        <div className="border rounded p-4">
          <h2 className="font-semibold mb-3">Métadonnées</h2>
          <dl className="space-y-2 text-sm">
            <div>
              <dt className="text-gray-500">Créé le</dt>
              <dd>{new Date(complaint.createdAt).toLocaleString("fr-FR")}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Mis à jour</dt>
              <dd>{new Date(complaint.updatedAt).toLocaleString("fr-FR")}</dd>
            </div>
            <div>
              <dt className="text-gray-500">Fermé le</dt>
              <dd>
                {complaint.closedAt
                  ? new Date(complaint.closedAt).toLocaleString("fr-FR")
                  : "—"}
              </dd>
            </div>
            <div>
              <dt className="text-gray-500">Fermé par</dt>
              <dd>{complaint.closedByDiscordId ?? "—"}</dd>
            </div>
          </dl>
        </div>
      </div>

      {/* Titre & Description */}
      <div className="mt-6 border rounded p-4">
        <h2 className="font-semibold mb-3">Raison / Titre</h2>
        <p className="text-sm bg-gray-50 p-3 rounded">{complaint.title}</p>
      </div>

      <div className="mt-4 border rounded p-4">
        <h2 className="font-semibold mb-3">Description</h2>
        <p className="text-sm whitespace-pre-wrap bg-gray-50 p-3 rounded">
          {complaint.description}
        </p>
      </div>

      {/* Payload brut */}
      {complaint.payload && Object.keys(complaint.payload).length > 0 && (
        <div className="mt-4 border rounded p-4">
          <h2 className="font-semibold mb-3">Payload (brut)</h2>
          <pre className="text-xs bg-gray-50 p-3 rounded overflow-auto">
            {JSON.stringify(complaint.payload, null, 2)}
          </pre>
        </div>
      )}

      {/* Thread Discord */}
      <div className="mt-6 border rounded p-4">
        <h2 className="font-semibold mb-3">Thread Discord</h2>
        {complaint.threadId ? (
          <div className="flex gap-3 items-center">
            <a
              href={getDiscordThreadUrl(complaint.threadId)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block bg-indigo-600 text-white px-4 py-2 rounded hover:bg-indigo-700"
            >
              Ouvrir le thread Discord
            </a>
            <CopyLinkButton url={getDiscordThreadUrl(complaint.threadId)} />
          </div>
        ) : (
          <p className="text-gray-500">Aucun thread associé</p>
        )}
      </div>

      {/* Actions */}
      <div className="mt-6 border rounded p-4">
        <h2 className="font-semibold mb-3">Actions Staff</h2>

        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-600 mb-1">Status</label>
            <StyledSelect
              value={newStatus}
              onChange={(e) => setNewStatus(e.target.value)}
              className="w-full max-w-xs"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </StyledSelect>
          </div>

          <div>
            <label className="block text-sm text-gray-600 mb-1">
              Résumé / Notes (optionnel)
            </label>
            <textarea
              value={newSummary}
              onChange={(e) => setNewSummary(e.target.value)}
              className="border rounded px-3 py-2 w-full"
              rows={3}
              placeholder="Notes internes..."
            />
          </div>

          <button
            onClick={updateComplaint}
            disabled={loading}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? "..." : "Enregistrer"}
          </button>
        </div>

        <p className="text-xs text-gray-500 mt-3">
          Note : le lock/archive du thread Discord se fait uniquement via les boutons Discord.
        </p>
      </div>
    </div>
  );
}
