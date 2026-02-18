import { ReactNode } from "react";

type StatCardItem = {
  label: string;
  value: ReactNode;
  tone?: "blue" | "green" | "yellow" | "red" | "gray" | "emerald";
  icon?: ReactNode;
  hint?: string;
};

type StatCardsProps = {
  items: StatCardItem[];
};

const toneStyles: Record<NonNullable<StatCardItem["tone"]>, { gradient: string; glow: string; icon: string }> = {
  blue: { 
    gradient: "from-blue-500/10 via-blue-600/5 to-transparent", 
    glow: "shadow-blue-500/20",
    icon: "text-blue-400"
  },
  green: { 
    gradient: "from-green-500/10 via-green-600/5 to-transparent", 
    glow: "shadow-green-500/20",
    icon: "text-green-400"
  },
  emerald: { 
    gradient: "from-emerald-500/10 via-emerald-600/5 to-transparent", 
    glow: "shadow-emerald-500/20",
    icon: "text-emerald-400"
  },
  yellow: { 
    gradient: "from-amber-500/10 via-amber-600/5 to-transparent", 
    glow: "shadow-amber-500/20",
    icon: "text-amber-400"
  },
  red: { 
    gradient: "from-red-500/10 via-red-600/5 to-transparent", 
    glow: "shadow-red-500/20",
    icon: "text-red-400"
  },
  gray: { 
    gradient: "from-gray-500/10 via-gray-600/5 to-transparent", 
    glow: "shadow-gray-500/20",
    icon: "text-gray-400"
  },
};

export function MemberStatCards({ items }: StatCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {items.map((item) => {
        const tone = item.tone ?? "gray";
        const styles = toneStyles[tone];
        return (
          <div
            key={item.label}
            className={`group relative overflow-hidden rounded-2xl bg-gradient-to-br ${styles.gradient} 
              backdrop-blur-xl border border-white/10 p-6 transition-all duration-300 
              hover:scale-105 hover:border-white/20 hover:shadow-2xl ${styles.glow}`}
          >
            {/* Background Glow Effect */}
            <div className={`absolute -inset-0.5 bg-gradient-to-r ${styles.gradient} opacity-0 group-hover:opacity-30 blur-xl transition-opacity duration-500`}></div>
            
            <div className="relative flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-400 uppercase tracking-wider">{item.label}</span>
                {item.icon && <span className={`text-2xl ${styles.icon} transition-transform group-hover:scale-110`}>{item.icon}</span>}
              </div>
              <div className="text-3xl font-bold text-white tracking-tight">{item.value}</div>
              {item.hint && <div className="text-xs text-gray-500 font-medium">{item.hint}</div>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
