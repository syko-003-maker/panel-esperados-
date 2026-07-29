import React from "react";
import { cn } from "@/lib/utils";
import { MotionCard } from "./motion";

interface SectionCardProps {
  title?: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

/**
 * Section premium :
 *  - barre d'accent bordeaux→ambre en haut (visible mais fine)
 *  - halos radial bordeaux (top-right) et ambre (bottom-left) en couches
 *  - icon container en gradient bordeaux + glow + inner highlight
 *  - titre légèrement plus grand avec text-shadow subtil
 *
 * NOTE : SectionCard est un conteneur passif (pas cliquable). On NE met
 * PAS `premium-card`/`premium-card-bordeaux` ici car ces classes appliquent
 * un `transform: translate3d(0,-4px,0)` au survol → quand l'utilisateur
 * passe la souris sur un élément interactif à l'intérieur (ligne, bouton…),
 * le whole card se soulève, le texte se ré-rastérise en subpixel → effet
 * de "flou" perçu pendant les 220ms d'animation. Seul `premium-surface-
 * elevated` reste : il ne fait que poser un backdrop-blur statique.
 */
export function SectionCard({ title, description, icon: Icon, actions, children, className }: SectionCardProps) {
  return (
    <MotionCard
      className={cn(
        "app-card premium-surface-elevated relative overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,hsl(var(--sunset-surface)/0.72),hsl(var(--sunset-surface2)/0.84))] shadow-[0_28px_64px_-32px_hsl(var(--sunset-surface2)/0.85),0_0_0_1px_rgba(255,255,255,0.03)]",
        className
      )}
    >
      {/* Barre d'accent bordeaux→ambre en haut */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r from-transparent via-[hsl(var(--sunset-magenta))]/65 to-transparent" />

      {/* Halos radial — plus contrastés que la version précédente */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(245,158,11,0.10),transparent_28%),radial-gradient(circle_at_bottom_left,hsl(var(--sunset-magenta)/0.08),transparent_38%),linear-gradient(180deg,rgba(255,255,255,0.025),transparent_45%)]" />

      {(title || description || actions) && (
        <div className="relative flex flex-col gap-3 border-b border-white/8 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-[hsl(var(--sunset-deep))]/45 bg-gradient-to-br from-[hsl(var(--sunset-deep))]/35 to-[#4a0f18]/20 shadow-[0_8px_22px_-6px_hsl(var(--sunset-magenta)/0.55),inset_0_1px_0_rgba(255,255,255,0.07)]">
                <Icon className="w-5 h-5 text-amber-300 drop-shadow-[0_0_4px_rgba(245,158,11,0.45)]" />
              </div>
            )}
            <div className="space-y-1">
              {title && (
                <h2 className="text-[18px] font-semibold tracking-tight text-slate-50 [text-shadow:0_1px_0_hsl(var(--sunset-surface2)/0.4)]">
                  {title}
                </h2>
              )}
              {description && (
                <p className="text-[13px] leading-5 text-slate-400">{description}</p>
              )}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="relative p-6">{children}</div>
    </MotionCard>
  );
}
