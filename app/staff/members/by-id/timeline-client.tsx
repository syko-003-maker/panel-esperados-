"use client";

import { getErrorMessage } from "@/lib/errors";

import { useEffect, useState } from "react";
import { formatBanklogTime } from "@/lib/banklogs-formatter";
import { useRouter } from "next/navigation";

type TimelineItem = {
  id: string;
  type: "SANCTION" | "COMPLAINT" | "RECRUITMENT" | "STAFF_ACTION" | "BANKLOG";
  title: string;
  description: string;
  status: string;
  discordStatus: string | null;
  createdAt: string;
  expiresAt: string | null;
  meta: Record<string, any>;
};

type TimelineDiagnostics = {
  countsByType: Record<string, number>;
  pivotUsed: Record<string, string | null>;
  member: { id: string; discordId: string | null; steamId: string | null };
};

function getTypeIcon(type: string) {
  const icons: Record<string, { emoji: string; color: string }> = {
    SANCTION: { emoji: "⚖️", color: "bg-red-100 dark:bg-red-900/20" },
    COMPLAINT: { emoji: "📝", color: "bg-amber-100 dark:bg-amber-900/20" },
    RECRUITMENT: { emoji: "👥", color: "bg-blue-100 dark:bg-blue-900/20" },
    STAFF_ACTION: { emoji: "🔧", color: "bg-purple-100 dark:bg-purple-900/20" },
    BANKLOG: { emoji: "💰", color: "bg-green-100 dark:bg-green-900/20" },
  };
  return icons[type] || { emoji: "📌", color: "bg-gray-100 dark:bg-gray-800" };
}

function getStatusBadge(status: string | null) {
  if (!status) return null;

  const badges: Record<string, { bg: string; text: string; label: string }> = {
    PENDING: { bg: "bg-gray-100", text: "text-gray-800", label: "⏳ En attente" },
    ACTIVE: { bg: "bg-red-100", text: "text-red-800", label: "⚠️ Active" },
    EXPIRED: { bg: "bg-orange-100", text: "text-orange-800", label: "⏱️ Expirée" },
    CLOSED: { bg: "bg-gray-200", text: "text-gray-800", label: "✓ Clôturée" },
    DONE: { bg: "bg-green-100", text: "text-green-800", label: "✅ Complété" },
    APPLIED: { bg: "bg-green-100", text: "text-green-800", label: "✅ Appliqué" },
    FAILED: { bg: "bg-red-100", text: "text-red-800", label: "❌ Échoué" },
    REFUSED: { bg: "bg-red-100", text: "text-red-800", label: "❌ Refusé" },
    OPEN: { bg: "bg-blue-100", text: "text-blue-800", label: "🔵 Ouvert" },
    TREATED: { bg: "bg-green-100", text: "text-green-800", label: "✅ Traité" },
    UNTREATED: { bg: "bg-red-100", text: "text-red-800", label: "❌ Non traité" },
    FINI: { bg: "bg-gray-200", text: "text-gray-800", label: "✓ Terminé" },
  };

  const badge = badges[status] || { bg: "bg-gray-100", text: "text-gray-800", label: status };
  return (
    <span className={`px-2 py-1 rounded text-xs font-semibold ${badge.bg} ${badge.text}`}>
      {badge.label}
    </span>
  );
}

export default function TimelineClient({ memberId }: { memberId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<TimelineItem[]>([]);
  const [diagnostics, setDiagnostics] = useState<TimelineDiagnostics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/members/${memberId}/timeline`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Failed to load timeline");
      }
      setItems(data.timeline || []);
      setDiagnostics(data.diagnostics || null);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Error loading timeline");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, [memberId]);

  function handleRefresh() {
    load();
    router.refresh();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-200 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
        Erreur: {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p className="text-lg font-semibold">Aucun événement dans la timeline</p>
        <p className="text-sm">Les sanctions, plaintes et recrutements liés s'afficheront ici.</p>
        <button
          onClick={handleRefresh}
          className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition"
        >
          🔄 Rafraîchir
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header with counts and refresh button */}
      <div className="flex items-center justify-between gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border">
        <div className="flex flex-wrap gap-4 text-sm">
          {diagnostics && Object.entries(diagnostics.countsByType).map(([type, count]) => {
            const icon = getTypeIcon(type);
            return (
              <div key={type} className="flex items-center gap-2">
                <span>{icon.emoji}</span>
                <span className="font-semibold">{type}:</span>
                <span className="text-gray-600 dark:text-gray-400">{count}</span>
              </div>
            );
          })}
          {!diagnostics && <span className="text-gray-500">Total: {items.length}</span>}
        </div>
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition disabled:opacity-50"
        >
          🔄 Rafraîchir
        </button>
      </div>

      {/* Timeline items */}
      {items.map((item) => {
        const icon = getTypeIcon(item.type);
        return (
          <div
            key={item.id}
            className={`p-4 border rounded-lg flex gap-4 transition ${icon.color}`}
          >
            {/* Icon */}
            <div className="text-2xl flex-shrink-0">{icon.emoji}</div>

            {/* Content */}
            <div className="flex-grow min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-semibold text-gray-900">{item.title}</h3>
                {getStatusBadge(item.status)}
              </div>
              <p className="text-sm text-gray-700 mb-2">{item.description}</p>
              <div className="flex items-center justify-between gap-2 text-xs text-gray-600">
                <span>{formatBanklogTime(item.createdAt)}</span>
                {item.expiresAt && (
                  <span className="text-orange-600">Expire: {formatBanklogTime(item.expiresAt)}</span>
                )}
              </div>

              {/* Discord Status if applicable */}
              {item.discordStatus && (
                <div className="mt-2 text-xs">
                  <span className="font-semibold">Discord:</span> {getStatusBadge(item.discordStatus)}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
