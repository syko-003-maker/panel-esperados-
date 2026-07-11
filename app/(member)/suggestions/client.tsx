"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { ArrowBigUp, Lightbulb, Loader2, Trash2, Send, Sparkles } from "lucide-react";

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

const STATUS_META: Record<Status, { label: string; dot: string; cls: string }> = {
  OPEN: { label: "À l'étude", dot: "bg-sky-400", cls: "border-sky-500/30 bg-sky-500/10 text-sky-300" },
  PLANNED: { label: "Prévu", dot: "bg-amber-400", cls: "border-amber-500/30 bg-amber-500/10 text-amber-300" },
  DONE: { label: "Fait", dot: "bg-emerald-400", cls: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300" },
  REJECTED: { label: "Refusé", dot: "bg-rose-400", cls: "border-rose-500/30 bg-rose-500/10 text-rose-300" },
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
      if (!res.ok || !json?.ok) setError(json?.error || "Erreur lors de l'envoi.");
      else {
        setTitle("");
        setDescription("");
        await load();
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleVote(id: string) {
    setData((cur) =>
      cur.map((s) => (s.id === id ? { ...s, hasVoted: !s.hasVoted, votes: s.votes + (s.hasVoted ? -1 : 1) } : s))
    );
    try {
      const res = await fetch(`/api/member/suggestions/${id}/vote`, { method: "POST" });
      const json = await res.json().catch(() => null);
      if (json?.ok) setData((cur) => cur.map((s) => (s.id === id ? { ...s, hasVoted: json.voted, votes: json.votes } : s)));
      else await load(true);
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
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-br from-amber-500/20 via-amber-500/[0.07] to-transparent p-5 shadow-[0_20px_50px_-24px_rgba(245,158,11,0.5)] backdrop-blur-sm"
      >
        <div className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full bg-amber-500/20 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-amber-500/50 bg-amber-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <Lightbulb className="h-6 w-6 text-amber-200 drop-shadow-[0_0_8px_rgba(251,191,36,0.7)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-50">Suggestions</h1>
            <p className="text-sm text-amber-100/70">Propose une idée pour la famille — les plus votées sont traitées.</p>
          </div>
        </div>
      </motion.div>

      {/* Formulaire */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.05, ease: [0.22, 1, 0.36, 1] }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm"
      >
        <h2 className="mb-3 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
          <Sparkles className="h-3.5 w-3.5 text-amber-400" /> Proposer une idée
        </h2>
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Titre — ex. « Ajouter un salon événements »"
          className="mb-2.5 w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-amber-500/50 focus:bg-black/30"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Décris ton idée…"
          className="w-full resize-y rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-amber-500/50 focus:bg-black/30"
        />
        {error ? <p className="mt-2.5 text-xs text-rose-300">{error}</p> : null}
        <div className="mt-3.5 flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-500 to-amber-400 px-4 py-2 text-sm font-semibold text-black shadow-[0_8px_24px_-8px_rgba(245,158,11,0.7)] transition-all hover:shadow-[0_10px_28px_-8px_rgba(245,158,11,0.9)] hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
            Proposer
          </button>
        </div>
      </motion.div>

      {/* Filtres */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => {
          const active = filter === f.key;
          const count = f.key === "ALL" ? data.length : data.filter((s) => s.status === f.key).length;
          return (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-all ${
                active
                  ? "border-amber-500/50 bg-amber-500/15 text-amber-100 shadow-[0_0_16px_-6px_rgba(245,158,11,0.6)]"
                  : "border-white/10 text-slate-400 hover:border-white/20 hover:bg-white/5"
              }`}
            >
              {f.label}
              <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${active ? "bg-amber-400/25 text-amber-100" : "bg-white/5 text-slate-500"}`}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Liste */}
      {loading ? (
        <div className="flex justify-center py-12 text-amber-400/70">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : visible.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/10 py-12 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/10 bg-white/[0.03]">
            <Lightbulb className="h-6 w-6 text-slate-600" />
          </div>
          <p className="text-sm text-slate-500">Aucune suggestion ici. Sois le premier à proposer une idée !</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visible.map((s, i) => (
            <motion.div
              key={s.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: Math.min(i * 0.03, 0.3), ease: [0.22, 1, 0.36, 1] }}
              className="group rounded-2xl border border-white/8 bg-white/[0.02] p-4 backdrop-blur-sm transition-colors hover:border-amber-500/20"
            >
              <div className="flex gap-3.5">
                {/* Vote */}
                <button
                  type="button"
                  onClick={() => toggleVote(s.id)}
                  className={`flex h-16 w-14 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border transition-all active:scale-95 ${
                    s.hasVoted
                      ? "border-amber-500/60 bg-gradient-to-b from-amber-500/25 to-amber-500/10 text-amber-200 shadow-[0_0_22px_-6px_rgba(245,158,11,0.7)]"
                      : "border-white/10 text-slate-400 hover:border-amber-500/40 hover:text-amber-200"
                  }`}
                  title={s.hasVoted ? "Retirer mon vote" : "Voter"}
                >
                  <ArrowBigUp className={`h-5 w-5 transition-transform ${s.hasVoted ? "fill-amber-400/50" : "group-hover:-translate-y-px"}`} />
                  <span className="text-base font-bold leading-none tabular-nums">{s.votes}</span>
                </button>

                {/* Contenu */}
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="font-semibold leading-snug text-slate-50">{s.title}</h3>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_META[s.status].cls}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${STATUS_META[s.status].dot}`} />
                      {STATUS_META[s.status].label}
                    </span>
                  </div>
                  <p className="mt-1.5 whitespace-pre-wrap text-sm leading-relaxed text-slate-300/90">{s.description}</p>
                  <p className="mt-2 text-[11px] text-slate-500">proposé par <span className="text-slate-400">{s.authorName}</span></p>

                  {s.staffNote ? (
                    <div className="mt-2.5 rounded-xl border border-amber-500/15 bg-amber-500/[0.06] px-3 py-2 text-xs text-amber-100/90">
                      <span className="font-semibold text-amber-300">Réponse staff — </span>
                      {s.staffNote}
                    </div>
                  ) : null}

                  {canManage ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/8 pt-3">
                      <select
                        value={s.status}
                        onChange={(e) => setStatus(s.id, e.target.value as Status)}
                        className="rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-slate-200 outline-none focus:border-amber-500/40"
                      >
                        {(Object.keys(STATUS_META) as Status[]).map((st) => (
                          <option key={st} value={st} className="bg-slate-900">{STATUS_META[st].label}</option>
                        ))}
                      </select>
                      <input
                        defaultValue={s.staffNote ?? ""}
                        onBlur={(e) => {
                          if ((e.target.value || "") !== (s.staffNote ?? "")) saveNote(s.id, e.target.value);
                        }}
                        placeholder="Note staff (optionnel)…"
                        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-xs text-slate-200 outline-none placeholder:text-slate-500 focus:border-amber-500/40"
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
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
}
