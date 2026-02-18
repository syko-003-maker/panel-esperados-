"use client";

import { signIn } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, Suspense } from "react";
import { logger } from "@/lib/logger";

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackUrl = searchParams?.get("callbackUrl") || "/";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleDiscordSignIn = async () => {
    setLoading(true);
    setError(null);
    try {
      await signIn("discord", {
        callbackUrl,
        redirect: true,
      });
    } catch (err) {
      logger.error("login", "Sign in error", err);
      setError("Impossible de démarrer la connexion Discord.");
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-slate-950">
      {/* Background */}
      <div className="absolute inset-0 -z-10 bg-gradient-to-br from-slate-900 via-slate-900 to-purple-900/30" />
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(1200px_circle_at_20%_10%,rgba(99,102,241,0.12),transparent_50%)]" />

      <div className="w-full max-w-sm md:max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="mx-auto mb-6 inline-flex items-center justify-center">
            <div className="rounded-2xl ring-1 ring-slate-700 bg-slate-900/50 p-4">
              <img
                src="/branding/los-esperados.png"
                alt="Los Esperados"
                width={80}
                height={80}
                className="w-20 h-20"
              />
            </div>
          </div>
          <h1 className="text-4xl font-bold text-white mb-2">Los Esperados</h1>
          <p className="text-slate-400">Panel de gestion communautaire</p>
        </div>

        {/* Card */}
        <div className="bg-slate-900/60 backdrop-blur border border-slate-700/50 rounded-xl p-6 md:p-8">
          {/* Form Header */}
          <h2 className="text-2xl font-semibold text-white mb-2 text-center">Connexion</h2>
          <p className="text-slate-400 text-center text-sm mb-6">
            Accédez au panel via Discord
          </p>

          {/* Error Display */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-red-500/10 border border-red-500/30 text-red-200 text-sm">
              {error}
            </div>
          )}

          {/* Discord Button */}
          <button
            onClick={handleDiscordSignIn}
            disabled={loading}
            className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-lg font-semibold bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 disabled:from-slate-600 disabled:to-slate-600 disabled:cursor-not-allowed text-white transition-all duration-200 mb-4"
          >
            {loading ? (
              <>
                <svg
                  className="w-5 h-5 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                  />
                </svg>
                <span>Connexion en cours...</span>
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.211.375-.444.864-.607 1.25a18.27 18.27 0 00-5.487 0c-.163-.386-.395-.875-.608-1.25a.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.08.08 0 00.087-.027c.461-.63.873-1.295 1.226-1.994a.076.076 0 00-.042-.106 13.107 13.107 0 01-1.872-.892.077.077 0 00-.008-.128 10.713 10.713 0 00.372-.294.075.075 0 00.03-.066c.328-.246.648-.5.954-.763a.075.075 0 00.092-.01 13.995 13.995 0 0011.767 0 .075.075 0 00.093.011c.305.263.626.517.954.763a.075.075 0 00.03.066c.12.09.244.179.372.294a.077.077 0 00-.006.127 13.072 13.072 0 01-1.873.892.076.076 0 00-.041.107c.352.699.764 1.364 1.225 1.994a.076.076 0 00.084.028 19.841 19.841 0 006.002-3.03.077.077 0 00.032-.054c.5-4.569-.838-8.536-3.549-12.057a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-.965-2.157-2.156 0-1.193.93-2.157 2.157-2.157 1.226 0 2.157.964 2.157 2.157 0 1.19-.93 2.155-2.157 2.155zm7.975 0c-1.183 0-2.157-.965-2.157-2.156 0-1.193.93-2.157 2.157-2.157 1.226 0 2.157.964 2.157 2.157 0 1.19-.931 2.155-2.157 2.155z" />
                </svg>
                <span>Continuer avec Discord</span>
              </>
            )}
          </button>

          {/* Footer Help Text */}
          <p className="text-center text-xs text-slate-500">
            Besoin d'aide ? Contactez un Chef / État-Major
          </p>
        </div>
      </div>
    </div>
  );
}

export default function LoginClient() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center bg-slate-950 text-white">Chargement...</div>}>
      <LoginContent />
    </Suspense>
  );
}
