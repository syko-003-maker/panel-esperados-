"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const TYPES = ["AVERT_ORAL_PLAYTIME", "AVERT_ORAL_REUNION", "AVERT_LEGER", "AVERT_LOURD", "DEMOTE", "RESERVISTE", "BLACKLIST"] as const;

type SanctionType = (typeof TYPES)[number];

export default function NewSanctionClient() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    memberDiscordId: "",
    type: "AVERT_ORAL_PLAYTIME" as SanctionType,
    reason: "",
  });

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const payload = {
      memberDiscordId: form.memberDiscordId.trim(),
      type: form.type,
      reason: form.reason.trim(),
    };

    try {
      const res = await fetch("/api/staff/sanctions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.error || "Create failed");
      router.push(`/staff/sanctions/${json.sanction.id}`);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error ? (
        <div className="p-3 border border-red-200 bg-red-50 text-red-800 rounded text-sm">{error}</div>
      ) : null}

      <label className="block text-sm">
        Discord ID du membre
        <input
          className="mt-1 w-full border border-slate-800 rounded px-3 py-2 bg-slate-900/40 text-foreground"
          value={form.memberDiscordId}
          onChange={(e) => setForm((prev) => ({ ...prev, memberDiscordId: e.target.value }))}
          placeholder="123456789012345678"
          required
        />
      </label>

      <label className="block text-sm">
        Type
        <select
          className="mt-1 w-full border border-slate-800 rounded px-3 py-2 bg-slate-900/40 text-foreground"
          value={form.type}
          onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as SanctionType }))}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </label>

      <label className="block text-sm">
        Raison
        <textarea
          className="mt-1 w-full border border-slate-800 rounded px-3 py-2 bg-slate-900/40 text-foreground"
          rows={3}
          value={form.reason}
          onChange={(e) => setForm((prev) => ({ ...prev, reason: e.target.value }))}
          required
        />
      </label>

      <button
        type="submit"
        disabled={saving}
        className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold rounded bg-blue-600 text-white hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-500 disabled:cursor-not-allowed"
      >
        {saving ? "Création..." : "Créer"}
      </button>
    </form>
  );
}
