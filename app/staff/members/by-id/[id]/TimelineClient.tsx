"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { formatBanklogTime } from "@/lib/banklog-time";

type TimelineItem = {
  id: string;
  type: "SANCTION" | "COMPLAINT" | "RECRUITMENT" | "STAFF_ACTION";
  title: string;
  description: string;
  status: string;
  createdAt: string;
  effectiveAt?: string | null;
};

function getTypeIcon(type: string) {
  const icons: Record<string, { emoji: string; color: string }> = {
    SANCTION: { emoji: "⚖️", color: "bg-red-100 dark:bg-red-900/20" },
    COMPLAINT: { emoji: "📝", color: "bg-amber-100 dark:bg-amber-900/20" },
    RECRUITMENT: { emoji: "👥", color: "bg-blue-100 dark:bg-blue-900/20" },
    STAFF_ACTION: { emoji: "🔧", color: "bg-purple-100 dark:bg-purple-900/20" },
  };
  return icons[type] || { emoji: "📌", color: "bg-gray-100 dark:bg-gray-800" };
}

function getStatusBadge(status: string) {
  const badges: Record<string, { bg: string; text: string; label: string }> = {
    PENDING: { bg: "bg-gray-100", text: "text-gray-800", label: "⏳ En attente" },
    ACTIVE: { bg: "bg-red-100", text: "text-red-800", label: "⚠️ Active" },
    EXPIRED: { bg: "bg-orange-100", text: "text-orange-800", label: "⏱️ Expirée" },
    CLOSED: { bg: "bg-gray-200", text: "text-gray-800", label: "✅ Clôturée" },
    DONE: { bg: "bg-green-100", text: "text-green-800", label: "✅ Complétée" },
    OPEN: { bg: "bg-blue-100", text: "text-blue-800", label: "🔵 Ouvert" },
    TREATED: { bg: "bg-green-100", text: "text-green-800", label: "✅ Traité" },
    UNTREATED: { bg: "bg-red-100", text: "text-red-800", label: "❌ Non traité" },
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
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function loadTimeline() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/members/${memberId}/timeline`, {
        cache: "no-store",
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Erreur chargement timeline");
      }
      setItems(data.items || []);
    } catch (err: any) {
      setError(err.message || "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadTimeline();
  }, [memberId]);

  function handleRefresh() {
    loadTimeline();
    router.refresh();
  }

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded text-red-800 dark:text-red-200 text-sm">
        Erreur: {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-lg font-semibold text-gray-500 dark:text-gray-400">Aucun événement</p>
        <p className="text-sm text-gray-400 dark:text-gray-500 mt-2">
          Les sanctions, plaintes et actions apparaîtront ici
        </p>
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
      {/* Header with refresh button */}
      <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <span className="text-sm font-semibold text-gray-700 dark:text-gray-300">
          {items.length} événement{items.length > 1 ? "s" : ""}
        </span>
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
            className={`p-4 border border-gray-200 dark:border-gray-700 rounded-lg flex gap-4 ${icon.color}`}
          >
            <div className="text-2xl flex-shrink-0">{icon.emoji}</div>
            <div className="flex-grow min-w-0">
              <div className="flex items-start justify-between gap-2 mb-1">
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">{item.title}</h3>
                {getStatusBadge(item.status)}
              </div>
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-2">{item.description}</p>
              <div className="text-xs text-gray-600 dark:text-gray-400">
                <span>Créé: {formatBanklogTime(item.createdAt)}</span>
                {item.effectiveAt && (
                  <span className="ml-4 text-orange-600 dark:text-orange-400">
                    Effectif: {formatBanklogTime(item.effectiveAt)}
                  </span>
                )}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
