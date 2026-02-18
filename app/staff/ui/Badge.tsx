import { ReactNode } from "react";

type Tone = "green" | "red" | "yellow" | "blue" | "gray" | "orange" | "purple";

type BadgeProps = {
  children: ReactNode;
  tone?: Tone;
};

const toneClasses: Record<Tone, string> = {
  green: "bg-green-500/20 text-green-400 border border-green-500/30",
  red: "bg-red-500/20 text-red-400 border border-red-500/30",
  yellow: "bg-amber-500/20 text-amber-400 border border-amber-500/30",
  blue: "bg-blue-500/20 text-blue-400 border border-blue-500/30",
  gray: "bg-slate-500/20 text-slate-400 border border-slate-500/30",
  orange: "bg-orange-500/20 text-orange-400 border border-orange-500/30",
  purple: "bg-purple-500/20 text-purple-400 border border-purple-500/30",
};

export function Badge({ children, tone = "gray" }: BadgeProps) {
  const cls = toneClasses[tone] ?? toneClasses.gray;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}
