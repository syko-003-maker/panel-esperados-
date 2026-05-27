"use client";

/**
 * Composant unifié pour TOUTES les pages d'erreur du panel.
 *
 * Pourquoi ce composant ?
 *  Next.js permet plusieurs niveaux de pages d'erreur (global-error,
 *  app/error, sous-tree error, not-found, etc.). On veut le MÊME look
 *  partout : fond bordeaux dégradé + logo + code d'erreur + CTA.
 *
 * Pourquoi pas un import du logo / AppBackground ?
 *  Ce composant doit pouvoir tourner DANS un global-error.tsx (où le
 *  root layout a planté). Il ne dépend donc d'aucun composant qui
 *  pourrait lui-même crasher (BrandLogo lit fs.existsSync au build,
 *  AppBackground a des dépendances motion). On reproduit le style
 *  inline avec du CSS pur — robuste même si tout le reste explose.
 */

import { useEffect } from "react";

type ErrorScreenProps = {
  /** Petit code en haut : "Erreur 404", "Erreur 500", etc. */
  code: string;
  /** Titre principal */
  title: string;
  /** Description sous le titre */
  description?: string;
  /** Référence technique (digest Next.js) — affichée en bas en monospace */
  reference?: string | null;
  /** Boutons d'action */
  actions?: Array<{
    label: string;
    href?: string;
    onClick?: () => void;
    variant?: "primary" | "secondary";
  }>;
  /** Tonalité — change la couleur du badge code */
  tone?: "danger" | "warning" | "info";
};

const TONE_BADGE: Record<NonNullable<ErrorScreenProps["tone"]>, string> = {
  danger:
    "border-[#9b2335]/35 bg-[#9b2335]/15 text-amber-300",
  warning:
    "border-amber-500/35 bg-amber-500/15 text-amber-200",
  info:
    "border-cyan-500/30 bg-cyan-500/10 text-cyan-200",
};

export function ErrorScreen({
  code,
  title,
  description,
  reference,
  actions = [],
  tone = "danger",
}: ErrorScreenProps) {
  // Log technique côté client pour diag (sans casser l'UX).
  useEffect(() => {
    if (reference) {
      // eslint-disable-next-line no-console
      console.error(`[ErrorScreen] ref=${reference}`);
    }
  }, [reference]);

  const badgeClass = TONE_BADGE[tone];

  return (
    <div
      className="relative flex min-h-screen items-center justify-center overflow-hidden bg-[#0b0305] px-4 py-12"
      style={{
        backgroundImage:
          "radial-gradient(circle at 50% 35%, rgba(155,35,53,0.18) 0%, rgba(155,35,53,0.06) 35%, transparent 70%), linear-gradient(180deg, #0b0305 0%, #060203 100%)",
      }}
    >
      {/* Décor : grille subtile en arrière-plan + halo bordeaux radial */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute left-1/2 top-1/2 h-[700px] w-[700px] -translate-x-1/2 -translate-y-1/2 rounded-full"
        style={{
          background:
            "radial-gradient(circle, rgba(196,42,67,0.12) 0%, transparent 70%)",
        }}
      />

      {/* Contenu */}
      <div className="relative z-10 flex w-full max-w-lg flex-col items-center text-center">
        {/* Logo Los Esperados — img direct (sert depuis /public, marche même
            si React/Next ont planté ; un broken src n'engendre pas de crash). */}
        <div
          className="mb-8 flex h-20 w-20 items-center justify-center overflow-hidden rounded-3xl border border-white/10"
          style={{
            background:
              "linear-gradient(140deg, rgba(122,31,43,0.40), rgba(196,42,67,0.18) 60%, rgba(245,158,11,0.10))",
            boxShadow:
              "0 20px 60px -20px rgba(155,35,53,0.5), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/branding/los-esperados.png"
            alt="Los Esperados"
            width={80}
            height={80}
            style={{ width: "100%", height: "100%", objectFit: "contain" }}
          />
        </div>

        {/* Badge code */}
        <div className={`mb-3 inline-flex items-center gap-2 rounded-full border px-4 py-1.5 ${badgeClass}`}>
          <span className="text-[11px] font-bold uppercase tracking-[0.22em]">{code}</span>
        </div>

        {/* Titre */}
        <h1 className="mb-3 text-4xl font-bold tracking-tight text-slate-50 sm:text-5xl">
          {title}
        </h1>

        {/* Description */}
        {description ? (
          <p className="mb-8 max-w-md text-base leading-relaxed text-slate-400">
            {description}
          </p>
        ) : null}

        {/* Actions */}
        {actions.length > 0 ? (
          <div className="flex flex-wrap items-center justify-center gap-3">
            {actions.map((action, idx) => {
              const isPrimary = (action.variant ?? "primary") === "primary";
              const className = isPrimary
                ? "inline-flex items-center gap-2 rounded-2xl border border-[#9b2335]/40 bg-gradient-to-r from-[#7a1f2b] to-[#9b2335] px-6 py-3 text-sm font-semibold text-white shadow-[0_12px_30px_-10px_rgba(155,35,53,0.6)] transition-all hover:-translate-y-0.5 hover:shadow-[0_16px_40px_-10px_rgba(155,35,53,0.8)]"
                : "inline-flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-6 py-3 text-sm font-semibold text-slate-200 transition-colors hover:bg-white/[0.08]";

              if (action.href) {
                return (
                  <a key={idx} href={action.href} className={className}>
                    {action.label}
                  </a>
                );
              }
              return (
                <button key={idx} type="button" onClick={action.onClick} className={className}>
                  {action.label}
                </button>
              );
            })}
          </div>
        ) : null}

        {/* Référence */}
        {reference ? (
          <p className="mt-8 select-all font-mono text-[11px] text-slate-600">
            Réf. : {reference}
          </p>
        ) : null}
      </div>
    </div>
  );
}
