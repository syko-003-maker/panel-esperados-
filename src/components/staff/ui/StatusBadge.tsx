import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  neutral: "border-white/10 bg-white/[0.06] text-slate-200",
  info: "border-[#7a1f2b]/35 bg-[#7a1f2b]/15 text-rose-200",
  success: "border-emerald-500/30 bg-emerald-500/12 text-emerald-200",
  warning: "border-amber-500/30 bg-amber-500/12 text-amber-200",
  danger: "border-red-500/30 bg-red-500/12 text-red-200",
  accent: "border-amber-500/30 bg-amber-500/10 text-amber-200",
} as const;

export function StatusBadge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: keyof typeof TONES;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-semibold tracking-wide",
        TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}