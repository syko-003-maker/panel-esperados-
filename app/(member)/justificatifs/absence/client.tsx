"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Info, CalendarOff } from "lucide-react";

export function AbsencePageClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    reason: "",
    from: "",
    to: "",
  });

  const reasonLength = formData.reason.trim().length;
  const isReasonValid = reasonLength >= 10;

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setSuccess(false);

    try {
      const response = await fetch("/api/member/absence/justify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Échec de l'envoi de la justification");
      }

      setSuccess(true);
      setFormData({ reason: "", from: "", to: "" });
      setTimeout(() => setSuccess(false), 5000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inconnue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Header */}
      <div className="rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300/70 mb-2">
          Justificatifs
        </p>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-blue-500/20 bg-blue-500/10">
            <CalendarOff className="h-4 w-4 text-blue-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-50">
              Justifier une absence
            </h1>
            <p className="text-sm text-slate-400">
              Signalez une absence à la communauté via Discord
            </p>
          </div>
        </div>
      </div>

      {/* Success */}
      {success && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-5 py-4 text-emerald-300">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm font-medium">Justification d'absence envoyée avec succès !</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-500/20 bg-red-500/8 px-5 py-4 text-red-300">
          <XCircle className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm">{error}</span>
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="rounded-2xl border border-white/8 bg-white/[0.03] backdrop-blur-sm p-6 space-y-5">
        {/* Reason */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-200">
            Raison de l'absence <span className="text-amber-400">*</span>
          </label>
          <textarea
            name="reason"
            value={formData.reason}
            onChange={handleChange}
            required
            placeholder="Décrivez la raison de votre absence..."
            rows={4}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#7a1f2b]/60 focus:border-[#7a1f2b]/40 transition resize-none"
          />
          <p className={`text-xs ${isReasonValid ? "text-slate-500" : "text-red-400/80"}`}>
            {reasonLength}/10 caractères minimum
          </p>
        </div>

        {/* Date range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              Date de début{" "}
              <span className="text-slate-500 font-normal">(optionnel)</span>
            </label>
            <input
              type="date"
              name="from"
              value={formData.from}
              onChange={handleChange}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#7a1f2b]/60 focus:border-[#7a1f2b]/40 transition"
            />
          </div>
          <div className="space-y-2">
            <label className="block text-sm font-medium text-slate-200">
              Date de fin{" "}
              <span className="text-slate-500 font-normal">(optionnel)</span>
            </label>
            <input
              type="date"
              name="to"
              value={formData.to}
              onChange={handleChange}
              className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-100 focus:outline-none focus:ring-1 focus:ring-[#7a1f2b]/60 focus:border-[#7a1f2b]/40 transition"
            />
          </div>
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-1">
          <button
            type="submit"
            disabled={loading || !isReasonValid}
            className="flex-1 rounded-xl bg-[#7a1f2b] hover:bg-[#9a2535] disabled:opacity-40 disabled:cursor-not-allowed px-6 py-3 text-sm font-semibold text-white transition-colors"
          >
            {loading ? "Envoi en cours..." : "Envoyer la justification"}
          </button>
          <button
            type="button"
            onClick={() => router.back()}
            className="rounded-xl border border-white/10 bg-white/[0.03] px-5 py-3 text-sm font-medium text-slate-300 transition hover:bg-white/[0.06]"
          >
            Annuler
          </button>
        </div>
      </form>

      {/* Info */}
      <div className="flex gap-3 rounded-2xl border border-white/8 bg-white/[0.03] p-5">
        <Info className="h-4 w-4 text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-slate-400 leading-relaxed">
          Votre justification d'absence sera envoyée sur le canal Discord dédié et
          visible par l'équipe administrative.
        </p>
      </div>
    </div>
  );
}
