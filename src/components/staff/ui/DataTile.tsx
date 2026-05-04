import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "default" | "success" | "warning" | "danger" | "info";

const TONE_STYLES: Record<Tone, {
  ring: string;
  value: string;
  label: string;
  bar: string;
  glow: string;
  hoverShadow: string;
}> = {
  default: {
    ring: "border-white/12 bg-white/[0.04]",
    value: "text-slate-50",
    label: "text-slate-400",
    bar: "from-transparent via-white/30 to-transparent",
    glow: "rgba(255,255,255,0.08)",
    hoverShadow: "0 0 0 1px rgba(255,255,255,0.18), 0 0 32px -4px rgba(255,255,255,0.10), 0 18px 38px -10px rgba(0,0,0,0.6)",
  },
  success: {
    ring: "border-emerald-500/30 bg-emerald-500/[0.10]",
    value: "text-emerald-50",
    label: "text-emerald-300/70",
    bar: "from-transparent via-emerald-400/70 to-transparent",
    glow: "rgba(16,185,129,0.28)",
    hoverShadow: "0 0 0 1px rgba(16,185,129,0.45), 0 0 28px 0 rgba(16,185,129,0.30), 0 0 56px 4px rgba(16,185,129,0.18), 0 18px 38px -10px rgba(0,0,0,0.6)",
  },
  warning: {
    ring: "border-amber-500/30 bg-amber-500/[0.10]",
    value: "text-amber-50",
    label: "text-amber-300/70",
    bar: "from-transparent via-amber-400/80 to-transparent",
    glow: "rgba(251,191,36,0.30)",
    hoverShadow: "0 0 0 1px rgba(251,191,36,0.50), 0 0 28px 0 rgba(251,191,36,0.32), 0 0 60px 4px rgba(245,158,11,0.22), 0 18px 38px -10px rgba(0,0,0,0.6)",
  },
  danger: {
    ring: "border-red-500/30 bg-red-500/[0.10]",
    value: "text-red-50",
    label: "text-red-300/70",
    bar: "from-transparent via-red-400/80 to-transparent",
    glow: "rgba(239,68,68,0.28)",
    hoverShadow: "0 0 0 1px rgba(239,68,68,0.48), 0 0 28px 0 rgba(239,68,68,0.30), 0 0 56px 4px rgba(220,38,38,0.18), 0 18px 38px -10px rgba(0,0,0,0.6)",
  },
  info: {
    ring: "border-[#9b2335]/40 bg-[#9b2335]/[0.16]",
    value: "text-rose-50",
    label: "text-rose-300/70",
    bar: "from-transparent via-[#c93a52]/80 to-transparent",
    glow: "rgba(155,35,53,0.32)",
    hoverShadow: "0 0 0 1px rgba(220,60,90,0.50), 0 0 28px 0 rgba(220,60,90,0.30), 0 0 56px 4px rgba(155,35,53,0.20), 0 18px 38px -10px rgba(0,0,0,0.6)",
  },
};

/**
 * DataTile premium :
 *  - barre d'accent fine en haut (couleur tone)
 *  - halo de couleur en haut-droite, blur fort, opacité modérée
 *  - valeur au format text-2xl bold (au lieu de text-sm)
 *  - hover : box-shadow stacké tone-aware (ring + glow proche + halo lointain)
 *  - transition cubic-bezier 320ms cohérente avec le reste du panel
 */
export function DataTile({
  label,
  value,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: Tone;
  className?: string;
}) {
  const t = TONE_STYLES[tone];

  return (
    <div
      className={cn(
        "data-tile group relative flex h-full flex-col overflow-hidden rounded-2xl border px-4 py-3.5 shadow-[0_14px_32px_-14px_rgba(0,0,0,0.6)]",
        t.ring,
        className
      )}
      style={
        {
          ["--tile-hover-shadow" as string]: t.hoverShadow,
        } as React.CSSProperties
      }
    >
      {/* Barre d'accent en haut */}
      <div
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 h-[1.5px] bg-gradient-to-r",
          t.bar
        )}
      />

      {/* Halo coloré coin haut-droit */}
      <div
        className="pointer-events-none absolute -top-10 -right-10 h-28 w-28 rounded-full opacity-50 blur-3xl transition-opacity duration-300 group-hover:opacity-80"
        style={{ background: t.glow }}
      />

      <div className="relative">
        <div className={cn("text-[10px] font-semibold uppercase tracking-[0.20em]", t.label)}>
          {label}
        </div>
        <div className={cn("mt-1.5 text-2xl font-bold leading-none tracking-tight", t.value)}>
          {value}
        </div>
      </div>
    </div>
  );
}
