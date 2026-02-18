"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
        throw new Error(data.error || "Failed to send justification");
      }

      setSuccess(true);
      setFormData({ reason: "", from: "", to: "" });

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
        <h1 className="text-4xl font-bold text-white">Justifier une Absence</h1>
        <p className="text-slate-400">
          Signalez une absence à la communauté via Discord
        </p>
      </div>

      {/* Success Message */}
      {success && (
        <div className="bg-green-500/20 border border-green-500/50 rounded-lg p-4 text-green-300">
          ✓ Justification d'absence envoyée avec succès !
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
        {/* Reason */}
        <div className="space-y-2">
          <label className="block text-sm font-semibold text-white">
            Raison de l'absence *
          </label>
          <textarea
            name="reason"
            value={formData.reason}
            onChange={handleChange}
            required
            placeholder="Décrivez la raison de votre absence..."
            rows={4}
            className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <p className={`text-xs ${isReasonValid ? "text-slate-400" : "text-red-400"}`}>
            {reasonLength}/10 caractères minimum
          </p>
        </div>

        {/* Date Range */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">
              Date de début (optionnel)
            </label>
            <input
              type="date"
              name="from"
              value={formData.from}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>

          <div className="space-y-2">
            <label className="block text-sm font-semibold text-white">
              Date de fin (optionnel)
            </label>
            <input
              type="date"
              name="to"
              value={formData.to}
              onChange={handleChange}
              className="w-full px-4 py-3 rounded-lg bg-slate-900 border border-slate-700 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
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
          Votre justification d'absence sera envoyée sur le canal Discord dédié
          et visible par l'équipe administrative.
        </p>
      </div>
    </div>
  );
}
