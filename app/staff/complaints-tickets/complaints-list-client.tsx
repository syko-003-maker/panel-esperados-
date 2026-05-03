"use client";

import { useState } from "react";
import Link from "next/link";
import { getDiscordThreadUrl } from "@/lib/discord-config";
import { StyledSelect } from "@/components/staff/ui/StyledSelect";

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

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-green-100 text-green-800",
  RESOLVED: "bg-blue-100 text-blue-800",
  REJECTED: "bg-orange-100 text-orange-800",
  CLOSED: "bg-gray-100 text-gray-800",
};

export function ComplaintsListClient({
  complaints,
}: {
  complaints: Complaint[];
}) {
  const [filter, setFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");

  const filtered = complaints.filter((c) => {
    if (filter === "OPEN" && c.status !== "OPEN") return false;
    if (filter === "CLOSED" && c.status === "OPEN") return false;
    if (search) {
      const s = search.toLowerCase();
      return (
        c.ticketKey.toLowerCase().includes(s) ||
        (c.authorDiscordId?.toLowerCase().includes(s) ?? false) ||
        (c.target?.toLowerCase().includes(s) ?? false)
      );
    }
    return true;
  });

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Plaintes (Tickets Discord)</h1>

      <div className="flex gap-4 mb-4 items-center">
        <StyledSelect
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="ALL">Tous</option>
          <option value="OPEN">OPEN</option>
          <option value="CLOSED">Fermés</option>
        </StyledSelect>

        <input
          type="text"
          placeholder="Rechercher..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border rounded px-3 py-2 flex-1 max-w-xs"
        />

        <span className="text-gray-500">{filtered.length} résultat(s)</span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full border-collapse border">
          <thead>
            <tr className="bg-gray-100">
              <th className="border px-3 py-2 text-left">Status</th>
              <th className="border px-3 py-2 text-left">TicketKey</th>
              <th className="border px-3 py-2 text-left">Auteur</th>
              <th className="border px-3 py-2 text-left">Cible</th>
              <th className="border px-3 py-2 text-left">Raison</th>
              <th className="border px-3 py-2 text-left">Créé</th>
              <th className="border px-3 py-2 text-left">Fermé</th>
              <th className="border px-3 py-2 text-left">Thread</th>
              <th className="border px-3 py-2 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="border px-3 py-2">
                  <span
                    className={`px-2 py-1 rounded text-xs font-medium ${
                      STATUS_COLORS[c.status] ?? STATUS_COLORS.CLOSED
                    }`}
                  >
                    {c.status}
                  </span>
                </td>
                <td className="border px-3 py-2 font-mono text-sm">
                  {c.ticketKey}
                </td>
                <td className="border px-3 py-2 text-sm">
                  {c.authorDiscordId ? (
                    <Link
                      href={`/staff/members/by-discord/${c.authorDiscordId}`}
                      prefetch={false}
                      className="text-blue-600 hover:underline"
                    >
                      {c.authorTag ?? c.authorDiscordId}
                    </Link>
                  ) : (
                    c.authorTag ?? c.authorDiscordId ?? "—"
                  )}
                </td>
                <td className="border px-3 py-2 text-sm">{c.target ?? "—"}</td>
                <td className="border px-3 py-2 text-sm truncate max-w-xs">
                  {c.reason ?? "—"}
                </td>
                <td className="border px-3 py-2 text-xs">
                  {new Date(c.createdAt).toLocaleString("fr-FR")}
                </td>
                <td className="border px-3 py-2 text-xs">
                  {c.closedAt
                    ? new Date(c.closedAt).toLocaleString("fr-FR")
                    : "—"}
                </td>
                <td className="border px-3 py-2">
                  {c.threadId ? (
                    <a
                      href={getDiscordThreadUrl(c.threadId)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-600 hover:underline text-sm"
                    >
                      Discord
                    </a>
                  ) : (
                    "—"
                  )}
                </td>
                <td className="border px-3 py-2">
                  <Link
                    href={`/staff/complaints-tickets/${c.ticketKey}`}
                    className="text-blue-600 hover:underline text-sm"
                  >
                    Ouvrir
                  </Link>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={9} className="border px-3 py-4 text-center text-gray-500">
                  Aucune plainte trouvée
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
