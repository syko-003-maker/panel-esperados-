"use client";

import { useState } from "react";
import { BookOpen, Loader2, Send, Sparkles } from "lucide-react";

/**
 * Assistant Règlement — même moteur que la commande Discord /reglement
 * (corpus LYG complet + IA). Partagé entre l'espace membre (/reglement)
 * et le staff (/staff/reglement).
 */

type QA = { id: number; question: string; answer: string };

const SUGGESTIONS = [
  "Il faut combien de gendarmes pour un double braquage ?",
  "Je peux libérer les otages sur le lieu du braquage ?",
  "Combien de sas maximum sont autorisés sur une base ?",
  "C'est quoi le PowerGaming ?",
];

/** Rendu minimal : **gras** → <strong>, conservation des sauts de ligne. */
export function renderAnswer(text: string) {
  return text.split("\n").map((line, li) => (
    <p key={li} className={line.trim() === "" ? "h-2" : "leading-7"}>
      {line.split(/(\*\*[^*]+\*\*)/g).map((part, pi) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={pi} className="font-semibold text-amber-200">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={pi}>{part}</span>
        )
      )}
    </p>
  ));
}

export default function ReglementAssistant() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QA[]>([]);
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
      setHistory((h) => [{ id: Date.now(), question: trimmed, answer: data.answer }, ...h]);
      setQuestion("");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:px-0">
      {/* En-tête */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-amber-500/25 bg-amber-500/10">
            <BookOpen className="h-5 w-5 text-amber-300" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-50">Assistant Règlement LYG</h1>
            <p className="mt-0.5 text-sm text-slate-400">
              Pose ta question — l&apos;IA répond avec le verdict, l&apos;explication et la règle exacte.
            </p>
          </div>
        </div>
      </div>

      {/* Formulaire */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 backdrop-blur-sm"
      >
        <div className="flex gap-2">
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            maxLength={300}
            disabled={loading}
            placeholder="Ex. : j'ai le droit de braquer la supérette seul ?"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-[rgba(10,4,6,0.85)] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 focus:border-amber-500/40 focus:outline-none disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={loading || question.trim().length < 3}
            className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-amber-500/30 bg-amber-500/15 px-4 py-2.5 text-sm font-semibold text-amber-200 transition-colors hover:bg-amber-500/25 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {loading ? "L'IA réfléchit…" : "Demander"}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-slate-500">
          <span>1 question / 30 s · réponse en quelques secondes</span>
          <span>{question.length}/300</span>
        </div>
      </form>

      {error && (
        <div className="rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-3 text-sm text-orange-200">
          {error}
        </div>
      )}

      {/* Suggestions quand vide */}
      {history.length === 0 && !loading && (
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="mb-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">
            <Sparkles className="h-3 w-3" /> Exemples de questions
          </div>
          <div className="flex flex-wrap gap-2">
            {SUGGESTIONS.map((sugg) => (
              <button
                key={sugg}
                type="button"
                onClick={() => ask(sugg)}
                className="rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5 text-xs text-slate-300 transition-colors hover:border-amber-500/30 hover:text-amber-200"
              >
                {sugg}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Historique de la session (le plus récent en haut) */}
      {history.map((qa) => (
        <div key={qa.id} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
          <div className="border-b border-white/8 bg-white/[0.02] px-5 py-3">
            <span className="text-[11px] font-semibold uppercase tracking-[0.16em] text-slate-500">❓ Ta question</span>
            <p className="mt-1 text-sm font-medium text-slate-100">{qa.question}</p>
          </div>
          <div className="px-5 py-4 text-sm text-slate-200">{renderAnswer(qa.answer)}</div>
        </div>
      ))}

      <p className="text-center text-[11px] leading-5 text-slate-600">
        Réponses générées par IA à partir du règlement officiel LYG (DarkRP, Métiers, Staff, Gendarmerie).
        <br />
        En cas de doute ou de litige, la parole d&apos;un staff prévaut toujours.
      </p>
    </div>
  );
}
