"use client";

import { useEffect, useState } from "react";
import { Smartphone, Monitor, Download, Check, Bell, Share, Link2, Loader2 } from "lucide-react";

type Platform = "ios" | "android" | "desktop";

interface Props {
  windowsReady: boolean;
  windowsUrl: string;
  windowsVersion: string | null;
}

/** Étape numérotée réutilisable. */
function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-[11px] font-bold text-slate-300">
        {n}
      </span>
      <span className="text-sm leading-relaxed text-slate-300">{children}</span>
    </li>
  );
}

function Card({
  highlight,
  icon,
  title,
  tag,
  children,
}: {
  highlight: boolean;
  icon: React.ReactNode;
  title: string;
  tag: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl border p-5 backdrop-blur-sm transition-colors ${
        highlight
          ? "border-red-500/40 bg-red-500/[0.06] shadow-[0_0_0_1px_rgba(239,68,68,0.15),0_20px_50px_-20px_rgba(0,0,0,0.8)]"
          : "border-white/8 bg-white/[0.03]"
      }`}
    >
      {highlight && (
        <>
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
          <span className="absolute right-3 top-3 rounded-full border border-red-500/30 bg-red-500/15 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-red-200">
            Ton appareil
          </span>
        </>
      )}
      <div className="mb-3 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-slate-200">
          {icon}
        </div>
        <div>
          <h3 className="text-base font-bold text-slate-50">{title}</h3>
          <p className="text-[11px] uppercase tracking-wide text-slate-500">{tag}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

export default function InstallClient({ windowsReady, windowsUrl, windowsVersion }: Props) {
  const [platform, setPlatform] = useState<Platform>("desktop");
  const [standalone, setStandalone] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [installing, setInstalling] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const ua = navigator.userAgent || "";
    const isIOS =
      /iphone|ipad|ipod/i.test(ua) ||
      (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /android/i.test(ua);
    setPlatform(isIOS ? "ios" : isAndroid ? "android" : "desktop");
    setStandalone(
      window.matchMedia("(display-mode: standalone)").matches ||
        (navigator as any).standalone === true
    );

    const onPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function install() {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      setDeferredPrompt(null);
    } finally {
      setInstalling(false);
    }
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText("https://losesperados.fr/install");
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  return (
    <div className="min-h-screen px-4 py-12">
      <div className="mx-auto w-full max-w-4xl">
        {/* ── En-tête ── */}
        <div className="mb-10 flex flex-col items-center gap-5 text-center">
          <div className="relative">
            <div className="absolute inset-0 scale-[1.6] rounded-2xl bg-red-700/25 blur-2xl" />
            <div className="relative rounded-2xl border border-white/10 bg-slate-900/60 p-4 backdrop-blur-sm shadow-[inset_0_1px_0_rgba(255,255,255,0.07),0_8px_32px_rgba(0,0,0,0.6)]">
              <img src="/branding/los-esperados.png" alt="Los Esperados" width={64} height={64} className="block h-16 w-16" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="bg-gradient-to-b from-white to-slate-400 bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-4xl">
              Installe l'appli Los Esperados
            </h1>
            <p className="mx-auto max-w-xl text-sm text-slate-400">
              Reçois tes alertes — sanctions, plaintes, réunions, absences — directement sur ton
              téléphone et ton PC. Installation en 30 secondes, gratuite.
            </p>
          </div>
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/[0.08]"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-300" /> : <Link2 className="h-3.5 w-3.5" />}
            {copied ? "Lien copié !" : "Copier le lien à partager"}
          </button>
        </div>

        {/* ── Déjà installé ── */}
        {standalone && (
          <div className="mb-8 flex items-center justify-center gap-2 rounded-2xl border border-emerald-500/25 bg-emerald-500/10 px-5 py-4 text-sm font-semibold text-emerald-200">
            <Check className="h-4 w-4" /> L'appli est déjà installée sur cet appareil. Pense à activer les notifications sur ton dashboard.
          </div>
        )}

        {/* ── Bouton d'installation direct (Android / desktop compatibles) ── */}
        {deferredPrompt && !standalone && (
          <div className="mb-8 flex justify-center">
            <button
              onClick={install}
              disabled={installing}
              className="inline-flex items-center gap-2.5 rounded-xl border border-red-500/30 bg-red-500/15 px-6 py-3.5 text-base font-bold text-red-100 transition-all hover:scale-[1.02] hover:bg-red-500/25 disabled:opacity-50"
            >
              {installing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Download className="h-5 w-5" />}
              Installer l'application
            </button>
          </div>
        )}

        {/* ── Cartes par plateforme ── */}
        <div className="grid gap-4 md:grid-cols-3">
          {/* iPhone */}
          <Card highlight={platform === "ios"} icon={<span className="text-lg">🍎</span>} title="iPhone / iPad" tag="via Safari">
            <ol className="space-y-2.5">
              <Step n={1}>Ouvre cette page dans <b className="text-slate-100">Safari</b></Step>
              <Step n={2}>
                Touche <b className="text-slate-100">Partager</b> <Share className="inline h-3.5 w-3.5 -translate-y-0.5" /> puis <b className="text-slate-100">« Sur l'écran d'accueil »</b>
              </Step>
              <Step n={3}>Ouvre l'appli, puis <b className="text-slate-100">Activer</b> les notifications</Step>
            </ol>
            <p className="mt-3 text-[11px] text-slate-500">iOS 16.4 ou plus récent requis.</p>
          </Card>

          {/* Android */}
          <Card highlight={platform === "android"} icon={<Smartphone className="h-5 w-5" />} title="Android" tag="via Chrome">
            <ol className="space-y-2.5">
              <Step n={1}>
                Touche <b className="text-slate-100">« Installer l'application »</b> ci-dessus (ou menu <b className="text-slate-100">⋮</b> → Installer)
              </Step>
              <Step n={2}>Confirme l'installation</Step>
              <Step n={3}>Ouvre l'appli, puis <b className="text-slate-100">Activer</b> les notifications</Step>
            </ol>
            <p className="mt-3 text-[11px] text-slate-500">Les notifs marchent même sans installer, en autorisant Chrome.</p>
          </Card>

          {/* Windows */}
          <Card highlight={platform === "desktop"} icon={<Monitor className="h-5 w-5" />} title="Windows (PC)" tag="application bureau">
            <ol className="space-y-2.5">
              <Step n={1}>Télécharge l'appli avec le bouton ci-dessous</Step>
              <Step n={2}>
                Lance le fichier → <b className="text-slate-100">« Informations complémentaires »</b> → <b className="text-slate-100">« Exécuter quand même »</b> (une fois)
              </Step>
              <Step n={3}>L'appli s'installe, se lance au démarrage et reste dans la barre des tâches — notifs même fermée</Step>
            </ol>
            <div className="mt-4">
              {windowsReady ? (
                <a
                  href={windowsUrl}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/15 px-4 py-2.5 text-sm font-bold text-sky-100 transition-colors hover:bg-sky-500/25"
                >
                  <Download className="h-4 w-4" />
                  Télécharger pour Windows{windowsVersion ? ` (v${windowsVersion})` : ""}
                </a>
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-center text-xs font-semibold text-slate-400">
                  Version Windows bientôt disponible
                </div>
              )}
              <p className="mt-2 text-[11px] text-slate-500">
                Pas de Windows ? Sur Mac/Linux, installe la version web (menu du navigateur → « Installer »).
              </p>
            </div>
          </Card>
        </div>

        {/* ── Rappel notifications ── */}
        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/[0.05] px-5 py-4">
          <Bell className="mt-0.5 h-5 w-5 shrink-0 text-amber-300" />
          <div className="text-sm text-slate-300">
            <b className="text-slate-100">Dernière étape, la plus importante :</b> une fois l'appli ouverte, va sur ton
            dashboard et clique <b className="text-slate-100">« Activer »</b> dans la carte Notifications. Sans ça, tu ne
            recevras aucune alerte. À faire sur chaque appareil.
          </div>
        </div>

        <p className="mt-8 text-center text-[11px] tracking-wide text-slate-600">Los Esperados © {new Date().getFullYear()}</p>
      </div>
    </div>
  );
}
