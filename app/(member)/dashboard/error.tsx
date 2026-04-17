"use client";

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center space-y-3">
      <p className="text-base font-semibold text-red-300">
        ⚠️ Impossible de charger le tableau de bord
      </p>
      <p className="text-sm text-red-400/80">
        {error.message || "Une erreur inattendue est survenue."}
      </p>
      <button
        onClick={reset}
        className="mt-2 inline-block rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
      >
        Réessayer
      </button>
    </div>
  );
}
