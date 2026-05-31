"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  XCircle,
  Info,
  CalendarOff,
  CalendarClock,
  CalendarDays,
} from "lucide-react";
import { getUpcomingMeetingSundays } from "@/lib/meeting-dates";

// ─────────────────────────────────────────────────────────────────────────────
// Composant principal
// ─────────────────────────────────────────────────────────────────────────────

type AbsenceType = "GENERAL" | "MEETING";

export function AbsencePageClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [type, setType] = useState<AbsenceType>("GENERAL");
  const [reason, setReason] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [meetingDate, setMeetingDate] = useState("");

  const upcomingSundays = useMemo(() => getUpcomingMeetingSundays(6), []);
  const reasonLength = reason.trim().length;
  const isReasonValid = reasonLength >= 10;
  const isMeetingDateValid = type === "GENERAL" || Boolean(meetingDate);
  const canSubmit = isReasonValid && isMeetingDateValid && !loading;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const payload =
        type === "MEETING"
          ? { type: "MEETING", reason, meetingDate }
          : { type: "GENERAL", reason, from, to };

      const response = await fetch("/api/member/absence/justify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data?.error || "Échec de l'envoi de la justification");
      }

      setSuccess(true);
      setReason("");
      setFrom("");
      setTo("");
      setMeetingDate("");
      setType("GENERAL");
      window.setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    // Wrapper flex-center : sur grand écran le contenu est centré dans la
    // zone main (le shell membre reserve déjà la sidebar à gauche, donc le
    // centre visuel du main est décalé — c'est volontaire pour rester
    // cohérent avec le reste du panel). Padding vertical généreux pour ne
    // pas coller le contenu au header mobile.
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 py-2 sm:gap-6 sm:py-4 lg:py-6">
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 backdrop-blur-sm sm:p-6">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-amber-300/70 sm:text-[11px]">
          Justificatifs
        </p>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
            <CalendarOff className="h-4 w-4 text-blue-400" />
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight text-slate-50 sm:text-xl">
              Justifier une absence
            </h1>
            <p className="text-xs text-slate-400 sm:text-sm">
              Signalez une absence à la communauté via Discord
            </p>
          </div>
        </div>
      </div>

      {/* ── Success / Error banners ──────────────────────────────────────── */}
      {success ? (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-5 py-4 text-emerald-300">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm font-medium">
            Justification d'absence envoyée avec succès !
          </span>
        </div>
      ) : null}
      {error ? (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/8 px-5 py-4 text-red-300">
          <XCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      ) : null}

      {/* ── Form ─────────────────────────────────────────────────────────── */}
      <form
        onSubmit={handleSubmit}
        className="space-y-5 rounded-2xl border border-white/8 bg-white/[0.03] p-5 backdrop-blur-sm sm:space-y-6 sm:p-6"
      >
        {/* ─ Sélecteur du type d'absence ─ */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Type d'absence
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(["GENERAL", "MEETING"] as const).map((t) => {
              const active = type === t;
              const isMeeting = t === "MEETING";
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                    // On reset les champs spécifiques de l'autre mode pour
                    // ne pas envoyer de données polluées au serveur.
                    if (t === "MEETING") {
                      setFrom("");
                      setTo("");
                    } else {
                      setMeetingDate("");
                    }
                  }}
                  className={`flex flex-col gap-1.5 rounded-xl border px-4 py-4 text-left transition-all ${
                    active
                      ? isMeeting
                        ? "border-amber-500/40 bg-amber-500/12 text-amber-200"
                        : "border-[#9b2335]/60 bg-[#9b2335]/20 text-rose-200"
                      : "border-white/8 bg-white/[0.04] text-slate-400 hover:border-white/15 hover:text-slate-200"
                  }`}
                >
                  <span className="flex items-center gap-2 text-sm font-semibold">
                    {isMeeting ? (
                      <CalendarDays className="h-4 w-4" />
                    ) : (
                      <CalendarClock className="h-4 w-4" />
                    )}
                    {isMeeting ? "Absence réunion" : "Absence générale"}
                  </span>
                  <span className="text-xs opacity-70">
                    {isMeeting
                      ? "Dimanche 21h — sélection rapide"
                      : "Période de début à fin — max 2 mois"}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ─ Champs selon type ─ */}
        {type === "MEETING" ? (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Réunion concernée
            </p>
            <label className="mb-1.5 block text-xs font-medium text-slate-400">
              Date de la réunion <span className="text-amber-400">*</span>
            </label>
            <div className="flex flex-wrap gap-2">
              {upcomingSundays.map((sun) => (
                <button
                  key={sun.value}
                  type="button"
                  onClick={() => setMeetingDate(sun.value)}
                  className={`rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                    meetingDate === sun.value
                      ? "border-amber-500/50 bg-amber-500/15 text-amber-200"
                      : "border-white/10 bg-white/[0.04] text-slate-300 hover:border-white/20 hover:bg-white/[0.07]"
                  }`}
                >
                  {sun.label}
                </button>
              ))}
            </div>
            {!meetingDate ? (
              <p className="mt-2 text-xs text-slate-500">
                Choisis le dimanche pour lequel tu seras absent.
              </p>
            ) : (
              <p className="mt-2 text-xs text-amber-300/80">
                ✓ Réunion sélectionnée : <strong>{
                  upcomingSundays.find((s) => s.value === meetingDate)?.label
                }</strong>
              </p>
            )}
          </div>
        ) : (
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
              Période d'absence
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Date de début <span className="text-slate-500">(optionnel)</span>
                </label>
                <input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-100 transition focus:border-[#7a1f2b]/40 focus:outline-none focus:ring-1 focus:ring-[#7a1f2b]/60"
                />
              </div>
              <div>
                <label className="mb-1.5 block text-xs font-medium text-slate-400">
                  Date de fin{" "}
                  <span className="ml-1 rounded border border-amber-500/30 bg-amber-500/20 px-1.5 py-0.5 text-[10px] text-amber-300">
                    Max 2 mois
                  </span>
                </label>
                <input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-100 transition focus:border-[#7a1f2b]/40 focus:outline-none focus:ring-1 focus:ring-[#7a1f2b]/60"
                />
              </div>
            </div>
          </div>
        )}

        {/* ─ Raison ─ */}
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-slate-400">
            Détails
          </p>
          <label className="mb-1.5 block text-sm font-medium text-slate-200">
            Raison de l'absence <span className="text-amber-400">*</span>
          </label>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            required
            placeholder="Décrivez la raison de votre absence (vacances, maladie, déplacement…)"
            rows={4}
            className="w-full resize-none rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-100 transition placeholder:text-slate-600 focus:border-[#7a1f2b]/40 focus:outline-none focus:ring-1 focus:ring-[#7a1f2b]/60"
          />
          <p className={`text-xs ${isReasonValid ? "text-slate-500" : "text-red-400/80"}`}>
            {reasonLength}/10 caractères minimum
          </p>
        </div>

        {/* ─ Boutons ─ */}
        <div className="flex flex-col-reverse gap-2.5 pt-1 sm:flex-row sm:gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06] sm:order-2"
          >
            Annuler
          </button>
          <button
            type="submit"
            disabled={!canSubmit}
            className="flex-1 rounded-xl bg-[#7a1f2b] px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-[#9a2535] disabled:cursor-not-allowed disabled:opacity-40 sm:order-1"
          >
            {loading ? "Envoi en cours..." : "Envoyer la justification"}
          </button>
        </div>
      </form>

      {/* ── Info footer ──────────────────────────────────────────────────── */}
      <div className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-4 sm:p-5">
        <Info className="mt-0.5 h-4 w-4 flex-shrink-0 text-slate-400" />
        <p className="text-xs leading-relaxed text-slate-400 sm:text-sm">
          Votre justification d'absence sera envoyée sur le canal Discord dédié et
          visible par l'équipe administrative. Vous recevrez une notification
          quand elle aura été validée ou refusée.
        </p>
      </div>
    </div>
  );
}
