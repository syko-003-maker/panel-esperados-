"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

type Member = {
  id: string;
  rpName: string | null;
  discordId: string;
  steamId: string | null;
};

type AuditLog = {
  id: string;
  action: string;
  entity: string;
  entityName: string | null;
  createdAt: string;
};

type Sanction = {
  id: string;
  type: string;
  status: string;
  reason: string | null;
  createdAt: string;
  createdBy: { name: string | null };
};

type GradeHistory = {
  id: string;
  oldGrade: string | null;
  newGrade: string | null;
  source: string;
  changedAt: string;
};

type BankLog = {
  id: string;
  steamId: string;
  type: number; // 1 = Retrait, 2 = Dépôt
  money: number;
  at: string; // ISO
  formattedAt: string; // Formatted as "DD/MM/YYYY HH:mm"
};

type HistoryData = {
  member: Member;
  logs: AuditLog[];
  sanctions: Sanction[];
  gradeHistory: GradeHistory[];
  banklogs: BankLog[];
};

function TypeBadge({ type }: { type: number }) {
  const label = type === 1 ? "Retrait" : type === 2 ? "Dépôt" : `Type ${type}`;
  const isDeposit = type === 2;

  return (
    <span
      className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-bold ${
        isDeposit 
          ? "border-green-500/20 bg-green-500/10 text-green-400" 
          : "border-red-500/20 bg-red-500/10 text-red-400"
      }`}
      title={label}
    >
      <span
        className={`w-2 h-2 rounded-full ${isDeposit ? "bg-green-500" : "bg-red-500"}`}
      />
      {label}
    </span>
  );
}

function fmtMoney(n: number) {
  return new Intl.NumberFormat("fr-BE").format(n);
}

export default function MemberHistoryPage() {
  const params = useParams();
  const discordId = params?.discordId as string;

  const [data, setData] = useState<HistoryData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"logs" | "sanctions" | "grades" | "banklogs">("logs");

  useEffect(() => {
    async function fetchHistory() {
      setLoading(true);
      try {
        const res = await fetch(`/api/staff/members/by-discord/${discordId}/history`);
        if (!res.ok) throw new Error("Failed to fetch");
        const json = await res.json();
        if (json.ok) {
          setData(json.data);
        } else {
          setError(json.error || "Unknown error");
        }
      } catch (err: any) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    }
    fetchHistory();
  }, [discordId]);

  if (loading) return <div className="p-6">Chargement...</div>;
  if (error) return <div className="p-6 text-red-500">Erreur: {error}</div>;
  if (!data) return <div className="p-6">Aucune donnée</div>;

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <Link href="/staff/members" className="text-blue-600 hover:underline">
          ← Retour aux membres
        </Link>
      </div>

      <div className="mb-6">
        <h1 className="text-2xl font-bold">{data.member.rpName || "Membre"}</h1>
        <p className="text-muted-foreground">Discord: {data.member.discordId}</p>
        {data.member.steamId && <p className="text-muted-foreground">Steam: {data.member.steamId}</p>}
      </div>

      <div className="mb-6 border-b border-slate-800">
        <nav className="flex gap-4">
          <button
            onClick={() => setTab("logs")}
            className={`px-4 py-2 border-b-2 ${
              tab === "logs" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            Audit ({data.logs.length})
          </button>
          <button
            onClick={() => setTab("sanctions")}
            className={`px-4 py-2 border-b-2 ${
              tab === "sanctions"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground"
            }`}
          >
            Sanctions ({data.sanctions.length})
          </button>
          <button
            onClick={() => setTab("grades")}
            className={`px-4 py-2 border-b-2 ${
              tab === "grades" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            Grades ({data.gradeHistory.length})
          </button>
          <button
            onClick={() => setTab("banklogs")}
            className={`px-4 py-2 border-b-2 ${
              tab === "banklogs" ? "border-primary text-primary" : "border-transparent text-muted-foreground"
            }`}
          >
            Banklogs ({data.banklogs.length})
          </button>
        </nav>
      </div>

      {tab === "logs" && (
        <div className="bg-slate-900/40 border border-slate-800 shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-900/20">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Action
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Entity
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.logs.map((log) => (
                <tr key={log.id} className="hover:bg-slate-900/30">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                    {new Date(log.createdAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-semibold rounded bg-primary/20 text-primary">
                      {log.action}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-900">
                    <div>{log.entity}</div>
                    {log.entityName && <div className="text-gray-500 text-xs">{log.entityName}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "sanctions" && (
        <div className="bg-slate-900/40 border border-slate-800 shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-900/20">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Type
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Statut
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Raison
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Par
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.sanctions.map((sanction) => (
                <tr key={sanction.id} className="hover:bg-slate-900/30">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                    {new Date(sanction.createdAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-semibold rounded bg-red-500/20 text-red-400 border border-red-500/30">
                      {sanction.type}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`px-2 py-1 text-xs font-semibold rounded ${
                        sanction.status === "ACTIVE"
                          ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                          : "bg-slate-500/20 text-slate-400 border border-slate-500/30"
                      }`}
                    >
                      {sanction.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-sm text-foreground">{sanction.reason || "-"}</td>
                  <td className="px-6 py-4 text-sm text-muted-foreground">
                    {sanction.createdBy.name || "Unknown"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "grades" && (
        <div className="bg-slate-900/40 border border-slate-800 shadow rounded-lg overflow-hidden">
          <table className="min-w-full divide-y divide-slate-800">
            <thead className="bg-slate-900/20">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Date
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Ancien Grade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Nouveau Grade
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                  Source
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {data.gradeHistory.map((grade) => (
                <tr key={grade.id} className="hover:bg-slate-900/30">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                    {new Date(grade.changedAt).toLocaleString("fr-FR")}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {grade.oldGrade || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                    {grade.newGrade || "-"}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                    {grade.source}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "banklogs" && (
        <div>
          {data.banklogs.length === 0 ? (
            <div className="bg-slate-900/40 border border-slate-800 rounded-lg p-6 text-center text-muted-foreground">
              Aucune transaction bancaire pour ce membre.
            </div>
          ) : (
            <div className="bg-slate-900/40 border border-slate-800 shadow rounded-lg overflow-hidden">
              <table className="min-w-full divide-y divide-slate-800">
                <thead className="bg-slate-900/20">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Date
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">
                      Type
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-muted-foreground uppercase">
                      Montant
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800">
                  {data.banklogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-900/30">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-foreground">
                        {log.formattedAt}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <TypeBadge type={log.type} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-right">
                        <span className={log.type === 2 ? "text-green-400" : "text-red-400"}>
                          {log.type === 1 ? "-" : "+"}{fmtMoney(log.money)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
