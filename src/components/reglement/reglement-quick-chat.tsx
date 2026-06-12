"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, BookOpen, Loader2, Send } from "lucide-react";
import { AnswerView } from "./reglement-assistant";

/**
 * Mini-chat règlement pour les dashboards (membre + staff) : on pose sa
 * question directement, la réponse s'affiche en place. Même API que l'outil
 * complet — quotas partagés. `fullToolHref` pointe vers la page complète.
 */

const QUICK_SUGGESTIONS = [
  "Combien de gendarmes pour un double braquage ?",
  "C'est quoi le PowerGaming ?",
];

export default function ReglementQuickChat({ fullToolHref = "/reglement" }: { fullToolHref?: string }) {
  const [question, setQuestion] = useState("");
  const [current, setCurrent] = useState<{ question: string; answer: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 3 || loading) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/member/reglement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data?.ok) throw new Error(data?.error || "Réponse impossible — réessaie.");
      setCurrent({ question: trimmed, answer: data.answer });
      setQuestion("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-gradient-to-br from-amber-500/[0.08] via-white/[0.03] to-transparent p-5 backdrop-blur-sm">
      {/* En-tête */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-amber-500/30 bg-amber-500/15">
            <BookOpen className="h-4 w-4 text-amber-300" />
          </div>
          <div className="min-w-0">
            <p className="truncate text-sm font-bold text-slate-50">Assistant Règlement LYG</p>
            <p className="truncate text-[11px] text-slate-400">Pose ta question, l&apos;IA cite la règle exacte.</p>
          </div>
        </div>
        <Link
          href={fullToolHref}
          className="flex shrink-0 items-center gap-1 text-[11px] font-medium text-amber-300/80 transition-colors hover:text-amber-200"
        >
          Outil complet <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      {/* Saisie */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="mt-3 flex gap-2"
      >
        <input
          type="text"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          maxLength={300}
          disabled={loading}
          placeholder="Ex. : j'ai le droit de braquer seul ?"
          className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[rgba(10,4,6,0.85)] px-3.5 py-2 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={loading || question.trim().length < 3}
          aria-label="Demander"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-amber-500/30 bg-amber-500/15 px-3.5 py-2 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          <span className="hidden sm:inline">{loading ? "…" : "Demander"}</span>
        </button>
      </form>

      {/* Suggestions tant que rien n'a été demandé */}
      {!current && !loading && !error && (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {QUICK_SUGGESTIONS.map((sugg) => (
            <button
              key={sugg}
              type="button"
              onClick={() => ask(sugg)}
              className="rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:border-amber-500/30 hover:text-amber-200"
            >
              {sugg}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-orange-500/30 bg-orange-500/10 px-3 py-2 text-xs text-orange-200">
          {error}
        </div>
      )}

      {/* Réponse en place */}
      {current && (
        <div className="mt-3 overflow-hidden rounded-xl border border-white/10 bg-[rgba(10,4,6,0.55)]">
          <div className="border-b border-white/8 px-4 py-2">
            <p className="truncate text-xs text-slate-400">
              ❓ <span className="text-slate-300">{current.question}</span>
            </p>
          </div>
          <div className="max-h-56 overflow-y-auto px-4 py-3">
            <AnswerView text={current.answer} />
          </div>
        </div>
      )}
    </div>
  );
}
