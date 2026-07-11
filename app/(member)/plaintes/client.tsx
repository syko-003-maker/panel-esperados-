"use client";

import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { Scale, Loader2, Send, CheckCircle2, ShieldAlert, Lock } from "lucide-react";

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

const EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

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
      if (!res.ok || !json?.ok) setError(json?.error || "Erreur lors de l'envoi.");
      else {
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

  const inputCls =
    "w-full rounded-xl border border-white/10 bg-black/20 px-3.5 py-2.5 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-rose-500/50 focus:bg-black/30";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        className="relative overflow-hidden rounded-2xl border border-rose-500/30 bg-gradient-to-br from-rose-500/20 via-rose-500/[0.07] to-transparent p-5 shadow-[0_20px_50px_-24px_rgba(244,63,94,0.5)] backdrop-blur-sm"
      >
        <div className="pointer-events-none absolute -right-6 -top-10 h-32 w-32 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="relative flex items-center gap-4">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-rose-500/50 bg-rose-500/20 shadow-[inset_0_1px_0_rgba(255,255,255,0.12)]">
            <Scale className="h-6 w-6 text-rose-200 drop-shadow-[0_0_8px_rgba(251,113,133,0.7)]" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-50">Déposer une plainte</h1>
            <p className="text-sm text-rose-100/70">Un souci avec un autre membre ? Signale-le au staff.</p>
          </div>
        </div>
      </motion.div>

      {/* Bandeau confidentialité */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.04, ease: EASE }}
        className="flex items-center gap-2.5 rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-2.5 text-xs text-slate-400"
      >
        <Lock className="h-4 w-4 shrink-0 text-slate-500" />
        Confidentiel — seul le staff voit ta plainte. Reste factuel, ajoute une preuve si possible.
      </motion.div>

      {/* Formulaire */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, delay: 0.08, ease: EASE }}
        className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm"
      >
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Membre concerné</label>
          <select value={targetId} onChange={(e) => setTargetId(e.target.value)} className={inputCls}>
            <option value="" className="bg-slate-900">— Choisir un membre —</option>
            {targets.map((t) => (
              <option key={t.id} value={t.id} className="bg-slate-900">{t.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Objet</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="ex. « Insultes en vocal »" className={inputCls} />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Que s'est-il passé ?</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={4} placeholder="Explique la situation, avec des faits…" className={`resize-y ${inputCls}`} />
        </div>
        <div>
          <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Preuve <span className="text-slate-600">(optionnel)</span></label>
          <input value={evidence} onChange={(e) => setEvidence(e.target.value)} maxLength={500} placeholder="Lien capture / clip" className={inputCls} />
        </div>

        {error ? (
          <p className="flex items-center gap-1.5 text-xs text-rose-300"><ShieldAlert className="h-4 w-4" /> {error}</p>
        ) : null}
        {done ? (
          <motion.p
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex items-center gap-1.5 rounded-xl border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-300"
          >
            <CheckCircle2 className="h-4 w-4" /> Plainte envoyée au staff. Tu la retrouves ci-dessous.
          </motion.p>
        ) : null}

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="group inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-rose-600 to-rose-500 px-4 py-2 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(244,63,94,0.7)] transition-all hover:shadow-[0_10px_28px_-8px_rgba(244,63,94,0.9)] hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />}
            Envoyer au staff
          </button>
        </div>
      </motion.div>

      {/* Mes plaintes */}
      {mine.length > 0 ? (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, delay: 0.12, ease: EASE }}
        >
          <h2 className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Mes plaintes</h2>
          <div className="space-y-2">
            {mine.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-white/8 bg-white/[0.02] px-3.5 py-2.5 text-sm transition-colors hover:border-white/15"
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
        </motion.div>
      ) : null}
    </div>
  );
}
