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
    default: "text-slate-100 border-white/10 bg-white/[0.05]",
    success: "text-emerald-100 border-emerald-500/25 bg-emerald-500/[0.10]",
    warning: "text-amber-100 border-amber-500/25 bg-amber-500/[0.10]",
    danger: "text-red-100 border-red-500/25 bg-red-500/[0.10]",
    info: "text-rose-100 border-[#9b2335]/35 bg-[#9b2335]/[0.14]",
  }[tone];

  return (
    <div className={cn("flex h-full flex-col rounded-2xl border px-4 py-3 shadow-[0_12px_30px_rgba(2,6,23,0.18)] transition-all duration-200 hover:scale-[1.02] hover:shadow-[0_16px_40px_rgba(2,6,23,0.30)]", toneClass, className)}>
      <div className="text-[10px] font-semibold uppercase tracking-[0.20em] text-slate-500">{label}</div>
      <div className="mt-2 flex-1 text-sm leading-6">{value}</div>
    </div>
  );
}