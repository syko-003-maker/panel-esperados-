"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type ActivityRule = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isEnabled: boolean;
  priority: number;
  params: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export function ActivityRulesClient() {
  const [rules, setRules] = useState<ActivityRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editParams, setEditParams] = useState<string>("");

  useEffect(() => {
    loadRules();
  }, []);

  async function loadRules() {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/activity/rules");
      const data = await res.json();
      if (data.ok) {
        setRules(data.rules ?? []);
      } else {
        setError(data.error ?? "Failed to load rules");
      }
    } catch (err: any) {
      setError(err.message ?? "Network error");
    } finally {
      setLoading(false);
    }
  }

  async function toggleRule(id: string, isEnabled: boolean) {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch(`/api/admin/activity/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isEnabled }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess(`Règle ${isEnabled ? "activée" : "désactivée"}`);
        await loadRules();
      } else {
        setError(data.error ?? "Failed to update rule");
      }
    } catch (err: any) {
      setError(err.message ?? "Network error");
    } finally {
      setSaving(false);
    }
  }

  async function updateParams(id: string) {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const params = JSON.parse(editParams);
      const res = await fetch(`/api/admin/activity/rules/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ params }),
      });
      const data = await res.json();
      if (data.ok) {
        setSuccess("Paramètres mis à jour");
        setEditingId(null);
        await loadRules();
      } else {
        setError(data.error ?? "Failed to update rule");
      }
    } catch (err: any) {
      setError(err.message ?? "Invalid JSON");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(rule: ActivityRule) {
    setEditingId(rule.id);
    setEditParams(JSON.stringify(rule.params, null, 2));
  }

  if (loading) {
    return <div>Chargement...</div>;
  }

  return (
    <div>
      <div className="mb-4">
        <Link href="/staff/activity" className="text-blue-600 hover:underline">
          ← Retour à l'activité
        </Link>
      </div>

      {error && (
        <div className="bg-red-100 text-red-800 px-4 py-2 rounded mb-4">{error}</div>
      )}
      {success && (
        <div className="bg-green-100 text-green-800 px-4 py-2 rounded mb-4">{success}</div>
      )}

      <div className="bg-slate-900/40 border border-slate-800 rounded-lg overflow-hidden">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Code</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Nom</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Description</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Priorité</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Statut</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Paramètres</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-gray-500">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {rules.map((rule) => (
              <tr key={rule.id}>
                <td className="px-4 py-3 font-mono text-sm">{rule.code}</td>
                <td className="px-4 py-3 text-sm font-medium">{rule.name}</td>
                <td className="px-4 py-3 text-sm text-gray-500 max-w-xs truncate">
                  {rule.description ?? "—"}
                </td>
                <td className="px-4 py-3 text-sm">{rule.priority}</td>
                <td className="px-4 py-3">
                  <span
                    className={`inline-block px-2 py-1 rounded text-xs font-medium ${
                      rule.isEnabled
                        ? "bg-green-100 text-green-800"
                        : "bg-gray-100 text-gray-600"
                    }`}
                  >
                    {rule.isEnabled ? "Activé" : "Désactivé"}
                  </span>
                </td>
                <td className="px-4 py-3 text-sm">
                  {editingId === rule.id ? (
                    <div className="space-y-2">
                      <textarea
                        value={editParams}
                        onChange={(e) => setEditParams(e.target.value)}
                        className="w-full border rounded p-2 font-mono text-xs"
                        rows={4}
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={() => updateParams(rule.id)}
                          disabled={saving}
                          className="bg-green-600 text-white px-2 py-1 rounded text-xs"
                        >
                          Sauver
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="bg-gray-300 text-gray-800 px-2 py-1 rounded text-xs"
                        >
                          Annuler
                        </button>
                      </div>
                    </div>
                  ) : (
                    <pre className="text-xs bg-gray-50 p-2 rounded overflow-x-auto max-w-xs">
                      {JSON.stringify(rule.params, null, 2)}
                    </pre>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex gap-2">
                    <button
                      onClick={() => toggleRule(rule.id, !rule.isEnabled)}
                      disabled={saving}
                      className={`px-2 py-1 rounded text-xs ${
                        rule.isEnabled
                          ? "bg-gray-200 text-gray-700"
                          : "bg-green-600 text-white"
                      }`}
                    >
                      {rule.isEnabled ? "Désactiver" : "Activer"}
                    </button>
                    {editingId !== rule.id && (
                      <button
                        onClick={() => startEdit(rule)}
                        className="bg-blue-100 text-blue-700 px-2 py-1 rounded text-xs"
                      >
                        Éditer
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-6 p-4 bg-gray-50 rounded-lg">
        <h3 className="font-medium mb-2">Légende des paramètres</h3>
        <ul className="text-sm text-gray-600 space-y-1">
          <li>
            <code>inactivityDays</code>: Nombre de jours sans activité pour déclencher
          </li>
          <li>
            <code>missedMeetingsThreshold</code>: Nombre de réunions manquées pour
            déclencher
          </li>
          <li>
            <code>minPlaytimeMinutes</code>: Temps de jeu minimum requis sur la période
          </li>
          <li>
            <code>sanctionType</code>: Type de sanction (WARNING, KICK, PERMA_BAN)
          </li>
        </ul>
      </div>
    </div>
  );
}
