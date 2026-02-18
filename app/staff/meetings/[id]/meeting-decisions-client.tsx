"use client";

import { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";

type Grade = "WL1" | "WL2" | "WL3" | "WL4" | "OFFICER" | "CAPTAIN" | "CHEF" | string;
type DecisionAction = "PROMOTE" | "DEMOTE" | "KEEP" | "EXCLUDE";

type Member = {
  discordId: string;
  rpName: string | null;
  grade: string | null;
  gradeLevel: number;
};

type Decision = {
  id: string;
  memberDiscordId: string;
  oldGrade: string | null;
  newGrade: string | null;
  action: DecisionAction;
  reason: string | null;
  appliedAt: string | null;
  member: Member | null;
};

type MeetingStatus = "DRAFT" | "FINAL";

const GRADES: Grade[] = ["WL1", "WL2", "WL3", "WL4", "OFFICER", "CAPTAIN", "CHEF"];

const ACTION_OPTIONS: Array<{ value: DecisionAction; label: string; color: string }> = [
  { value: "KEEP", label: "Maintenir", color: "#6b7280" },
  { value: "PROMOTE", label: "Promouvoir", color: "#16a34a" },
  { value: "DEMOTE", label: "Rétrograder", color: "#dc2626" },
  { value: "EXCLUDE", label: "Exclure", color: "#7c2d12" },
];

export function MeetingDecisionsClient({
  meetingId,
  meetingStatus,
  onStatusChange,
}: {
  meetingId: string;
  meetingStatus: MeetingStatus;
  onStatusChange?: () => void;
}) {
  const router = useRouter();
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [filterAction, setFilterAction] = useState<DecisionAction | "ALL">("ALL");

  // Local edits
  const [localDecisions, setLocalDecisions] = useState<Map<string, Partial<Decision>>>(new Map());

  const isFinal = meetingStatus === "FINAL";

  // Load decisions and members
  useEffect(() => {
    async function load() {
      setLoading(true);
      try {
        const [decisionsRes, membersRes] = await Promise.all([
          fetch(`/api/staff/meetings/${meetingId}/decisions`),
          fetch("/api/staff/members"),
        ]);

        const decisionsData = await decisionsRes.json();
        const membersData = await membersRes.json();

        if (decisionsData.ok) {
          setDecisions(decisionsData.decisions ?? []);
        }
        if (membersData.ok) {
          setMembers(membersData.members ?? []);
        }
      } catch (err: any) {
        setError(err.message ?? "Failed to load");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [meetingId]);

  // Merged decisions with members
  const mergedDecisions = useMemo(() => {
    const decisionMap = new Map(decisions.map((d) => [d.memberDiscordId, d]));

    return members
      .filter((m) => m.discordId)
      .map((member) => {
        const existing = decisionMap.get(member.discordId);
        const local = localDecisions.get(member.discordId);

        return {
          memberDiscordId: member.discordId,
          rpName: member.rpName,
          currentGrade: member.grade,
          gradeLevel: member.gradeLevel,
          id: existing?.id ?? null,
          oldGrade: local?.oldGrade ?? existing?.oldGrade ?? member.grade,
          newGrade: local?.newGrade ?? existing?.newGrade ?? member.grade,
          action: (local?.action ?? existing?.action ?? "KEEP") as DecisionAction,
          reason: local?.reason ?? existing?.reason ?? null,
          appliedAt: existing?.appliedAt ?? null,
          hasDecision: !!existing,
          isModified: !!local,
        };
      });
  }, [members, decisions, localDecisions]);

  // Filtered decisions
  const filteredDecisions = useMemo(() => {
    let result = mergedDecisions;

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(
        (d) =>
          d.rpName?.toLowerCase().includes(q) ||
          d.memberDiscordId.includes(q) ||
          d.currentGrade?.toLowerCase().includes(q)
      );
    }

    if (filterAction !== "ALL") {
      result = result.filter((d) => d.action === filterAction);
    }

    return result;
  }, [mergedDecisions, searchQuery, filterAction]);

  // Stats
  const stats = useMemo(() => {
    const counts = { PROMOTE: 0, DEMOTE: 0, KEEP: 0, EXCLUDE: 0 };
    mergedDecisions.forEach((d) => {
      counts[d.action]++;
    });
    return counts;
  }, [mergedDecisions]);

  const handleDecisionChange = (
    discordId: string,
    field: "action" | "newGrade" | "reason",
    value: string
  ) => {
    if (isFinal) return;

    setLocalDecisions((prev) => {
      const next = new Map(prev);
      const current = next.get(discordId) ?? {};

      if (field === "action") {
        const action = value as DecisionAction;
        const member = members.find((m) => m.discordId === discordId);
        current.action = action;

        // Auto-set newGrade based on action
        if (action === "KEEP" || action === "EXCLUDE") {
          current.newGrade = member?.grade ?? null;
        }
      } else if (field === "newGrade") {
        current.newGrade = value;
        // Auto-detect action
        const member = members.find((m) => m.discordId === discordId);
        const currentLevel = member?.gradeLevel ?? 0;
        const newLevel = GRADES.indexOf(value) + 1;
        if (newLevel > currentLevel) {
          current.action = "PROMOTE";
        } else if (newLevel < currentLevel) {
          current.action = "DEMOTE";
        } else {
          current.action = "KEEP";
        }
      } else {
        (current as any)[field] = value;
      }

      next.set(discordId, current);
      return next;
    });
  };

  const handleSaveDecisions = async () => {
    if (isFinal) return;

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      // Only save modified decisions
      const toSave = mergedDecisions
        .filter((d) => d.isModified || d.action !== "KEEP")
        .map((d) => ({
          memberDiscordId: d.memberDiscordId,
          oldGrade: d.currentGrade,
          newGrade: d.newGrade,
          action: d.action,
          reason: d.reason,
        }));

      if (toSave.length === 0) {
        setSuccess("Aucune décision à enregistrer");
        return;
      }

      const res = await fetch(`/api/staff/meetings/${meetingId}/decisions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decisions: toSave }),
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error ?? "Erreur lors de l'enregistrement");
        return;
      }

      setSuccess(`${data.created} créées, ${data.updated} mises à jour`);
      setLocalDecisions(new Map());

      // Reload decisions
      const refreshRes = await fetch(`/api/staff/meetings/${meetingId}/decisions`);
      const refreshData = await refreshRes.json();
      if (refreshData.ok) {
        setDecisions(refreshData.decisions ?? []);
      }
    } catch (err: any) {
      setError(err.message ?? "Erreur réseau");
    } finally {
      setSaving(false);
    }
  };

  const handleFinalize = async () => {
    if (isFinal) return;

    const confirm = window.confirm(
      "Êtes-vous sûr de vouloir finaliser cette réunion ?\n\n" +
        "Cette action va :\n" +
        `- Appliquer ${stats.PROMOTE} promotion(s)\n` +
        `- Appliquer ${stats.DEMOTE} rétrogradation(s)\n` +
        `- Exclure ${stats.EXCLUDE} membre(s)\n\n` +
        "Cette action est irréversible."
    );

    if (!confirm) return;

    setFinalizing(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/staff/meetings/${meetingId}/finalize`, {
        method: "POST",
      });

      const data = await res.json();

      if (!data.ok) {
        setError(data.error ?? "Erreur lors de la finalisation");
        return;
      }

      setSuccess(data.summary ?? "Réunion finalisée");
      onStatusChange?.();
      router.refresh();
    } catch (err: any) {
      setError(err.message ?? "Erreur réseau");
    } finally {
      setFinalizing(false);
    }
  };

  if (loading) {
    return <div className="p-4">Chargement des décisions...</div>;
  }

  return (
    <div className="border border-slate-800 rounded-lg bg-slate-900/40 p-4 mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold">Décisions de grade</h2>
        {isFinal && (
          <span className="bg-green-100 text-green-800 px-3 py-1 rounded text-sm">
            Finalisé
          </span>
        )}
      </div>

      {error && (
        <div className="bg-red-100 text-red-800 px-4 py-2 rounded mb-4">{error}</div>
      )}
      {success && (
        <div className="bg-green-100 text-green-800 px-4 py-2 rounded mb-4">{success}</div>
      )}

      {/* Stats */}
      <div className="flex flex-wrap gap-4 mb-4">
        <div className="bg-slate-900/20 px-3 py-2 rounded">
          Total: <strong>{mergedDecisions.length}</strong>
        </div>
        <div className="bg-green-100 text-green-800 px-3 py-2 rounded">
          Promotions: <strong>{stats.PROMOTE}</strong>
        </div>
        <div className="bg-red-100 text-red-800 px-3 py-2 rounded">
          Rétrogradations: <strong>{stats.DEMOTE}</strong>
        </div>
        <div className="bg-orange-100 text-orange-800 px-3 py-2 rounded">
          Exclusions: <strong>{stats.EXCLUDE}</strong>
        </div>
        <div className="bg-slate-900/20 px-3 py-2 rounded">
          Maintiens: <strong>{stats.KEEP}</strong>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-4">
        <input
          type="text"
          placeholder="Rechercher..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="border px-3 py-1 rounded flex-grow max-w-xs"
        />
        <select
          value={filterAction}
          onChange={(e) => setFilterAction(e.target.value as any)}
          className="border px-3 py-1 rounded"
        >
          <option value="ALL">Toutes les actions</option>
          {ACTION_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      </div>

      {/* Decisions table */}
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200 text-sm">
          <thead className="bg-slate-900/20">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Membre</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Grade actuel</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Action</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Nouveau grade</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Raison</th>
              {isFinal && (
                <th className="px-3 py-2 text-left text-xs font-medium text-muted-foreground uppercase">Appliqué</th>
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {filteredDecisions.map((d) => (
              <tr
                key={d.memberDiscordId}
                className={
                  d.action === "PROMOTE"
                    ? "bg-green-50"
                    : d.action === "DEMOTE"
                    ? "bg-red-50"
                    : d.action === "EXCLUDE"
                    ? "bg-orange-50"
                    : ""
                }
              >
                <td className="px-3 py-2">
                  <div>{d.rpName ?? "—"}</div>
                  <div className="text-xs text-gray-500 font-mono">{d.memberDiscordId}</div>
                </td>
                <td className="px-3 py-2">{d.currentGrade ?? "—"}</td>
                <td className="px-3 py-2">
                  {isFinal ? (
                    <span
                      style={{
                        color: ACTION_OPTIONS.find((o) => o.value === d.action)?.color,
                      }}
                    >
                      {ACTION_OPTIONS.find((o) => o.value === d.action)?.label}
                    </span>
                  ) : (
                    <select
                      value={d.action}
                      onChange={(e) =>
                        handleDecisionChange(d.memberDiscordId, "action", e.target.value)
                      }
                      className="border px-2 py-1 rounded text-sm"
                    >
                      {ACTION_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isFinal ? (
                    d.newGrade ?? "—"
                  ) : d.action === "KEEP" || d.action === "EXCLUDE" ? (
                    <span className="text-gray-400">{d.currentGrade}</span>
                  ) : (
                    <select
                      value={d.newGrade ?? ""}
                      onChange={(e) =>
                        handleDecisionChange(d.memberDiscordId, "newGrade", e.target.value)
                      }
                      className="border px-2 py-1 rounded text-sm"
                    >
                      <option value="">—</option>
                      {GRADES.map((g) => (
                        <option key={g} value={g}>
                          {g}
                        </option>
                      ))}
                    </select>
                  )}
                </td>
                <td className="px-3 py-2">
                  {isFinal ? (
                    d.reason ?? "—"
                  ) : (
                    <input
                      type="text"
                      value={d.reason ?? ""}
                      onChange={(e) =>
                        handleDecisionChange(d.memberDiscordId, "reason", e.target.value)
                      }
                      placeholder="Raison..."
                      className="border px-2 py-1 rounded text-sm w-full"
                    />
                  )}
                </td>
                {isFinal && (
                  <td className="px-3 py-2 text-xs text-gray-500">
                    {d.appliedAt ? "✓" : "—"}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Actions */}
      {!isFinal && (
        <div className="flex gap-4 mt-6">
          <button
            onClick={handleSaveDecisions}
            disabled={saving || localDecisions.size === 0}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Enregistrement..." : "Enregistrer les décisions"}
          </button>
          <button
            onClick={handleFinalize}
            disabled={finalizing || stats.PROMOTE + stats.DEMOTE + stats.EXCLUDE === 0}
            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50"
          >
            {finalizing ? "Finalisation..." : "Finaliser la réunion"}
          </button>
        </div>
      )}
    </div>
  );
}
