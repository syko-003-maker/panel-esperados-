import { ReactNode } from "react";
import { cn } from "@/lib/cn";

type PremiumCardProps = {
  children: ReactNode;
  className?: string;
  hover?: boolean;
  gradient?: "purple" | "blue" | "emerald" | "pink" | "none";
};

const gradients = {
  purple: "from-purple-500/5 via-transparent to-transparent",
  blue: "from-blue-500/5 via-transparent to-transparent",
  emerald: "from-emerald-500/5 via-transparent to-transparent",
  pink: "from-pink-500/5 via-transparent to-transparent",
  none: "",
};

export function PremiumCard({ children, className, hover = true, gradient = "none" }: PremiumCardProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl bg-gradient-to-br",
        gradient !== "none" && gradients[gradient],
        "backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/20",
        hover && "transition-all duration-300 hover:scale-[1.02] hover:shadow-purple-500/20 hover:border-white/20",
        className
      )}
    >
      {/* Subtle animated glow */}
      {hover && (
        <div className="absolute -inset-px bg-gradient-to-r from-purple-500/0 via-purple-500/5 to-pink-500/0 opacity-0 group-hover:opacity-100 blur-xl transition-opacity duration-500"></div>
      )}
      <div className="relative">{children}</div>
    </div>
  );
}

export function PremiumCardHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-6 pt-6 pb-4", className)}>{children}</div>;
}

export function PremiumCardTitle({ children, className }: { children: ReactNode; className?: string }) {
  return <h3 className={cn("text-xl font-bold text-white tracking-tight", className)}>{children}</h3>;
}

export function PremiumCardDescription({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cn("text-sm text-gray-400 mt-1", className)}>{children}</p>;
}

export function PremiumCardContent({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-6 pb-6", className)}>{children}</div>;
}
