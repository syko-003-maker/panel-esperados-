"use client";

import { useMemo, useState } from "react";

export type Link = {
  id: string;
  discordId: string | null;
  steamId: string | null;
  rpName: string | null;
  grade: string | null;
  gradeLevel: number | null;
  roleDiscordId: string | null;
  isActive: boolean;
  joinedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export default function StaffLinkForm(props: {
  initialLinks: Link[];
  prefilledDiscordId?: string;
  currentUserDiscordId?: string;
}) {
  const [discordId, setDiscordId] = useState(
    (props.prefilledDiscordId ?? props.currentUserDiscordId ?? "").trim()
  );
  const [steamId, setSteamId] = useState("");
  const [rpName, setRpName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const recentLinks = useMemo(() => props.initialLinks.slice(0, 20), [props.initialLinks]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/staff/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          discordId: discordId.trim(),
          steamId: steamId.trim(),
          rpName: rpName.trim() || null,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(String(json?.error ?? "LINK_FAILED"));
      }

      setSuccess("Liaison enregistrée");
      setSteamId("");
      setRpName("");
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4">
      <form className="space-y-3" onSubmit={onSubmit}>
        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="discordId">Discord ID</label>
          <input
            id="discordId"
            className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            value={discordId}
            onChange={(e) => setDiscordId(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="steamId">SteamID64</label>
          <input
            id="steamId"
            className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            value={steamId}
            onChange={(e) => setSteamId(e.target.value)}
            required
          />
        </div>

        <div className="grid gap-1">
          <label className="text-sm font-medium" htmlFor="rpName">Nom RP (optionnel)</label>
          <input
            id="rpName"
            className="rounded border border-slate-700 bg-slate-950 px-3 py-2 text-sm"
            value={rpName}
            onChange={(e) => setRpName(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="rounded bg-slate-200 px-4 py-2 text-sm font-semibold text-slate-900 disabled:opacity-60"
        >
          {submitting ? "Enregistrement..." : "Lier"}
        </button>
      </form>

      {error ? <p className="text-sm text-red-400">{error}</p> : null}
      {success ? <p className="text-sm text-emerald-400">{success}</p> : null}

      <div className="space-y-2">
        <h3 className="text-sm font-semibold">Derniers liens</h3>
        <ul className="space-y-1 text-xs text-slate-300">
          {recentLinks.map((item) => (
            <li key={item.id} className="rounded border border-slate-800 px-2 py-1">
              <span>{item.rpName ?? "(sans nom)"}</span>
              <span className="mx-2">•</span>
              <span>{item.discordId ?? "(sans discord)"}</span>
              <span className="mx-2">•</span>
              <span>{item.steamId ?? "(sans steam)"}</span>
            </li>
          ))}
          {recentLinks.length === 0 ? <li>Aucun lien</li> : null}
        </ul>
      </div>
    </div>
  );
}
