"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type SanctionDetailProps = {
  sanction: {
    id: string;
    member: { rpName: string | null; discordId: string | null } | null;
    discordId: string;
    type: string;
    status: string;
    reason: string | null;
    discordStatus: string;
    discordError: string | null;
    expiresAt: string | null;
    clearedAt: string | null;
    clearedStatus: string | null;
    clearedError: string | null;
    createdAt: string;
  };
  audit: Array<{
    id: string;
    action: string;
    createdAt: string;
  }>;
};

export default function SanctionDetailClient({ sanction, audit }: SanctionDetailProps) {
  const router = useRouter();
  const [retrying, setRetrying] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleApply() {
    if (!confirm("Appliquer cette sanction sur Discord maintenant ?")) return;

    setApplying(true);
    setError(null);

    try {
      const res = await fetch(`/api/staff/sanctions/apply/${sanction.id}`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Apply failed");
      alert("✅ Sanction mise en file d'attente pour application Discord");
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setApplying(false);
    }
  }

  async function handleRetry() {
    if (!confirm("Relancer l'application Discord de cette sanction ?")) return;

    setRetrying(true);
    setError(null);

    try {
      const res = await fetch(`/api/staff/sanctions/${sanction.id}/retry`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Retry failed");
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setRetrying(false);
    }
  }

  async function handleClear() {
    if (!confirm("Retirer immédiatement cette sanction ?")) return;

    setClearing(true);
    setError(null);

    try {
      const res = await fetch(`/api/staff/sanctions/${sanction.id}/clear`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Clear failed");
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setClearing(false);
    }
  }

  const canRetry = sanction.discordStatus === "FAILED";
  const canApply = sanction.discordStatus === "PENDING" && sanction.status === "ACTIVE";
  const isApplied = sanction.discordStatus === "APPLIED";
  const AVERT_TYPES = [
    "AVERT_ORAL_PLAYTIME",
    "AVERT_ORAL_REUNION",
    "AVERT_LEGER",
    "AVERT_LOURD",
  ];
  const canClear = AVERT_TYPES.includes(sanction.type) && !sanction.clearedAt;

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sanction</h1>
        <p className="text-sm text-gray-600">ID: {sanction.id}</p>
      </div>

      {error ? (
        <div className="p-3 border border-red-200 bg-red-50 text-red-800 rounded text-sm">{error}</div>
      ) : null}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border rounded">
          <div className="text-xs text-gray-500">Membre</div>
          <div className="font-semibold">
            {sanction.member?.rpName ?? "Unknown"} ({sanction.member?.discordId ?? sanction.discordId})
          </div>
        </div>
        <div className="p-4 border rounded">
          <div className="text-xs text-gray-500">Type</div>
          <div className="font-semibold">{sanction.type}</div>
        </div>
        <div className="p-4 border rounded">
          <div className="text-xs text-gray-500">Statut</div>
          <div className="font-semibold">{sanction.status}</div>
        </div>
        <div className="p-4 border rounded">
          <div className="text-xs text-gray-500">Discord</div>
          <div className="font-semibold">{sanction.discordStatus}</div>
          {sanction.discordError ? (
            <div className="text-xs text-red-600 mt-1">{sanction.discordError}</div>
          ) : null}
        </div>
        <div className="p-4 border rounded">
          <div className="text-xs text-gray-500">Créée le</div>
          <div className="font-semibold">{new Date(sanction.createdAt).toLocaleString("fr-FR")}</div>
        </div>
        {sanction.expiresAt ? (
          <div className="p-4 border rounded">
            <div className="text-xs text-gray-500">Expire le</div>
            <div className="font-semibold">{new Date(sanction.expiresAt).toLocaleString("fr-FR")}</div>
          </div>
        ) : null}
        {sanction.clearedAt ? (
          <div className="p-4 border rounded">
            <div className="text-xs text-gray-500">Levée le</div>
            <div className="font-semibold">{new Date(sanction.clearedAt).toLocaleString("fr-FR")}</div>
            {sanction.clearedStatus ? (
              <div className="text-xs text-gray-600 mt-1">Statut: {sanction.clearedStatus}</div>
            ) : null}
            {sanction.clearedError ? (
              <div className="text-xs text-red-600 mt-1">Erreur: {sanction.clearedError}</div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="p-4 border rounded">
        <div className="text-xs text-gray-500">Raison</div>
        <div className="font-semibold">{sanction.reason ?? "-"}</div>
      </div>

      {canApply ? (
        <div className="p-4 border-2 border-blue-500 bg-blue-50 rounded">
          <div className="text-sm font-semibold text-blue-900 mb-2">🎯 Application Discord</div>
          <div className="flex gap-3">
            <button
              onClick={handleApply}
              disabled={applying}
              className="px-4 py-2 text-sm font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed"
            >
              {applying ? "⏳ Application..." : "⚡ Appliquer sur Discord"}
            </button>
          </div>
          <div className="text-xs text-blue-700 mt-2">
            Cette action mettra en file d'attente l'application de la sanction (rôles, mute, etc.)
          </div>
        </div>
      ) : null}

      {isApplied ? (
        <div className="p-4 border-2 border-green-500 bg-green-50 rounded">
          <div className="text-sm font-semibold text-green-900">✅ Sanction appliquée sur Discord</div>
        </div>
      ) : null}

      {canRetry ? (
        <div className="flex gap-3">
          <button
            onClick={handleRetry}
            disabled={retrying}
            className="px-4 py-2 text-sm font-semibold rounded bg-amber-600 text-white hover:bg-amber-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            {retrying ? "Relance..." : "Relancer Discord"}
          </button>
        </div>
      ) : null}

      {canClear ? (
        <div className="flex gap-3">
          <button
            onClick={handleClear}
            disabled={clearing}
            className="px-4 py-2 text-sm font-semibold rounded bg-green-600 text-white hover:bg-green-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            {clearing ? "Retrait..." : "Retirer maintenant"}
          </button>
        </div>
      ) : null}

      <div className="p-4 border rounded">
        <div className="text-sm font-semibold">Audit</div>
        <ul className="mt-2 space-y-2 text-sm">
          {audit.length === 0 ? (
            <li className="text-gray-500">Aucun audit</li>
          ) : (
            audit.map((log) => (
              <li key={log.id} className="border-b pb-2">
                <div className="font-semibold">{log.action}</div>
                <div className="text-xs text-gray-500">
                  {new Date(log.createdAt).toLocaleString("fr-FR")}
                </div>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
