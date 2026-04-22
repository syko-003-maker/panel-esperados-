"use client";

export default function MemberLayoutError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#0b0305]">
      <div className="max-w-md w-full rounded-2xl border border-red-500/30 bg-red-500/10 p-8 text-center space-y-4">
        <p className="text-base font-semibold text-red-300">
          ⚠️ Erreur de chargement
        </p>
        <p className="text-sm text-red-400/80">
          {error.message || "Une erreur inattendue s'est produite lors du chargement du panel."}
        </p>
        {error.digest && (
          <p className="text-xs text-red-500/50 font-mono">Ref : {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-2 inline-block rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-2 text-sm font-medium text-red-300 transition hover:bg-red-500/20"
        >
          Réessayer
        </button>
      </div>
    </div>
  );
}
