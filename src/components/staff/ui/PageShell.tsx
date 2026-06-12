import React from "react";
import { MotionSection } from "./motion";

interface PageShellProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

/**
 * PageShell premium :
 *  - bandeau d'en-tête plus contrasté
 *  - barre d'accent bordeaux→ambre tout en haut + ligne d'accent sous le titre
 *  - icon container avec gradient bordeaux + glow + ring intérieur
 *  - titre avec gradient text amber→white pour donner du caractère
 *  - description repositionnée sous le titre (lisibilité)
 */
export function PageShell({ title, description, icon: Icon, actions, children }: PageShellProps) {
  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <MotionSection>
        <div className="premium-surface-elevated relative overflow-hidden rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(14,5,7,0.82),rgba(10,3,5,0.90))] px-5 py-5 shadow-[0_24px_64px_-28px_rgba(2,0,1,0.92),0_0_0_1px_rgba(255,255,255,0.025)] sm:px-6">
          {/* Top accent bar bordeaux→ambre */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#9b2335]/70 to-transparent" />

          {/* Halos plus visibles que la version précédente */}
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(122,31,43,0.28),transparent_30%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.10),transparent_36%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent_40%)]" />

          <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              {Icon && (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-[#9b2335]/45 bg-gradient-to-br from-[#9b2335]/35 to-[#5a1620]/20 shadow-[0_10px_28px_-6px_rgba(155,35,53,0.55),inset_0_1px_0_rgba(255,255,255,0.08)]">
                  <Icon className="h-[22px] w-[22px] text-amber-300 drop-shadow-[0_0_5px_rgba(245,158,11,0.50)]" />
                </div>
              )}
              <div className="space-y-1">
                <h1 className="text-2xl font-bold leading-tight tracking-tight text-slate-50 sm:text-[26px]">
                  {title}
                </h1>
                {description && (
                  <p className="max-w-2xl text-[13px] leading-5 text-slate-300/85">{description}</p>
                )}
                {/* Ligne d'accent sous le titre */}
                <div className="mt-2 h-px w-16 bg-gradient-to-r from-[#9b2335]/80 via-amber-500/40 to-transparent" />
              </div>
            </div>
            {actions && <div className="relative flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
          </div>
        </div>
      </MotionSection>

      <MotionSection delay={0.05}>
        <div className="space-y-6">{children}</div>
      </MotionSection>
    </div>
  );
}
