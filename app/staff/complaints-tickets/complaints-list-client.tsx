"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { AlertCircle, ExternalLink, Hash } from "lucide-react";
import { getDiscordThreadUrl } from "@/lib/discord-config";
import { StyledSelect } from "@/components/staff/ui/StyledSelect";
import { SectionCard, StatusBadge, EmptyState } from "@/components/staff/ui";
import { formatAppDate } from "@/lib/app-date-formatter";

type Complaint = {
  id: string;
  ticketKey: string;
  status: string;
  authorDiscordId: string | null;
  authorTag: string | null;
  target: string | null;
  reason: string | null;
  threadId: string | null;
  createdAt: string;
  closedAt: string | null;
};

const STATUS_TONE: Record<string, "success" | "info" | "warning" | "neutral" | "danger"> = {
  OPEN: "success",
  RESOLVED: "info",
  REJECTED: "warning",
  CLOSED: "neutral",
};

const STATUS_LABEL: Record<string, string> = {
  OPEN: "Ouverte",
  RESOLVED: "Traitée",
  REJECTED: "Refusée",
  CLOSED: "Fermée",
};

export function ComplaintsListClient({
  complaints,
}: {
  complaints: Complaint[];
}) {
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    return complaints.filter((c) => {
      if (filter === "OPEN" && c.status !== "OPEN") return false;
      if (filter === "CLOSED" && c.status === "OPEN") return false;
      if (search) {
        const s = search.toLowerCase();
        return (
          c.ticketKey.toLowerCase().includes(s) ||
          (c.authorDiscordId?.toLowerCase().includes(s) ?? false) ||
          (c.target?.toLowerCase().includes(s) ?? false) ||
          (c.reason?.toLowerCase().includes(s) ?? false)
        );
      }
      return true;
    });
  }, [complaints, filter, search]);

  return (
    <SectionCard
      title="Plaintes (tickets Discord)"
      description="Suivi des tickets ouverts depuis Discord, par statut et auteur."
      icon={AlertCircle}
      actions={
        <span className="rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs font-semibold text-slate-300 tabular-nums">
          {filtered.length} / {complaints.length}
        </span>
      }
    >
      {/* Filtres */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <StyledSelect
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="sm:w-48"
        >
          <option value="ALL">Tous les statuts</option>
          <option value="OPEN">Ouvertes</option>
          <option value="CLOSED">Fermées / Traitées</option>
        </StyledSelect>

        <input
          type="search"
          placeholder="Rechercher (ticketKey, auteur, cible, raison)…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full rounded-xl border border-white/10 bg-[rgba(10,4,6,0.85)] px-3 py-2 text-base sm:text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-amber-500/40 focus:outline-none"
        />
      </div>

      {/* Liste */}
      {filtered.length === 0 ? (
        <EmptyState
          title="Aucune plainte"
          description={search || filter !== "ALL" ? "Aucun ticket ne correspond aux filtres courants." : "Aucun ticket de plainte enregistré pour l'instant."}
        />
      ) : (
        <div className="overflow-x-auto -mx-4 sm:mx-0">
          <table className="min-w-full">
            <thead>
              <tr className="border-b border-white/8">
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Statut</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Ticket</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Auteur</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Cible</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Raison</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Créé</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Fermé</th>
                <th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Thread</th>
                <th className="px-3 py-2 text-right text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((c) => (
                <tr key={c.id} className="border-b border-white/4 transition-colors hover:bg-white/[0.025]">
                  <td className="px-3 py-3">
                    <StatusBadge tone={STATUS_TONE[c.status] ?? "neutral"}>
                      {STATUS_LABEL[c.status] ?? c.status}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-3">
                    <span className="inline-flex items-center gap-1.5 font-mono text-xs text-slate-300">
                      <Hash className="h-3 w-3 text-slate-500" />
                      {c.ticketKey}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-sm">
                    {c.authorDiscordId ? (
                      <Link
                        href={`/staff/members/by-discord/${c.authorDiscordId}`}
                        prefetch={false}
                        className="text-amber-300 transition-colors hover:underline"
                      >
                        {c.authorTag ?? c.authorDiscordId}
                      </Link>
                    ) : (
                      <span className="text-slate-500">{c.authorTag ?? "—"}</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-sm text-slate-300">{c.target ?? <span className="text-slate-500">—</span>}</td>
                  <td className="px-3 py-3 text-sm text-slate-300 max-w-xs truncate" title={c.reason ?? undefined}>
                    {c.reason ?? <span className="text-slate-500">—</span>}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-400">{formatAppDate(c.createdAt)}</td>
                  <td className="px-3 py-3 text-xs text-slate-400">
                    {c.closedAt ? formatAppDate(c.closedAt) : <span className="text-slate-600">—</span>}
                  </td>
                  <td className="px-3 py-3">
                    {c.threadId ? (
                      <a
                        href={getDiscordThreadUrl(c.threadId)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-amber-300 transition-colors hover:underline"
                      >
                        Discord <ExternalLink className="h-3 w-3" />
                      </a>
                    ) : (
                      <span className="text-slate-600">—</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right">
                    <Link
                      href={`/staff/complaints-tickets/${c.ticketKey}`}
                      className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1 text-xs font-medium text-slate-300 transition-colors hover:bg-white/[0.08] hover:text-slate-100"
                    >
                      Ouvrir
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
