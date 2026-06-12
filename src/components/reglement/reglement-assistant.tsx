"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, Loader2, ScrollText, Send, Sparkles } from "lucide-react";

/**
 * Assistant Règlement — même moteur que la commande Discord /reglement
 * (corpus LYG complet + IA). Partagé entre l'espace membre (/reglement)
 * et le staff (/staff/reglement). Présentation "console de chat".
 */

type QA = { id: number; question: string; answer: string };

const SUGGESTIONS = [
  "Il faut combien de gendarmes pour un double braquage ?",
  "Je peux libérer les otages sur le lieu du braquage ?",
  "Combien de sas maximum sont autorisés sur une base ?",
  "C'est quoi le PowerGaming ?",
];

/** Texte avec **gras** rendu. */
function Bold({ text }: { text: string }) {
  return (
    <>
      {text.split(/(\*\*[^*]+\*\*)/g).map((part, i) =>
        part.startsWith("**") && part.endsWith("**") ? (
          <strong key={i} className="font-semibold text-slate-50">
            {part.slice(2, -2)}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

/**
 * Rendu riche d'une réponse :
 *  - 1re ligne ✅/❌/⚠️ → badge verdict coloré
 *  - ligne "📖 Règle :" → bloc citation ambré
 *  - reste → paragraphes avec gras rendu
 */
export function AnswerView({ text }: { text: string }) {
  const lines = text.split("\n");
  const out: React.ReactNode[] = [];

  lines.forEach((rawLine, i) => {
    const line = rawLine.trim();
    if (line === "") return;

    const clean = line.replace(/\*\*/g, "");

    // Badge verdict (généralement la 1re ligne)
    const verdict =
      clean.startsWith("✅") ? { cls: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200" } :
      clean.startsWith("❌") ? { cls: "border-red-500/40 bg-red-500/15 text-red-200" } :
      clean.startsWith("⚠️") || clean.startsWith("⚠") ? { cls: "border-orange-500/40 bg-orange-500/15 text-orange-200" } :
      null;

    if (verdict && i <= 2) {
      out.push(
        <span
          key={i}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-bold ${verdict.cls}`}
        >
          {clean}
        </span>
      );
      return;
    }

    // Bloc règle citée
    if (clean.startsWith("📖")) {
      out.push(
        <div key={i} className="mt-1 flex gap-2.5 rounded-xl border border-amber-500/20 bg-amber-500/[0.06] px-3.5 py-2.5">
          <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-amber-300/80" />
          <p className="text-[13px] leading-6 text-amber-100/90">
            <Bold text={line.replace(/^📖\s*/, "")} />
          </p>
        </div>
      );
      return;
    }

    out.push(
      <p key={i} className="text-sm leading-7 text-slate-200">
        <Bold text={line} />
      </p>
    );
  });

  return <div className="space-y-2">{out}</div>;
}

export default function ReglementAssistant() {
  const [question, setQuestion] = useState("");
  const [history, setHistory] = useState<QA[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Suit la conversation comme un vrai chat.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [history, loading]);

  async function ask(q: string) {
    const trimmed = q.trim();
    if (trimmed.length < 3 || loading) return;
    setLoading(true);
    setError(null);
    setQuestion("");
    setHistory((h) => [...h, { id: Date.now(), question: trimmed, answer: "" }]);
    try {
      const res = await fetch("/api/member/reglement", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!data?.ok) throw new Error(data?.error || "Réponse impossible — réessaie.");
      setHistory((h) => h.map((qa) => (qa.answer === "" ? { ...qa, answer: data.answer } : qa)));
    } catch (err: unknown) {
      setHistory((h) => h.filter((qa) => qa.answer !== ""));
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-6 sm:px-6">
      {/* ── Héro ── */}
      <div className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-amber-500/[0.12] via-[#1a0a0e]/60 to-transparent shadow-[0_20px_70px_rgba(2,6,23,0.45)]">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(201,148,10,0.16),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(122,31,43,0.22),transparent_42%)]" />
        <div className="relative flex items-center gap-5 px-6 py-7 sm:px-9 sm:py-8">
          <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-amber-500/35 bg-amber-500/15 shadow-[0_0_28px_rgba(201,148,10,0.25)]">
            <BookOpen className="h-7 w-7 text-amber-300" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold tracking-tight text-slate-50 sm:text-3xl">
              Assistant <span className="text-amber-300">Règlement</span> LYG
            </h1>
            <p className="mt-1 text-sm leading-6 text-slate-400">
              Pose ta question — l&apos;IA connaît tout le règlement (DarkRP, Métiers, Staff, Gendarmerie)
              et répond avec le verdict, l&apos;explication et la règle exacte.
            </p>
          </div>
        </div>
      </div>

      {/* ── Console de chat ── */}
      <div className="overflow-hidden rounded-[24px] border border-white/10 bg-[rgba(12,5,7,0.55)] shadow-[0_18px_50px_rgba(0,0,0,0.35)] backdrop-blur-sm">
        {/* Conversation */}
        <div ref={scrollRef} className="max-h-[64vh] min-h-[52vh] overflow-y-auto px-4 py-6 sm:px-8">
          {history.length === 0 && !loading ? (
            /* État vide : invitation + suggestions */
            <div className="flex h-full min-h-[46vh] flex-col items-center justify-center gap-6 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full border border-amber-500/25 bg-amber-500/10 shadow-[0_0_36px_rgba(201,148,10,0.18)]">
                <Sparkles className="h-7 w-7 text-amber-300/90" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-200">Pose ta première question</p>
                <p className="mt-1 text-xs text-slate-500">…ou pars d&apos;un exemple :</p>
              </div>
              <div className="grid w-full max-w-2xl gap-2.5 sm:grid-cols-2">
                {SUGGESTIONS.map((sugg) => (
                  <button
                    key={sugg}
                    type="button"
                    onClick={() => ask(sugg)}
                    className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3 text-left text-[13px] leading-5 text-slate-300 transition-all hover:border-amber-500/35 hover:bg-amber-500/[0.07] hover:text-amber-100"
                  >
                    {sugg}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {history.map((qa) => (
                <div key={qa.id} className="space-y-3">
                  {/* Question — bulle à droite */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] rounded-2xl rounded-br-md border border-amber-500/25 bg-amber-500/[0.12] px-4 py-2.5">
                      <p className="text-sm leading-6 text-amber-50">{qa.question}</p>
                    </div>
                  </div>
                  {/* Réponse — bulle à gauche avec avatar */}
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-amber-500/30 bg-[#1a0d10]">
                      <BookOpen className="h-3.5 w-3.5 text-amber-300" />
                    </div>
                    <div className="max-w-[88%] rounded-2xl rounded-tl-md border border-white/10 bg-white/[0.04] px-4 py-3">
                      {qa.answer === "" ? (
                        <div className="flex items-center gap-2.5 py-0.5 text-sm text-slate-400">
                          <Loader2 className="h-4 w-4 animate-spin text-amber-300" />
                          L&apos;IA consulte le règlement…
                        </div>
                      ) : (
                        <AnswerView text={qa.answer} />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {error && (
          <div className="mx-4 mb-3 rounded-xl border border-orange-500/30 bg-orange-500/10 px-4 py-2.5 text-sm text-orange-200 sm:mx-6">
            {error}
          </div>
        )}

        {/* Barre de saisie */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(question);
          }}
          className="border-t border-white/10 bg-white/[0.02] px-4 py-4 sm:px-8"
        >
          <div className="flex gap-2">
            <input
              type="text"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              maxLength={300}
              disabled={loading}
              placeholder="Ex. : j'ai le droit de braquer la supérette seul ?"
              className="min-w-0 flex-1 rounded-2xl border border-white/10 bg-[rgba(10,4,6,0.9)] px-4 py-2.5 text-sm text-slate-100 placeholder:text-slate-500 transition-colors focus:border-amber-500/45 focus:outline-none focus:ring-1 focus:ring-amber-500/20 disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={loading || question.trim().length < 3}
              className="inline-flex shrink-0 items-center gap-2 rounded-2xl border border-amber-500/35 bg-gradient-to-b from-amber-500/25 to-amber-600/15 px-5 py-2.5 text-sm font-bold text-amber-100 shadow-[0_4px_18px_rgba(201,148,10,0.15)] transition-all hover:from-amber-500/35 hover:to-amber-600/25 disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              <span className="hidden sm:inline">{loading ? "Réflexion…" : "Demander"}</span>
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-600">
            <span>1 question / 5 s · réponse en quelques secondes</span>
            <span>{question.length}/300</span>
          </div>
        </form>
      </div>

      <p className="text-center text-[11px] leading-5 text-slate-600">
        Réponses générées par IA à partir du règlement officiel LYG — en cas de doute ou de litige,
        la parole d&apos;un staff prévaut toujours.
      </p>
    </div>
  );
}
