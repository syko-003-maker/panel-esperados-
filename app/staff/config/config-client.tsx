"use client";

import { getErrorMessage } from "@/lib/errors";

import { useState, useEffect, useCallback } from "react";

// ─────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────

type ConfigData = {
  familyId: string;
  configs: Record<string, any>;
  featureFlags: Record<string, boolean>;
  defaults: {
    featureFlags: Record<string, boolean>;
    configs: Record<string, any>;
  };
  cache: {
    size: number;
    keys: string[];
  };
};

// ─────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────

export function ConfigClient() {
  const [data, setData] = useState<ConfigData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/admin/config");
      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error ?? "Failed to fetch configs");
      }

      setData(json);
    } catch (err: unknown) {
      setError(getErrorMessage(err) || "Network error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const updateConfig = async (key: string, value: any) => {
    setSaving(key);

    try {
      const res = await fetch("/api/admin/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key, value }),
      });

      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error ?? "Failed to save");
      }

      await fetchData();
      setEditingKey(null);
    } catch (err: unknown) {
      alert(`Error: ${getErrorMessage(err)}`);
    } finally {
      setSaving(null);
    }
  };

  const toggleFlag = async (key: string, currentValue: boolean) => {
    await updateConfig(key, !currentValue);
  };

  const startEditing = (key: string, value: any) => {
    setEditingKey(key);
    setEditValue(typeof value === "object" ? JSON.stringify(value, null, 2) : String(value));
  };

  const saveEdit = async () => {
    if (!editingKey) return;

    let parsedValue: any;
    try {
      parsedValue = JSON.parse(editValue);
    } catch {
      // Try as string/number
      if (editValue === "true") parsedValue = true;
      else if (editValue === "false") parsedValue = false;
      else if (!isNaN(Number(editValue))) parsedValue = Number(editValue);
      else parsedValue = editValue;
    }

    await updateConfig(editingKey, parsedValue);
  };

  const initializeFlags = async () => {
    setSaving("initialize");

    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "initialize" }),
      });

      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error ?? "Failed to initialize");
      }

      await fetchData();
    } catch (err: unknown) {
      alert(`Error: ${getErrorMessage(err)}`);
    } finally {
      setSaving(null);
    }
  };

  const clearCache = async () => {
    try {
      const res = await fetch("/api/admin/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "clear-cache" }),
      });

      const json = await res.json();

      if (!json.ok) {
        throw new Error(json.error ?? "Failed to clear cache");
      }

      await fetchData();
    } catch (err: unknown) {
      alert(`Error: ${getErrorMessage(err)}`);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-slate-500"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-red-600 mb-4">{error}</p>
        <button
          onClick={fetchData}
          className="px-4 py-2 bg-red-100 hover:bg-red-200 text-red-700 rounded-lg text-sm"
        >
          Réessayer
        </button>
      </div>
    );
  }

  if (!data) return null;

  const featureFlagKeys = Object.keys(data.defaults.featureFlags);
  const configKeys = Object.keys(data.defaults.configs);

  return (
    <div className="space-y-8">
      {/* Actions */}
      <div className="flex gap-4">
        <button
          onClick={initializeFlags}
          disabled={saving === "initialize"}
          className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
        >
          {saving === "initialize" ? "..." : "Initialiser Flags"}
        </button>
        <button
          onClick={clearCache}
          className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
        >
          Vider le cache
        </button>
        <span className="text-sm text-gray-500 self-center">
          Cache: {data.cache.size} entrées
        </span>
      </div>

      {/* Feature Flags */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Feature Flags</h2>
        <p className="text-sm text-gray-500 mb-4">
          Activer/désactiver les fonctionnalités sans redéployer
        </p>

        <div className="grid gap-3">
          {featureFlagKeys.map((key) => {
            const value = data.featureFlags[key as keyof typeof data.featureFlags];
            const isDefault = data.configs[key] === undefined;

            return (
              <div
                key={key}
                className="flex items-center justify-between p-3 bg-gray-50 rounded"
              >
                <div>
                  <span className="font-mono text-sm">{key}</span>
                  {isDefault && (
                    <span className="ml-2 text-xs text-gray-400">(défaut)</span>
                  )}
                </div>
                <button
                  onClick={() => toggleFlag(key, value)}
                  disabled={saving === key}
                  className={`px-4 py-1 rounded text-sm font-medium transition-colors ${
                    value
                      ? "bg-green-500 text-white hover:bg-green-600"
                      : "bg-red-500 text-white hover:bg-red-600"
                  } disabled:opacity-50`}
                >
                  {saving === key ? "..." : value ? "ON" : "OFF"}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Other Configs */}
      <div className="bg-slate-900/40 border border-slate-800 rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4 text-foreground">Configurations</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Paramètres système modifiables
        </p>

        <div className="space-y-3">
          {configKeys.map((key) => {
            const value = data.configs[key];
            const defaultValue = data.defaults.configs[key];
            const isDefault = data.configs[key] === defaultValue;
            const isEditing = editingKey === key;

            return (
              <div
                key={key}
                className="flex items-center justify-between p-3 bg-slate-900/20 border border-slate-800 rounded"
              >
                <div className="flex-1">
                  <span className="font-mono text-sm">{key}</span>
                  {isDefault && (
                    <span className="ml-2 text-xs text-gray-400">(défaut)</span>
                  )}
                </div>

                {isEditing ? (
                  <div className="flex gap-2 items-center">
                    <input
                      type="text"
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="border rounded px-2 py-1 text-sm w-32"
                    />
                    <button
                      onClick={saveEdit}
                      disabled={saving === key}
                      className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 disabled:opacity-50"
                    >
                      {saving === key ? "..." : "✓"}
                    </button>
                    <button
                      onClick={() => setEditingKey(null)}
                      className="px-3 py-1 bg-gray-300 rounded text-sm hover:bg-gray-400"
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-2 items-center">
                    <span className="font-mono text-sm text-gray-600">
                      {typeof value === "object"
                        ? JSON.stringify(value).slice(0, 30)
                        : String(value)}
                    </span>
                    <button
                      onClick={() => startEditing(key, value)}
                      className="px-3 py-1 bg-gray-200 rounded text-sm hover:bg-gray-300"
                    >
                      Modifier
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Custom Configs (in DB but not in defaults) */}
      {Object.keys(data.configs).filter(
        (k) => !featureFlagKeys.includes(k) && !configKeys.includes(k)
      ).length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800 rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4 text-foreground">Configs Personnalisées</h2>

          <div className="space-y-3">
            {Object.entries(data.configs)
              .filter(([k]) => !featureFlagKeys.includes(k) && !configKeys.includes(k))
              .map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between p-3 bg-slate-900/20 border border-slate-800 rounded"
                >
                  <span className="font-mono text-sm text-foreground">{key}</span>
                  <span className="font-mono text-sm text-muted-foreground">
                    {typeof value === "object"
                      ? JSON.stringify(value).slice(0, 50)
                      : String(value)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}
