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

export function SectionCard({ title, description, icon: Icon, actions, children, className }: SectionCardProps) {
  return (
    <MotionCard
      className={cn(
        "relative overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,5,7,0.68),rgba(10,3,5,0.78))] shadow-[0_24px_64px_-40px_rgba(2,0,1,0.80)] backdrop-blur-xl transition-all duration-200",
        className
      )}
    >
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(255,255,255,0.06),transparent_18%),linear-gradient(180deg,rgba(255,255,255,0.02),transparent_38%)]" />
      {(title || description || actions) && (
        <div className="relative flex flex-col gap-3 border-b border-white/8 px-6 py-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#7a1f2b]/30 bg-[#7a1f2b]/15">
                <Icon className="w-5 h-5 text-amber-300" />
              </div>
            )}
            <div className="space-y-1">
              {title && <h2 className="text-[17px] font-semibold tracking-tight text-slate-50">{title}</h2>}
              {description && <p className="text-[13px] leading-5 text-slate-400">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="relative p-6">{children}</div>
    </MotionCard>
  );
}
