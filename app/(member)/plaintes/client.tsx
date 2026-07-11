"use client";

import { useEffect, useState } from "react";
import { Scale, Loader2, Send, CheckCircle2 } from "lucide-react";

type Target = { id: string; name: string };
type MyComplaint = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  targetName: string;
  createdAt: string;
};

const STATUS_CLS: Record<string, string> = {
  OPEN: "border-sky-500/30 bg-sky-500/10 text-sky-300",
  IN_REVIEW: "border-amber-500/30 bg-amber-500/10 text-amber-300",
  RESOLVED: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
  REJECTED: "border-rose-500/30 bg-rose-500/10 text-rose-300",
  CLOSED: "border-slate-500/30 bg-slate-500/10 text-slate-300",
};

export function PlaintesClient({ targets }: { targets: Target[] }) {
  const [targetId, setTargetId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [evidence, setEvidence] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [mine, setMine] = useState<MyComplaint[]>([]);

  async function loadMine() {
    try {
      const res = await fetch("/api/member/complaints", { cache: "no-store" });
      const json = await res.json().catch(() => null);
      if (json?.ok) setMine(json.data as MyComplaint[]);
    } catch {
      /* garde */
    }
  }
  useEffect(() => {
    loadMine();
  }, []);

  async function submit() {
    setError(null);
    setDone(false);
    if (!targetId) return setError("Choisis le membre concerné.");
    if (title.trim().length < 4) return setError("Titre trop court (min. 4 caractères).");
    if (description.trim().length < 10) return setError("Décris le problème (min. 10 caractères).");
    setSubmitting(true);
    try {
      const res = await fetch("/api/member/complaints", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetId, title, description, evidence }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        setError(json?.error || "Erreur lors de l'envoi.");
      } else {
        setDone(true);
        setTargetId("");
        setTitle("");
        setDescription("");
        setEvidence("");
        await loadMine();
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-50">
          <Scale className="h-6 w-6 text-rose-400" />
          Déposer une plainte
        </h1>
        <p className="mt-1 text-sm text-slate-400">
          Un souci avec un autre membre de la famille ? Signale-le au staff — c'est confidentiel, seul le staff le voit.
        </p>
      </div>

      <div className="rounded-2xl border border-white/8 bg-white/[0.02] p-4 backdrop-blur-sm">
        <label className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-400">Membre concerné</label>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-100 outline-none focus:border-rose-500/40"
        >
          <option value="" className="bg-slate-900">— Choisir un membre —</option>
          {targets.map((t) => (
            <option key={t.id} value={t.id} className="bg-slate-900">
              {t.name}
            </option>
          ))}
        </select>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={120}
          placeholder="Objet (ex. « Insultes en vocal »)"
          className="mb-3 w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-rose-500/40"
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={2000}
          rows={4}
          placeholder="Explique ce qu'il s'est passé…"
          className="mb-3 w-full resize-y rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-rose-500/40"
        />
        <input
          value={evidence}
          onChange={(e) => setEvidence(e.target.value)}
          maxLength={500}
          placeholder="Preuve (lien capture / clip) — optionnel"
          className="w-full rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-100 outline-none placeholder:text-slate-500 focus:border-rose-500/40"
        />

        {error ? <p className="mt-3 text-xs text-rose-300">{error}</p> : null}
        {done ? (
          <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-300">
            <CheckCircle2 className="h-4 w-4" /> Plainte envoyée au staff. Tu la retrouveras ci-dessous.
          </p>
        ) : null}

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="inline-flex items-center gap-2 rounded-xl border border-rose-500/40 bg-gradient-to-r from-rose-700/80 to-rose-600/80 px-4 py-2 text-sm font-semibold text-white transition-all hover:brightness-110 disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            Envoyer au staff
          </button>
        </div>
      </div>

      {/* Mes plaintes */}
      {mine.length > 0 ? (
        <div>
          <h2 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">Mes plaintes</h2>
          <div className="space-y-2">
            {mine.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-slate-200">{c.title}</p>
                  <p className="text-[11px] text-slate-500">contre {c.targetName}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${STATUS_CLS[c.status] ?? "border-slate-500/30 text-slate-300"}`}>
                  {c.statusLabel}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
