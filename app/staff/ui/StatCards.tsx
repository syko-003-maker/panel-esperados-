import { ReactNode } from "react";

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
  blue: { bg: "bg-blue-50", text: "text-blue-800", border: "border-blue-200" },
  green: { bg: "bg-green-50", text: "text-green-800", border: "border-green-200" },
  yellow: { bg: "bg-amber-50", text: "text-amber-800", border: "border-amber-200" },
  red: { bg: "bg-red-50", text: "text-red-800", border: "border-red-200" },
  gray: { bg: "bg-slate-900/20", text: "text-foreground", border: "border-slate-800" },
};

export function StatCards({ items }: StatCardsProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
      {items.map((item) => {
        const tone = item.tone ?? "gray";
        const styles = toneStyles[tone];
        return (
          <div
            key={item.label}
            className={`p-4 rounded-lg border ${styles.bg} ${styles.border} flex flex-col gap-2 h-full`}
          >
            <div className="flex items-center justify-between gap-2 text-sm font-semibold text-foreground">
              <span>{item.label}</span>
              {item.icon ? <span>{item.icon}</span> : null}
            </div>
            <div className={`text-2xl font-bold ${styles.text}`}>{item.value}</div>
            {item.hint ? <div className="text-xs text-gray-500">{item.hint}</div> : null}
          </div>
        );
      })}
    </div>
  );
}
