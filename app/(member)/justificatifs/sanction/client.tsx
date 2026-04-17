"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, XCircle, Info, AlertTriangle, Scale } from "lucide-react";

export function SanctionPageClient() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const [formData, setFormData] = useState({
    sanctionId: "",
    reason: "",
    context: "",
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
      const response = await fetch("/api/member/sanction/justify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Échec de l'envoi de la justification");
      }

      setSuccess(true);
      setFormData({ sanctionId: "", reason: "", context: "" });
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
          <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-red-500/20 bg-red-500/10">
            <Scale className="h-4 w-4 text-red-400" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-50">
              Justifier une sanction
            </h1>
            <p className="text-sm text-slate-400">
              Contester ou justifier une sanction reçue auprès de l'équipe
            </p>
          </div>
        </div>
      </div>

      {/* Success */}
      {success && (
        <div className="flex items-center gap-3 rounded-2xl border border-emerald-500/20 bg-emerald-500/8 px-5 py-4 text-emerald-300">
          <CheckCircle2 className="h-5 w-5 flex-shrink-0" />
          <span className="text-sm font-medium">Justification de sanction envoyée avec succès !</span>
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
        {/* Sanction ID */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-200">
            Type de sanction reçue{" "}
            <span className="text-slate-500 font-normal">(optionnel)</span>
          </label>
          <input
            type="text"
            name="sanctionId"
            value={formData.sanctionId}
            onChange={handleChange}
            placeholder="Ex : Warn, Jail, Ban, Avertissement, Démote..."
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#7a1f2b]/60 focus:border-[#7a1f2b]/40 transition"
          />
        </div>

        {/* Context */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-200">
            Contexte{" "}
            <span className="text-slate-500 font-normal">(optionnel)</span>
          </label>
          <textarea
            name="context"
            value={formData.context}
            onChange={handleChange}
            placeholder="Décrivez le contexte ou les circonstances..."
            rows={3}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#7a1f2b]/60 focus:border-[#7a1f2b]/40 transition resize-none"
          />
        </div>

        {/* Reason */}
        <div className="space-y-2">
          <label className="block text-sm font-medium text-slate-200">
            Justification <span className="text-amber-400">*</span>
          </label>
          <textarea
            name="reason"
            value={formData.reason}
            onChange={handleChange}
            required
            placeholder="Expliquez pourquoi vous contestez cette sanction ou justifiez votre action..."
            rows={4}
            className="w-full rounded-xl border border-white/10 bg-black/40 px-4 py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-[#7a1f2b]/60 focus:border-[#7a1f2b]/40 transition resize-none"
          />
          <p className={`text-xs ${isReasonValid ? "text-slate-500" : "text-red-400/80"}`}>
            {reasonLength}/10 caractères minimum
          </p>
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
          Votre justification sera envoyée sur le canal Discord dédié et examinée
          par l'équipe administrative. Soyez honnête et constructif dans votre
          justification.
        </p>
      </div>

      {/* Warning */}
      <div className="flex gap-3 rounded-2xl border border-amber-500/15 bg-amber-500/5 p-5">
        <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
        <p className="text-sm text-amber-300/80 leading-relaxed">
          Les fausses justifications ou comportements inappropriés peuvent entraîner
          des sanctions supplémentaires.
        </p>
      </div>
    </div>
  );
}
