"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { canClearSanction, canDeleteSanction, getSanctionLabel } from "@/lib/sanctions";
import { getEffectiveSanctionStatus, getSanctionStatusLabel } from "@/lib/sanction-status-labels";

type SanctionDetailProps = {
  sanction: {
    id: string;
    member: { rpName: string | null; discordId: string | null } | null;
    discordId: string;
    type: string;
    status: string;
    reason: string | null;
    discordStatus: string;
    outboxStatus: string | null;
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
  const [deleting, setDeleting] = useState(false);
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
    const isReserviste = sanction.type === "RESERVISTE";
    const confirmMessage = isReserviste
      ? "Retirer l'état Réserviste ? Cette action retirera le rôle Réserviste sur Discord."
      : "Supprimer la sanction appliquée ? Cette action retirera son effet Discord.";
    if (!confirm(confirmMessage)) return;

    setClearing(true);
    setError(null);

    try {
      const res = await fetch(`/api/staff/sanctions/${sanction.id}/clear`, {
        method: "POST",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Suppression failed");
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setClearing(false);
    }
  }

  async function handleDelete() {
    if (!confirm("Supprimer cette sanction ? Cette action est irréversible.")) return;

    setDeleting(true);
    setError(null);

    try {
      const res = await fetch(`/api/staff/sanctions/${sanction.id}`, {
        method: "DELETE",
      });
      const json = await res.json().catch(() => ({}));

      if (!res.ok || !json?.ok) {
        if (json?.error === "SANCTION_DELETE_BLOCKED_ALREADY_APPLIED") {
          throw new Error(
            "Une sanction déjà appliquée ne peut pas être supprimée. Utilisez plutôt Supprimer ou Clôturer."
          );
        }

        if (json?.error === "SANCTION_DELETE_BLOCKED_OUTBOX_ALREADY_SENT_OR_RUNNING") {
          throw new Error(
            "Impossible de supprimer cette sanction car son traitement Discord est déjà en cours ou terminé. Utilisez plutôt Clôturer ou Supprimer."
          );
        }

        if (res.status === 409 && typeof json?.details?.message === "string") {
          throw new Error(json.details.message);
        }

        throw new Error(json?.error || "Delete failed");
      }

      router.push("/staff/sanctions");
      router.refresh();
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setDeleting(false);
    }
  }

  const effectiveStatus = getEffectiveSanctionStatus(
    sanction.status,
    sanction.clearedAt,
    sanction.clearedStatus
  );
  const canRetry = sanction.discordStatus === "FAILED";
  const canApply =
    sanction.discordStatus === "PENDING" &&
    effectiveStatus === "ACTIVE" &&
    !sanction.outboxStatus;
  const isApplied = sanction.discordStatus === "APPLIED";
  const clearActionLabel = sanction.type === "RESERVISTE" ? "Retirer réserviste" : "Supprimer";
  const canClear = canClearSanction(sanction);
  const canDelete = canDeleteSanction(sanction);

  return (
    <div className="p-6 max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Sanction</h1>
        <p className="text-sm text-gray-600">ID: {sanction.id}</p>
      </div>

      {error ? (
        <div className="flex items-start gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">{error}</div>
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
          <div className="font-semibold">{getSanctionLabel(sanction.type)}</div>
        </div>
        <div className="p-4 border rounded">
          <div className="text-xs text-gray-500">Statut</div>
          <div className="font-semibold">{getSanctionStatusLabel(effectiveStatus)}</div>
        </div>
        <div className="p-4 border rounded">
          <div className="text-xs text-gray-500">Discord</div>
          <div className="font-semibold">{getSanctionStatusLabel(sanction.discordStatus)}</div>
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
        {sanction.clearedAt || sanction.clearedStatus || sanction.clearedError ? (
          <div className="p-4 border rounded">
            <div className="text-xs text-gray-500">Levée le</div>
            <div className="font-semibold">
              {sanction.clearedAt ? new Date(sanction.clearedAt).toLocaleString("fr-FR") : "En cours"}
            </div>
            {sanction.clearedStatus ? (
              <div className="text-xs text-gray-600 mt-1">
                Statut: {getSanctionStatusLabel(`CLEAR_${sanction.clearedStatus}`)}
              </div>
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
            {clearing ? "Suppression..." : clearActionLabel}
          </button>
        </div>
      ) : null}

      {canDelete ? (
        <div className="flex gap-3">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="px-4 py-2 text-sm font-semibold rounded bg-red-600 text-white hover:bg-red-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed"
          >
            {deleting ? "Suppression..." : "Supprimer"}
          </button>
        </div>
      ) : null}

      {isApplied ? (
        <div className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Une sanction déjà appliquée ne peut pas être supprimée. Utilisez plutôt Supprimer ou Clôturer.
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
