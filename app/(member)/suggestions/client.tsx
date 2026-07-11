"use client";

import { useEffect, useState } from "react";
import { ArrowBigUp, Lightbulb, Loader2, Trash2, Send } from "lucide-react";

type Status = "OPEN" | "PLANNED" | "DONE" | "REJECTED";
type Suggestion = {
  id: string;
  title: string;
  description: string;
  status: Status;
  staffNote: string | null;
  authorName: string;
  votes: number;
  hasVoted: boolean;
  createdAt: string;
};

const STATUS_META: Record<Status, { label: string; cls: string }> = {
  OPEN: { label: "À l'étude", cls: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  PLANNED: { label: "Prévu", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  DONE: { label: "Fait", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  REJECTED: { label: "Refusé", cls: "border-rose-500/30 bg-rose-500/10 text-rose-300" },
};
const FILTERS: { key: Status | "ALL"; label: string }[] = [
  { key: "ALL", label: "Toutes" },
  { key: "OPEN", label: "À l'étude" },
  { key: "PLANNED", label: "Prévu" },
  { key: "DONE", label: "Fait" },
  { key: "REJECTED", label: "Refusé" },
];

export function SuggestionsClient() {
  const [data, setData] = useState<Suggestion[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Status | "ALL">("ALL");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load(silent = false) {
    if (silent && document.visibilityState === "hidden") return;
    try {
      const res = await fetch("/api/member/suggestions", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json?.ok) {
        setData(json.data as Suggestion[]);
        setCanManage(Boolean(json.canManage));
      }
    } catch {
      /* garde l'état */
    } finally {
      if (!silent) setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(() => load(true), 20_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit() {
    setError(null);
    if (title.trim().length < 4) return setError("Titre trop court (min. 4 caractères).");
    if (description.trim().length < 10) return setError("Description trop courte (min. 10 caractères).");
    setSubmitting(true);
    try {
      const res = await fetch("/api/member/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, description }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Erreur lors de l'envoi.");
      } else {
        setTitle("");
        setDescription("");
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleVote(id: string) {
    // optimiste
    setData((cur) =>
      cur.map((s) =>
        s.id === id ? { ...s, hasVoted: !s.hasVoted, votes: s.votes + (s.hasVoted ? -1 : 1) } : s
      )
    );
    try {
      const res = await fetch(`/api/member/suggestions/${id}/vote`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (json?.ok) {
        setData((cur) => cur.map((s) => (s.id === id ? { ...s, hasVoted: json.voted, votes: json.votes } : s)));
      } else {
        await load(true);
      }
    } catch {
      await load(true);
    }
  }

  async function setStatus(id: string, status: Status) {
    setData((cur) => cur.map((s) => (s.id === id ? { ...s, status } : s)));
    await fetch(`/api/staff/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    }).catch(() => {});
  }

  async function saveNote(id: string, staffNote: string) {
    await fetch(`/api/staff/suggestions/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ staffNote }),
    }).catch(() => {});
    await load(true);
  }

  async function remove(id: string) {
    if (!confirm("Supprimer cette suggestion ?")) return;
    setData((cur) => cur.filter((s) => s.id !== id));
    await fetch(`/api/staff/suggestions/${id}`, { method: "DELETE" }).catch(() => {});
  }

  const visible = filter === "ALL" ? data : data.filter((s) => s.status === filter);

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-50">
          <Lightbulb className="h-6 w-6 text-amber-400" />
          Suggestions
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Propose une idée pour la famille et vote pour celles que tu soutiens. Le staff traite les plus votées.
        </p>
      </div>

      {/* Formulaire de proposition */}
      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 backdrop-blur-sm">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Proposer une suggestion</h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Titre (ex. « Ajouter un salon événements »)"
          className="mb-2 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-500/40"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Décris ton idée…"
          className="w-full resize-y rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-amber-500/40"
        />
        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
        <div className="mt-3 flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl border border-amber-500/40 bg-gradient-to-r from-amber-600/80 to-amber-500/80 px-4 py-2 text-sm font-semibold text-black transition-all hover:brightness-110 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Proposer
          </button>
        </div>
      </div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            onClick={() => setFilter(f.key)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.key
                ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
                : "border-white/10 text-slate-400 hover:bg-white/5"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-10 text-slate-500">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <p className="py-10 text-center text-sm text-slate-500">Aucune suggestion pour ce filtre.</p>
      ) : (
        <div className="space-y-3">
          {visible.map((s) => (
            <div key={s.id} className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 backdrop-blur-sm">
              <div className="flex gap-3">
                {/* Vote */}
                <button
                  type="button"
                  onClick={() => toggleVote(s.id)}
                  className={`flex h-14 w-12 shrink-0 flex-col items-center justify-center rounded-xl border transition-colors ${
                    s.hasVoted
                      ? "border-amber-500/50 bg-amber-500/15 text-amber-300"
                      : "border-white/10 text-slate-400 hover:bg-white/5"
                  }`}
                  title={s.hasVoted ? "Retirer mon vote" : "Voter"}
                >
                  <ArrowBigUp className={`h-5 w-5 ${s.hasVoted ? "fill-amber-400/40" : ""}`} />
                  <span className="text-sm font-bold tabular-nums">{s.votes}</span>
                </button>

                {/* Contenu */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold text-slate-50">{s.title}</h3>
                    <span className={`rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_META[s.status].cls}`}>
                      {STATUS_META[s.status].label}
                    </span>
                  </div>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-300">{s.description}</p>
                  <p className="mt-2 text-[11px] text-slate-500">par {s.authorName}</p>
                  {s.staffNote ? (
                    <p className="mt-2 rounded-lg border border-white/8 bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-300">
                      <span className="font-semibold text-slate-400">Staff : </span>
                      {s.staffNote}
                    </p>
                  ) : null}

                  {/* Modération staff */}
                  {canManage ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
                      <select
                        value={s.status}
                        onChange={(e) => setStatus(s.id, e.target.value as Status)}
                        className="rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-slate-200 outline-none"
                      >
                        {(Object.keys(STATUS_META) as Status[]).map((st) => (
                          <option key={st} value={st} className="bg-slate-900">
                            {STATUS_META[st].label}
                          </option>
                        ))}
                      </select>
                      <input
                        defaultValue={s.staffNote ?? ""}
                        onBlur={(e) => {
                          if ((e.target.value || "") !== (s.staffNote ?? "")) saveNote(s.id, e.target.value);
                        }}
                        placeholder="Note staff (optionnel)…"
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-white/[0.03] px-2 py-1 text-xs text-slate-200 outline-none placeholder:text-slate-500"
                      />
                      <button
                        type="button"
                        onClick={() => remove(s.id)}
                        className="rounded-lg border border-rose-500/25 p-1.5 text-rose-300 transition-colors hover:bg-rose-500/10"
                        title="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
