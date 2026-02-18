"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { getDiscordThreadUrl } from "@/lib/discord-config";
import { StaffPage } from "../ui/StaffPage";
import { StatCards } from "../ui/StatCards";
import { StaffTable } from "../ui/StaffTable";
import { Badge } from "../ui/Badge";

type Recruitment = {
  id: string;
  ticketKey: string;
  status: "OPEN" | "FINI";
  authorDiscordId: string;
  authorTag: string | null;
  steamId: string | null;
  rpName: string | null;
  threadId: string | null;
  createdAt: string;
  closedAt: string | null;
};

export function RecruitmentsListClient({
  recruitments,
}: {
  recruitments: Recruitment[];
}) {
  const [filter, setFilter] = useState<"ALL" | "OPEN" | "FINI">("ALL");
  const [sortBy, setSortBy] = useState<"createdAt" | "name">("createdAt");
  const [search, setSearch] = useState("");

  const sorted = useMemo(() => {
    const filtered = recruitments.filter((r) => {
      if (filter === "OPEN") return r.status === "OPEN";
      if (filter === "FINI") return r.status === "FINI";
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (sortBy === "createdAt") return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (sortBy === "name") return (a.rpName || "").localeCompare(b.rpName || "");
      return 0;
    });
  }, [recruitments, filter, sortBy]);

  const filtered = sorted.filter((r) => {
    if (!search) return true;
    const query = search.toLowerCase();
    return (
      r.ticketKey?.toLowerCase().includes(query) ||
      r.authorDiscordId?.toLowerCase().includes(query) ||
      r.rpName?.toLowerCase().includes(query) ||
      r.steamId?.toLowerCase().includes(query)
    );
  });

  function exportToCSV() {
    const csv = [
      ["ID", "Ticket", "Discord", "RP", "Steam", "Statut", "Créé"].join(","),
      ...filtered.map((r) =>
        [r.id, r.ticketKey || "", r.authorDiscordId || "", r.rpName || "", r.steamId || "", r.status, fmtDate(r.createdAt)].join(",")
      ),
    ].join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "recruitments.csv";
    a.click();
    URL.revokeObjectURL(url);
  }

  function fmtDate(iso: string) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("fr-FR", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  }

  function statusBadge(status: "OPEN" | "FINI") {
    if (status === "OPEN") {
      return { emoji: "⏳", label: "En attente", bg: "#eff6ff", color: "#0c4a6e", border: "#0284c7" };
    } else {
      return { emoji: "✓", label: "Clôturé", bg: "#ecfdf5", color: "#065f46", border: "#10b981" };
    }
  }

  const stats = {
    total: sorted.length,
    open: sorted.filter((r) => r.status === "OPEN").length,
    fini: sorted.filter((r) => r.status === "FINI").length,
  };

  return (
    <StaffPage title="Recrutements" subtitle="Gestion des candidatures Discord">
      <StatCards
        items={[
          { label: "⏳ En attente", value: stats.open, tone: "blue" },
          { label: "✓ Clôturés", value: stats.fini, tone: "green" },
          { label: "📊 Total", value: stats.total, tone: "gray" },
        ]}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-gray-700">
          Statut:
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as any)}
            className="border border-slate-800 rounded px-3 py-2 text-sm bg-slate-900/40 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
          >
            <option value="ALL">Tous</option>
            <option value="OPEN">⏳ En attente</option>
            <option value="FINI">✓ Clôturés</option>
          </select>
        </label>

        <input
          type="text"
          placeholder="Ticket, Discord, RP, Steam..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 min-w-0 border border-slate-800 rounded px-3 py-2 text-sm bg-slate-900/40 text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={exportToCSV}
          disabled={filtered.length === 0}
          className="px-3 py-2 text-sm font-semibold rounded bg-emerald-600 text-white hover:bg-emerald-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed"
        >
          📥 CSV
        </button>
        {filtered.length > 0 ? (
          <span className="text-sm text-gray-600 font-medium whitespace-nowrap">
            {filtered.length}/{recruitments.length}
          </span>
        ) : null}
      </div>

      <StaffTable
        headers={["Statut", "Ticket", "RP Name", "Auteur", "Steam ID", "Créé", "Clôturé", "Lien", "Action"]}
        stickyHeader
      >
        {filtered.map((r) => {
          const badge = statusBadge(r.status);
          const tone = r.status === "OPEN" ? "blue" : "green";
          return (
            <tr key={r.id} className="hover:bg-slate-900/30">
              <td className="px-4 py-3">
                <Badge tone={tone}>
                  {badge.emoji} {badge.label}
                </Badge>
              </td>
              <td className="px-4 py-3 font-mono text-sm font-semibold text-foreground">{r.ticketKey}</td>
              <td className="px-4 py-3 text-sm">
                {r.rpName ? (
                  r.authorDiscordId ? (
                    <Link
                      href={`/staff/members/by-discord/${r.authorDiscordId}`}
                      className="font-medium text-blue-600 hover:underline"
                    >
                      {r.rpName}
                    </Link>
                  ) : (
                    <span className="font-medium">{r.rpName}</span>
                  )
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600">
                {r.authorDiscordId ? (
                  <Link href={`/staff/members/by-discord/${r.authorDiscordId}`} className="text-blue-600 hover:underline">
                    {r.authorTag ?? r.authorDiscordId}
                  </Link>
                ) : (
                  r.authorTag ?? r.authorDiscordId
                )}
              </td>
              <td className="px-4 py-3 font-mono text-xs text-gray-600">
                {r.steamId ? r.steamId : <span className="text-gray-400">—</span>}
              </td>
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{fmtDate(r.createdAt)}</td>
              <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">
                {r.closedAt ? fmtDate(r.closedAt) : <span className="text-gray-400">—</span>}
              </td>
              <td className="px-4 py-3">
                {r.threadId ? (
                  <a
                    href={getDiscordThreadUrl(r.threadId)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800 hover:underline text-sm font-medium"
                  >
                    💬 Discord
                  </a>
                ) : (
                  <span className="text-gray-400">—</span>
                )}
              </td>
              <td className="px-4 py-3">
                {r.status === "OPEN" ? (
                  <Link
                    href={`/staff/recruitments/${r.ticketKey}`}
                    className="text-blue-600 hover:text-blue-800 hover:underline text-sm font-medium"
                  >
                    📖 Ouvrir
                  </Link>
                ) : (
                  <Link
                    href={`/staff/recruitments/${r.ticketKey}`}
                    className="text-gray-500 hover:text-gray-700 text-sm font-medium"
                  >
                    Voir
                  </Link>
                )}
              </td>
            </tr>
          );
        })}
        {filtered.length === 0 && (
          <tr>
            <td colSpan={9} className="px-4 py-8 text-center text-gray-500 italic">
              {search ? "Aucun résultat pour cette recherche" : filter === "FINI" ? "Aucun recrutement clôturé" : "Aucun recrutement en attente"}
            </td>
          </tr>
        )}
      </StaffTable>
    </StaffPage>
  );
}
