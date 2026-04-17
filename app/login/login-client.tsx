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
      await signIn("discord", { callbackUrl, redirect: true });
    } catch (err) {
      logger.error("login", "Sign in error", err);
      setError("Impossible de démarrer la connexion Discord.");
      setLoading(false);
    }
  };

  return (
    /* Pas de bg sur ce div — AppBackground (root layout) gère le fond */
    <div className="min-h-screen flex items-center justify-center px-4 py-12">

      <div className="w-full max-w-sm">

        {/* ── Logo ── */}
        <div className="flex flex-col items-center mb-8 gap-5">
          <div className="relative">
            {/* Halo rouge derrière le logo */}
            <div className="absolute inset-0 rounded-2xl bg-red-700/25 blur-2xl scale-[1.6]" />
            {/* Encadrement premium */}
            <div className="relative rounded-2xl border border-white/10 bg-slate-900/60 backdrop-blur-sm p-5
                            shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_8px_32px_rgba(0,0,0,0.6)]">
              <img
                src="/branding/los-esperados.png"
                alt="Los Esperados"
                width={72}
                height={72}
                className="w-18 h-18 block"
              />
            </div>
          </div>

          <div className="text-center space-y-1">
            <h1 className="text-3xl font-bold tracking-tight
                           bg-gradient-to-b from-white to-slate-400 bg-clip-text text-transparent">
              Los Esperados
            </h1>
            <p className="text-sm text-slate-500 tracking-wide">Panel de gestion</p>
          </div>
        </div>

        {/* ── Carte de connexion ── */}
        <div className="relative overflow-hidden rounded-2xl border border-white/8
                        bg-white/[0.04] backdrop-blur-xl
                        shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_40px_80px_-20px_rgba(0,0,0,0.85)]">

          {/* Liseré supérieur néon */}
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/30 to-transparent" />

          <div className="px-6 py-8 space-y-6">

            {/* En-tête carte */}
            <div className="text-center space-y-1">
              <h2 className="text-xl font-semibold text-slate-100">Connexion</h2>
              <p className="text-xs text-slate-500">Accédez au panel via votre compte Discord</p>
            </div>

            {/* Erreur */}
            {error && (
              <div className="px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/25 text-red-300 text-sm flex gap-2 items-start">
                <span className="shrink-0 mt-0.5">⚠</span>
                <span>{error}</span>
              </div>
            )}

            {/* Bouton Discord */}
            <button
              onClick={handleDiscordSignIn}
              disabled={loading}
              className="group w-full flex items-center justify-center gap-3 px-5 py-3.5 rounded-xl
                         font-semibold text-sm text-white
                         bg-indigo-600 hover:bg-indigo-500
                         shadow-[0_2px_16px_rgba(99,102,241,0.22)]
                         hover:shadow-[0_4px_24px_rgba(99,102,241,0.38)]
                         hover:scale-[1.015] active:scale-[0.99]
                         transition-all duration-200
                         disabled:opacity-50 disabled:cursor-not-allowed
                         disabled:hover:scale-100 disabled:hover:shadow-none"
            >
              {loading ? (
                <>
                  <svg className="w-5 h-5 animate-spin shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Connexion en cours…</span>
                </>
              ) : (
                <>
                  {/* Logo Discord */}
                  <svg className="w-5 h-5 shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.211.375-.444.864-.607 1.25a18.27 18.27 0 00-5.487 0c-.163-.386-.395-.875-.608-1.25a.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.08.08 0 00.087-.027c.461-.63.873-1.295 1.226-1.994a.076.076 0 00-.042-.106 13.107 13.107 0 01-1.872-.892.077.077 0 00-.008-.128 10.713 10.713 0 00.372-.294.075.075 0 00.03-.066c.328-.246.648-.5.954-.763a.075.075 0 00.092-.01 13.995 13.995 0 0011.767 0 .075.075 0 00.093.011c.305.263.626.517.954.763a.075.075 0 00.03.066c.12.09.244.179.372.294a.077.077 0 00-.006.127 13.072 13.072 0 01-1.873.892.076.076 0 00-.041.107c.352.699.764 1.364 1.225 1.994a.076.076 0 00.084.028 19.841 19.841 0 006.002-3.03.077.077 0 00.032-.054c.5-4.569-.838-8.536-3.549-12.057a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-.965-2.157-2.156 0-1.193.93-2.157 2.157-2.157 1.226 0 2.157.964 2.157 2.157 0 1.19-.93 2.155-2.157 2.155zm7.975 0c-1.183 0-2.157-.965-2.157-2.156 0-1.193.93-2.157 2.157-2.157 1.226 0 2.157.964 2.157 2.157 0 1.19-.931 2.155-2.157 2.155z" />
                  </svg>
                  <span>Continuer avec Discord</span>
                </>
              )}
            </button>

            {/* Aide */}
            <p className="text-center text-xs text-slate-600">
              Besoin d'aide ?&nbsp;
              <span className="text-slate-500">Contactez un Chef ou État-Major</span>
            </p>
          </div>

          {/* Liseré inférieur */}
          <div className="absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-white/5 to-transparent" />
        </div>

        {/* Signature bas de page */}
        <p className="mt-6 text-center text-[11px] text-slate-700 tracking-wide">
          Los Esperados © {new Date().getFullYear()}
        </p>

      </div>
    </div>
  );
}

export default function LoginClient() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center text-slate-500 text-sm">
        Chargement…
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
