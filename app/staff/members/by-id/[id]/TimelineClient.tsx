"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
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
    SANCTION: { emoji: "⚖️", color: "border-red-500/30 bg-red-500/12" },
    COMPLAINT: { emoji: "📝", color: "border-amber-500/30 bg-amber-500/12" },
    RECRUITMENT: { emoji: "👥", color: "border-sky-500/30 bg-sky-500/12" },
    STAFF_ACTION: { emoji: "🔧", color: "border-purple-500/30 bg-purple-500/12" },
  };
  return icons[type] || { emoji: "📌", color: "border-white/10 bg-white/[0.06]" };
}

function getStatusBadge(status: string) {
  const badges: Record<string, { cls: string; label: string }> = {
    PENDING: { cls: "border-slate-500/30 bg-slate-500/12 text-slate-200", label: "⏳ En attente" },
    ACTIVE: { cls: "border-rose-500/30 bg-rose-500/12 text-rose-200", label: "⚠️ Active" },
    EXPIRED: { cls: "border-orange-500/30 bg-orange-500/12 text-orange-200", label: "⏱️ Expirée" },
    CLOSED: { cls: "border-slate-500/30 bg-slate-500/12 text-slate-300", label: "✅ Clôturée" },
    DONE: { cls: "border-emerald-500/30 bg-emerald-500/12 text-emerald-200", label: "✅ Complétée" },
    OPEN: { cls: "border-sky-500/30 bg-sky-500/12 text-sky-200", label: "🔵 Ouvert" },
    TREATED: { cls: "border-emerald-500/30 bg-emerald-500/12 text-emerald-200", label: "✅ Traité" },
    UNTREATED: { cls: "border-rose-500/30 bg-rose-500/12 text-rose-200", label: "❌ Non traité" },
  };
  const badge = badges[status] || { cls: "border-white/10 bg-white/[0.06] text-slate-300", label: status };
  return (
    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${badge.cls}`}>
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
      const res = await fetch(`/api/staff/members/${memberId}/timeline`, { cache: "no-store" });
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

  const refreshButton = (
    <button
      onClick={handleRefresh}
      disabled={loading}
      className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[0.08] disabled:opacity-50"
    >
      <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
      Rafraîchir
    </button>
  );

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 animate-pulse rounded-2xl border border-white/8 bg-white/[0.04]" />
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
        Erreur : {error}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-white/8 bg-white/[0.02] py-14 text-center">
        <p className="text-lg font-semibold text-slate-300">Aucun événement</p>
        <p className="mt-1.5 text-sm text-slate-500">
          Les sanctions, plaintes et actions apparaîtront ici.
        </p>
        <div className="mt-4">{refreshButton}</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between rounded-2xl border border-white/8 bg-white/[0.03] px-4 py-3">
        <span className="text-sm font-semibold text-slate-300">
          {items.length} événement{items.length > 1 ? "s" : ""}
        </span>
        {refreshButton}
      </div>

      {items.map((item) => {
        const icon = getTypeIcon(item.type);
        return (
          <div
            key={item.id}
            className="flex gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-white/15 hover:bg-white/[0.05]"
          >
            <div
              className={`flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl border text-xl ${icon.color}`}
            >
              {icon.emoji}
            </div>
            <div className="min-w-0 flex-grow">
              <div className="mb-1 flex items-start justify-between gap-2">
                <h3 className="font-semibold text-slate-100">{item.title}</h3>
                {getStatusBadge(item.status)}
              </div>
              <p className="mb-2 text-sm leading-6 text-slate-300/90">{item.description}</p>
              <div className="text-xs text-slate-500">
                <span>Créé le {formatBanklogTime(item.createdAt)}</span>
                {item.effectiveAt && (
                  <span className="ml-4 text-orange-300/90">
                    Effectif : {formatBanklogTime(item.effectiveAt)}
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
