import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataTile({
  label,
  value,
  tone = "default",
  className,
}: {
  label: string;
  value: ReactNode;
  tone?: "default" | "success" | "warning" | "danger" | "info";
  className?: string;
}) {
  const toneClass = {
    default: "text-slate-100 border-white/8 bg-white/[0.04]",
    success: "text-emerald-100 border-emerald-500/20 bg-emerald-500/[0.08]",
    warning: "text-amber-100 border-amber-500/20 bg-amber-500/[0.08]",
    danger: "text-red-100 border-red-500/20 bg-red-500/[0.08]",
    info: "text-rose-100 border-[#7a1f2b]/30 bg-[#7a1f2b]/[0.12]",
  }[tone];

  return (
    <div className={cn("flex h-full flex-col rounded-2xl border px-4 py-3 shadow-[0_12px_30px_rgba(2,6,23,0.18)]", toneClass, className)}>
      <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">{label}</div>
      <div className="mt-2 flex-1 text-sm leading-6">{value}</div>
    </div>
  );
}