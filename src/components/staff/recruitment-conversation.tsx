"use client";

import { useCallback, useEffect, useState } from "react";
import { MessageSquare, RefreshCw, ChevronDown, Bot, Paperclip } from "lucide-react";

/**
 * Conversation du ticket de recrutement, lue depuis la copie en base.
 *
 * Le fil Discord est verrouillé puis archivé à la décision, et peut être
 * supprimé : sans cette vue, comprendre une décision passée obligeait à
 * retrouver le fil — quand il existait encore.
 *
 * Replié par défaut, et rien n'est chargé avant l'ouverture : un ticket long
 * n'a pas à ralentir l'affichage de la fiche pour tout le monde.
 */
type Msg = {
  id: string;
  authorDiscordId: string;
  authorNameSnapshot: string;
  authorIsBot: boolean;
  content: string;
  embedsText: string | null;
  attachmentsJson: Array<{ name?: string; url?: string }> | null;
  createdAtDiscord: string;
  editedAtDiscord: string | null;
};

export function RecruitmentConversation({ ticketId }: { ticketId: string }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/staff/recruitment/${ticketId}/messages`, { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error ?? "Chargement impossible");
      setMsgs(data.messages ?? []);
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  }, [ticketId]);

  useEffect(() => {
    if (open && !loaded) void load();
  }, [open, loaded, load]);

  return (
    <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.02]">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-5 py-4 text-left transition-colors hover:bg-white/[0.03]"
      >
        <MessageSquare className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="font-semibold text-slate-100">Conversation du ticket</span>
        {loaded && (
          <span className="text-xs text-slate-500">
            {msgs.length} message{msgs.length > 1 ? "s" : ""}
          </span>
        )}
        <ChevronDown
          className={`ml-auto h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <div className="border-t border-white/10 px-5 py-4">
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">
              Copie enregistrée à la décision — reste lisible même si le fil Discord a été supprimé.
            </p>
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/[0.07]"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
              Actualiser
            </button>
          </div>

          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-200">
              {error}
            </div>
          )}

          {!error && loaded && msgs.length === 0 && (
            <p className="py-6 text-center text-sm text-slate-500">
              Aucun message archivé. Les tickets clos avant la mise en place de l'archivage
              n'ont pas de copie.
            </p>
          )}

          <div className="max-h-[28rem] space-y-2 overflow-y-auto pr-1">
            {msgs.map((m) => (
              <div
                key={m.id}
                className={`rounded-xl border px-3 py-2.5 ${
                  m.authorIsBot
                    ? "border-white/[0.07] bg-white/[0.015]"
                    : "border-white/10 bg-white/[0.04]"
                }`}
              >
                <div className="mb-1 flex items-center gap-2">
                  {m.authorIsBot && <Bot className="h-3.5 w-3.5 shrink-0 text-slate-500" />}
                  <span className="truncate text-xs font-bold text-slate-200">
                    {m.authorNameSnapshot}
                  </span>
                  <span className="shrink-0 font-mono text-[10px] text-slate-500">
                    {new Date(m.createdAtDiscord).toLocaleString("fr-FR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                  {m.editedAtDiscord && (
                    <span className="shrink-0 text-[10px] italic text-slate-600">modifié</span>
                  )}
                </div>

                {m.content && (
                  <p className="whitespace-pre-wrap break-words text-sm text-slate-200">
                    {m.content}
                  </p>
                )}

                {/* Les embeds portent la candidature elle-même : sans eux, le
                    début de la conversation serait vide. */}
                {m.embedsText && (
                  <pre className="mt-1.5 whitespace-pre-wrap break-words border-l-2 border-white/10 pl-3 font-sans text-[13px] leading-relaxed text-slate-400">
                    {m.embedsText}
                  </pre>
                )}

                {Array.isArray(m.attachmentsJson) && m.attachmentsJson.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-2">
                    {m.attachmentsJson.map((a, i) => (
                      <a
                        key={i}
                        href={a.url}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/[0.03] px-2 py-1 text-[11px] text-slate-300 hover:bg-white/[0.08]"
                      >
                        <Paperclip className="h-3 w-3" />
                        {a.name ?? "pièce jointe"}
                      </a>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
