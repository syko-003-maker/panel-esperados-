"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
        throw new Error(data.error || "Failed to send justification");
      }

      setSuccess(true);
      setFormData({ sanctionId: "", reason: "", context: "" });

      // Reset success message after 3s
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      {/* Header */}
      <div className="space-y-2">
        <h1 className="text-4xl font-bold text-white">Justifier une Sanction</h1>
        <p className="text-slate-400">
          Contester ou justifier une sanction reçue auprès de l'équipe
        </p>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 text-green-300">
          ✓ Justification de sanction envoyée avec succès !
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-500/20 border border-red-500/50 rounded-lg p-4 text-red-300">
          ✗ {error}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Sanction ID */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-white">
            ID de la Sanction (optionnel)
          </label>
          <input
            type="text"
            name="sanctionId"
            value={formData.sanctionId}
            onChange={handleChange}
            placeholder="Ex: SANC-001 ou le numéro de sanction"
            className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Context */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-white">
            Contexte (optionnel)
          </label>
          <textarea
            name="context"
            value={formData.context}
            onChange={handleChange}
            placeholder="Décrivez le contexte ou les circonstances..."
            rows={3}
            className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Reason */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-white">
            Justification *
          </label>
          <textarea
            name="reason"
            value={formData.reason}
            onChange={handleChange}
            required
            placeholder="Expliquez pourquoi vous contestez cette sanction ou justifiez votre action..."
            rows={4}
            className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className={`text-xs ${isReasonValid ? "text-slate-400" : "text-red-400"}`}>
            {reasonLength}/10 caractères minimum
          </p>
        </div>

        {/* Submit Button */}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={loading || !isReasonValid}
            className="flex-1 px-6 py-3 rounded-lg font-semibold bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 disabled:cursor-not-allowed text-white transition-colors duration-200"
          >
            {loading ? "Envoi en cours..." : "Envoyer la Justification"}
          </button>

          <button
            type="button"
            onClick={() => router.back()}
            className="px-6 py-3 rounded-lg font-semibold bg-slate-700 hover:bg-slate-600 text-white transition-colors duration-200"
          >
            Annuler
          </button>
        </div>
      </form>

      {/* Info */}
      <div className="bg-blue-500/10 border border-blue-500/30 rounded-lg p-4 space-y-2">
        <h3 className="text-white font-semibold">📌 Information</h3>
        <p className="text-sm text-blue-300">
          Votre justification sera envoyée sur le canal Discord dédié et examinée
          par l'équipe administrative. Veuillez être honnête et constructif dans
          votre justification.
        </p>
      </div>

      {/* Important Notice */}
      <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-4 space-y-2">
        <h3 className="text-yellow-400 font-semibold">⚠️ Important</h3>
        <p className="text-sm text-yellow-200">
          Les fausses justifications ou comportements inappropriés pourraient
          entraîner des sanctions supplémentaires.
        </p>
      </div>
    </div>
  );
}
