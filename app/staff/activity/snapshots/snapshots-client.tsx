"use client";

import { useState, useMemo } from "react";
import Link from "next/link";

type Member = {
  discordId: string | null;
  rpName: string | null;
  grade: string | null;
};

type Snapshot = {
  id: string;
  memberDiscordId: string;
  periodStart: Date;
  periodEnd: Date;
  playtimeMinutes: number;
  meetingsTotal: number;
  meetingsAttended: number;
  meetingsMissed: number;
  justifiedAbsences: number;
  status: "OK" | "WARN" | "KO";
  flags: unknown;
  computedAt: Date;
  member: Member | null;
};

type Stats = {
  total: number;
  ok: number;
  warn: number;
  ko: number;
};

export function ActivitySnapshotsClient({
  initialSnapshots,
  stats,
}: {
  initialSnapshots: Snapshot[];
  stats: Stats;
}) {
  const [filterStatus, setFilterStatus] = useState<"ALL" | "OK" | "WARN" | "KO">("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredSnapshots = useMemo(() => {
    let result = initialSnapshots;

    if (filterStatus !== "ALL") {
      result = result.filter((s) => s.status === filterStatus);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (s) =>
          s.memberDiscordId.includes(q) ||
          s.member?.rpName?.toLowerCase().includes(q) ||
          s.member?.grade?.toLowerCase().includes(q)
      );
    }

    return result;
  }, [initialSnapshots, filterStatus, searchQuery]);

  function getStatusBadge(status: string) {
    switch (status) {
      case "OK":
        return (
          <span className="bg-green-100 text-green-800 px-2 py-1 rounded text-xs font-medium">
            OK
          </span>
        );
      case "WARN":
        return (
          <span className="bg-yellow-100 text-yellow-800 px-2 py-1 rounded text-xs font-medium">
            WARN
          </span>
        );
      case "KO":
        return (
          <span className="bg-red-100 text-red-800 px-2 py-1 rounded text-xs font-medium">
            KO
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/staff/activity" className="text-blue-600 hover:underline">
          ← Retour à l'activité
        </Link>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="bg-gray-100 px-4 py-3 rounded">
          <span className="text-gray-600">Total:</span>
          <span className="ml-2 font-bold">{stats.total}</span>
        </div>
        <div className="bg-green-100 px-4 py-3 rounded">
          <span className="text-green-700">OK:</span>
          <span className="ml-2 font-bold text-green-800">{stats.ok}</span>
        </div>
        <div className="bg-yellow-100 px-4 py-3 rounded">
          <span className="text-yellow-700">WARN:</span>
          <span className="ml-2 font-bold text-yellow-800">{stats.warn}</span>
        </div>
        <div className="bg-red-100 px-4 py-3 rounded">
          <span className="text-red-700">KO:</span>
          <span className="ml-2 font-bold text-red-800">{stats.ko}</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <div className="flex gap-2">
          <button
            onClick={() => setFilterStatus("ALL")}
            className={`px-3 py-1 rounded text-sm ${
              filterStatus === "ALL"
                ? "bg-gray-800 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Tous
          </button>
          <button
            onClick={() => setFilterStatus("OK")}
            className={`px-3 py-1 rounded text-sm ${
              filterStatus === "OK"
                ? "bg-green-600 text-white"
                : "bg-green-100 text-green-700 hover:bg-green-200"
            }`}
          >
            OK
          </button>
          <button
            onClick={() => setFilterStatus("WARN")}
            className={`px-3 py-1 rounded text-sm ${
              filterStatus === "WARN"
                ? "bg-yellow-600 text-white"
                : "bg-yellow-100 text-yellow-700 hover:bg-yellow-200"
            }`}
          >
            WARN
          </button>
          <button
            onClick={() => setFilterStatus("KO")}
            className={`px-3 py-1 rounded text-sm ${
              filterStatus === "KO"
                ? "bg-red-600 text-white"
                : "bg-red-100 text-red-700 hover:bg-red-200"
            }`}
          >
            KO
          </button>
        </div>

        <input
          type="text"
          placeholder="Rechercher..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="px-3 py-1 border rounded text-sm flex-grow max-w-xs"
        />
      </div>

      {/* Table */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Membre</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Grade</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Période</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Statut</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Playtime</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Réunions</th>
                <th className="px-4 py-3 text-right font-medium text-gray-500">Absences</th>
                <th className="px-4 py-3 text-left font-medium text-gray-500">Calculé</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {filteredSnapshots.map((snapshot) => (
                <tr
                  key={snapshot.id}
                  className={
                    snapshot.status === "KO"
                      ? "bg-red-50"
                      : snapshot.status === "WARN"
                      ? "bg-yellow-50"
                      : ""
                  }
                >
                  <td className="px-4 py-3">
                    <div>{snapshot.member?.rpName ?? "—"}</div>
                    <div className="text-xs text-gray-500 font-mono">
                      {snapshot.memberDiscordId}
                    </div>
                  </td>
                  <td className="px-4 py-3">{snapshot.member?.grade ?? "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {new Date(snapshot.periodStart).toLocaleDateString("fr-FR")} -{" "}
                    {new Date(snapshot.periodEnd).toLocaleDateString("fr-FR")}
                  </td>
                  <td className="px-4 py-3">{getStatusBadge(snapshot.status)}</td>
                  <td className="px-4 py-3 text-right">
                    {snapshot.playtimeMinutes} min
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-green-600">{snapshot.meetingsAttended}</span>
                    {" / "}
                    <span>{snapshot.meetingsTotal}</span>
                    {snapshot.meetingsMissed > 0 && (
                      <span className="text-red-600 ml-1">
                        (-{snapshot.meetingsMissed})
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {snapshot.justifiedAbsences > 0 ? (
                      <span className="text-blue-600">{snapshot.justifiedAbsences}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">
                    {new Date(snapshot.computedAt).toLocaleString("fr-FR")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {filteredSnapshots.length === 0 && (
        <p className="text-center text-gray-500 py-8">Aucun snapshot trouvé</p>
      )}
    </div>
  );
}
