import { ReactNode } from "react";
import { MotionCard } from "@/components/staff/ui";

type StatCardItem = {
  label: string;
  value: ReactNode;
  tone?: "blue" | "green" | "yellow" | "red" | "gray";
  icon?: ReactNode;
  hint?: string;
};

type StatCardsProps = {
  items: StatCardItem[];
};

const toneStyles: Record<NonNullable<StatCardItem["tone"]>, { bg: string; text: string; border: string }> = {
  blue: { bg: "bg-blue-500/10", text: "text-blue-200", border: "border-blue-500/20" },
  green: { bg: "bg-emerald-500/10", text: "text-emerald-200", border: "border-emerald-500/20" },
  yellow: { bg: "bg-amber-500/10", text: "text-amber-200", border: "border-amber-500/20" },
  red: { bg: "bg-red-500/10", text: "text-red-200", border: "border-red-500/20" },
  gray: { bg: "bg-white/[0.04]", text: "text-slate-100", border: "border-white/10" },
};

export function StatCards({ items }: StatCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((item) => {
        const tone = item.tone ?? "gray";
        const styles = toneStyles[tone];
        return (
          <MotionCard
            key={item.label}
            className={`flex h-full flex-col gap-2 rounded-[22px] border p-5 shadow-[0_22px_58px_-36px_hsl(var(--sunset-surface3)/0.95)] ${styles.bg} ${styles.border}`}
          >
            <div className="flex items-center justify-between gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              <span>{item.label}</span>
              {item.icon ? <span>{item.icon}</span> : null}
            </div>
            <div className={`text-2xl font-bold ${styles.text}`}>{item.value}</div>
            {item.hint ? <div className="text-xs text-slate-500">{item.hint}</div> : null}
          </MotionCard>
        );
      })}
    </div>
  );
}
