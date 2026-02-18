"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";
import { CheckCircle2, Loader2, AlertCircle } from "lucide-react";

const STEAMID64_REGEX = /^[0-9]{17}$/;

function parseSteamInput(value: string): { steamId: string; error?: string } {
  const trimmed = value.trim();
  if (!trimmed) return { steamId: "" };

  if (STEAMID64_REGEX.test(trimmed)) {
    return { steamId: trimmed };
  }

  try {
    const url = new URL(trimmed);
    const host = url.hostname.toLowerCase();
    if (!host.includes("steamcommunity.com")) {
      return { steamId: "", error: "URL Steam invalide." };
    }
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "profiles" && parts[1] && STEAMID64_REGEX.test(parts[1])) {
      return { steamId: parts[1] };
    }
    if (parts[0] === "id") {
      return {
        steamId: "",
        error: "Les URL vanity /id/ ne sont pas supportées. Collez une URL /profiles/… (SteamID64) ou votre SteamID64.",
      };
    }

    return { steamId: "", error: "URL Steam invalide. Utilisez /profiles/… (SteamID64)." };
  } catch {
    return { steamId: "", error: "Entrez un SteamID64 (17 chiffres) ou une URL /profiles/…" };
  }
}

export function NonLinkedCta() {
  const [requestState, setRequestState] = useState<
    "idle" | "loading" | "success" | "already-pending" | "error"
  >("idle");
  const [errorMsg, setErrorMsg] = useState<string>("");
  const [steamInput, setSteamInput] = useState<string>("");
  const [steamId, setSteamId] = useState<string>("");
  const [steamIdError, setSteamIdError] = useState<string>("");

  const handleSteamIdChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSteamInput(value);

    const parsed = parseSteamInput(value);
    setSteamId(parsed.steamId);
    setSteamIdError(parsed.error ?? "");
  };

  const handleLinkRequest = async () => {
    // Validate steam input if provided
    const parsed = parseSteamInput(steamInput);
    if (parsed.error) {
      setSteamIdError(parsed.error);
      return;
    }

    setRequestState("loading");
    setErrorMsg("");

    try {
      const res = await fetch("/api/contact/link-request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          steamId: steamId || undefined,
        }),
      });

      const data = await res.json();

      if (res.status === 409) {
        // Already pending
        setRequestState("already-pending");
        return;
      }

      if (!res.ok) {
        setErrorMsg(data.error || "Une erreur est survenue");
        setRequestState("error");
        return;
      }

      setRequestState("success");
      setSteamInput("");
      setSteamId(""); // Clear form
      // Auto-reset après 5 secondes
      setTimeout(() => setRequestState("idle"), 5000);
    } catch (err) {
      setErrorMsg("Erreur de connexion");
      setRequestState("error");
    }
  };

  const handleLogout = async () => {
    await signOut({ redirect: true, callbackUrl: "/login" });
  };

  return (
    <div className="p-6">
      <div className="max-w-lg mx-auto">
        {/* Main Card */}
        <div className="bg-gradient-to-br from-red-950/40 to-zinc-900 border border-red-500/30 rounded-lg p-8 space-y-6">
          {/* Icon + Title */}
          <div className="text-center space-y-3">
            <div className="text-red-400 text-6xl mx-auto w-fit ring-1 ring-red-500/30 rounded-full w-20 h-20 flex items-center justify-center">🔗</div>
            <h1 className="text-3xl font-bold text-red-400">Compte non lié</h1>
            <p className="text-slate-300 text-sm leading-relaxed">
              Votre compte n'est pas encore lié à un membre. Contactez un Chef, un Recruteur ou l'État-Major sur Discord pour demander la liaison.
            </p>
          </div>

          {/* SteamID64 Input Field */}
          <div className="space-y-2">
            <label htmlFor="steamId" className="text-sm font-medium text-foreground">
              SteamID64 <span className="text-muted-foreground">(optionnel)</span>
            </label>
            <input
              id="steamId"
              type="text"
              placeholder="7656119xxxxxxxxxx ou URL /profiles/..."
              value={steamInput}
              onChange={handleSteamIdChange}
              disabled={requestState === "loading"}
              className={`w-full px-4 py-2 rounded-lg bg-slate-900/40 border text-foreground placeholder:text-muted-foreground transition ${
                steamIdError
                  ? "border-red-500/50 focus:ring-2 focus:ring-red-500/40"
                  : "border-slate-800 focus:ring-2 focus:ring-red-500/30"
              } focus:outline-none disabled:opacity-50`}
            />
            {steamIdError && (
              <p className="text-xs text-red-400">{steamIdError}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Collez votre SteamID64 (17 chiffres) ou une URL Steam /profiles/…
            </p>
          </div>

          {/* Primary Action Button */}
          <button
            onClick={handleLinkRequest}
            disabled={requestState === "loading" || !!steamIdError}
            className={`w-full py-3 px-4 rounded-lg font-semibold transition flex items-center justify-center gap-2 ${
              requestState === "success"
                ? "bg-red-500/20 text-red-300 border border-red-500/30"
                : requestState === "already-pending"
                  ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                  : requestState === "error"
                    ? "bg-red-500/20 text-red-300 border border-red-500/30"
                    : "bg-red-600 text-white border border-red-700 hover:bg-red-500 active:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
            }`}
          >
            {requestState === "loading" && (
              <Loader2 className="w-4 h-4 animate-spin" />
            )}
            {requestState === "success" && (
              <CheckCircle2 className="w-4 h-4" />
            )}
            {requestState === "already-pending" && (
              <AlertCircle className="w-4 h-4" />
            )}
            {requestState === "error" && (
              <AlertCircle className="w-4 h-4" />
            )}
            {requestState === "success"
              ? "Demande envoyée ✓"
              : requestState === "already-pending"
                ? "Demande déjà en attente..."
                : requestState === "error"
                  ? "Une erreur s'est produite"
                  : "Demander la liaison"}
          </button>

          {/* Secondary Action: Logout */}
          <button
            onClick={handleLogout}
            className="w-full py-2 px-4 rounded-lg font-semibold text-sm transition border border-red-500/40 text-red-400 hover:bg-red-500/10 hover:border-red-500/60"
          >
            <span>🚪</span> Déconnexion
          </button>

          {/* Error Message */}
          {requestState === "error" && errorMsg && (
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-300">
              {errorMsg}
            </div>
          )}

          {/* Info Box */}
          <div className="bg-slate-900/50 border border-slate-700 rounded-lg p-4 text-xs text-slate-400 space-y-2">
            <div>
              <strong className="text-slate-300">Étape 1:</strong> Entrez votre SteamID64 (17 chiffres) et cliquez sur le bouton pour demander la liaison.
            </div>
            <div>
              <strong className="text-slate-300">Étape 2:</strong> Ou contactez directement un Chef, Recruteur ou État-Major sur Discord.
            </div>
            <div>
              <strong className="text-slate-300">Étape 3:</strong> Une fois approuvé, vous aurez accès à la Banque et Justificatifs.
            </div>
          </div>

          {/* Help Text */}
          <div className="text-xs text-slate-500 text-center">
            Vous avez besoin d'aide?{" "}
            <span className="text-slate-400">Contactez un staff sur Discord</span>
          </div>
        </div>
      </div>
    </div>
  );
}
