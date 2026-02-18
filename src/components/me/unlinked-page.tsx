"use client";

import Link from "next/link";
import { AlertCircle, LogOut, ArrowRight, Loader2, CheckCircle, Zap } from "lucide-react";
import { useState } from "react";

type UnlinkedPageProps = {
  canAccessStaff?: boolean;
};

// Parse Steam URL to extract SteamID64
function parseSteamUrl(input: string): string | null {
  // Direct SteamID64 (17 digits)
  if (/^[0-9]{17}$/.test(input.trim())) {
    return input.trim();
  }
  
  // Try to parse Steam profile URL: /profiles/[steamid64]
  const profileMatch = input.match(/\/profiles\/(\d{17})/);
  if (profileMatch) {
    return profileMatch[1];
  }
  
  // Vanity URL pattern: /profiles/[vanity] or id/[vanity]
  const vanityMatch = input.match(/\/profiles\/([a-zA-Z0-9_-]+)/) || input.match(/id\/([a-zA-Z0-9_-]+)/);
  if (vanityMatch) {
    return null; // Cannot parse - return null (user needs to use direct URL)
  }
  
  return null;
}

export function UnlinkedPage({ canAccessStaff = false }: UnlinkedPageProps) {
  const [requestState, setRequestState] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [steamId, setSteamId] = useState<string>("");
  const [steamIdError, setSteamIdError] = useState<string>("");

  const handleLinkRequest = async () => {
    setRequestState("loading");
    setErrorMsg("");
    setSteamIdError("");

    try {
      // Validate and parse SteamID if provided
      let finalSteamId: string | undefined;
      if (steamId.trim()) {
        const parsed = parseSteamUrl(steamId.trim());
        if (!parsed) {
          setSteamIdError("Format Steam invalide. Utilisez: SteamID64 (17 chiffres) ou https://steamcommunity.com/profiles/[steamid64]");
          setRequestState("error");
          setErrorMsg("Veuillez corriger le SteamID");
          return;
        }
        finalSteamId = parsed;
      }

      const res = await fetch("/api/contact/link-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ steamId: finalSteamId }),
      });

      const data = await res.json();

      if (!res.ok) {
        setErrorMsg(data.error || "Une erreur est survenue");
        setRequestState("error");
        return;
      }

      setRequestState("success");
      setSteamId(""); // Clear input on success
      // Auto-reset après 5 secondes
      setTimeout(() => setRequestState("idle"), 5000);
    } catch (err) {
      setErrorMsg("Erreur de connexion");
      setRequestState("error");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-12 bg-gradient-to-br from-background via-black to-background">
      {/* Background Effect */}
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-96 h-96 bg-red-500/10 rounded-full blur-3xl opacity-20" />
        <div className="absolute bottom-0 right-0 w-96 h-96 bg-cyan-500/5 rounded-full blur-3xl opacity-10" />
      </div>

      {/* Main Card */}
      <div className="w-full max-w-md space-y-8">
        {/* Icon & Header */}
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="absolute inset-0 bg-red-500/40 blur-lg rounded-full" />
            <div className="relative w-16 h-16 flex items-center justify-center rounded-2xl bg-gradient-to-br from-red-500/20 to-orange-500/20 border border-red-500/30">
              <AlertCircle className="w-8 h-8 text-red-400" />
            </div>
          </div>
          
          <div className="text-center space-y-2">
            <h1 className="text-3xl font-bold text-red-300 tracking-tight">
              Compte Non Lié
            </h1>
            <p className="text-base text-gray-400">
              Votre compte Discord n'est pas encore associé à un profil.
            </p>
          </div>
        </div>

        {/* Content Card */}
        <div className="backdrop-blur-xl bg-red-500/5 border border-red-500/20 rounded-2xl p-6 space-y-4">
          <p className="text-sm text-gray-300 leading-relaxed">
            Pour accéder à votre espace personnel, vous devez d'abord lier votre compte Discord à votre profil de joueur.
          </p>
          
          <div className="h-px bg-gradient-to-r from-transparent via-white/10 to-transparent" />

          <div className="space-y-2 text-sm text-gray-400">
            <p className="font-medium text-white">Les étapes :</p>
            <ol className="list-decimal list-inside space-y-1 ml-2">
              <li>Contactez un Chef / Recruteur / État-Major sur Discord</li>
              <li>Ils valideront votre demande de liaison</li>
              <li>Revenez accéder à votre tableau de bord</li>
            </ol>
          </div>

          {/* SteamID Input (Optional) */}
          <div className="space-y-2 pt-4 border-t border-red-500/10">
            <label className="text-xs font-medium text-gray-300">
              SteamID (Optionnel)
            </label>
            <input
              type="text"
              value={steamId}
              onChange={(e) => {
                setSteamId(e.target.value);
                setSteamIdError("");
              }}
              placeholder="SteamID64 ou URL profil Steam"
              className="w-full px-3 py-2 rounded-lg bg-slate-900/40 border border-slate-800 text-foreground placeholder-gray-500 text-sm focus:outline-none focus:border-red-500/50 focus:ring-1 focus:ring-red-500/30"
            />
            <p className="text-xs text-gray-500">
              Collez votre SteamID64 (17 chiffres) ou l'URL: https://steamcommunity.com/profiles/[steamid64]
            </p>
            {steamIdError && (
              <p className="text-xs text-red-400">{steamIdError}</p>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="space-y-3">
          {/* Link Request Button */}
          <button
            onClick={handleLinkRequest}
            disabled={requestState !== "idle" && requestState !== "error"}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold bg-gradient-to-r from-red-500 to-orange-500 hover:from-red-600 hover:to-orange-600 disabled:opacity-75 disabled:cursor-not-allowed text-white transition-all duration-200 shadow-lg shadow-red-500/20 hover:shadow-lg hover:shadow-red-500/40"
          >
            {requestState === "loading" && (
              <Loader2 className="w-5 h-5 animate-spin" />
            )}
            {requestState === "success" && (
              <CheckCircle className="w-5 h-5" />
            )}
            {requestState !== "loading" && requestState !== "success" && (
              <Zap className="w-4 h-4 opacity-60" />
            )}
            <span>
              {requestState === "loading"
                ? "Envoi..."
                : requestState === "success"
                  ? "✅ Demande envoyée"
                  : "Demander la liaison"}
            </span>
          </button>

          {/* Error Message */}
          {requestState === "error" && errorMsg && (
            <div className="flex items-start gap-2 px-4 py-3 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-sm">
              <AlertCircle className="w-5 h-5 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium">Erreur</p>
                <p className="text-xs text-red-200">{errorMsg}</p>
              </div>
            </div>
          )}

          {/* Sign Out Button */}
          <Link
            href="/auth/signout"
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl font-semibold bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 text-gray-300 hover:text-white transition-all duration-200"
          >
            <LogOut className="w-5 h-5" />
            Se Déconnecter
          </Link>
        </div>
      </div>
    </div>
  );
}
