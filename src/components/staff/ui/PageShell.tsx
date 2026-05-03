import React from "react";
import { MotionSection } from "./motion";

interface PageShellProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell({ title, description, icon: Icon, actions, children }: PageShellProps) {
  return (
    <div className="mx-auto w-full max-w-[96rem] space-y-6">
      <MotionSection>
        <div className="relative overflow-hidden rounded-2xl border border-white/8 bg-[linear-gradient(180deg,rgba(14,5,7,0.78),rgba(10,3,5,0.86))] px-5 py-4 shadow-[0_20px_60px_-30px_rgba(2,0,1,0.90)] backdrop-blur-xl sm:px-6">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(122,31,43,0.20),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.06),transparent_32%)]" />
          <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              {Icon && (
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#9b2335]/40 bg-[#9b2335]/25 shadow-[0_8px_20px_rgba(155,35,53,0.22)]">
                  <Icon className="h-5 w-5 text-amber-300" />
                </div>
              )}
              <div>
                <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                  <h1 className="text-xl font-bold tracking-tight text-slate-50 sm:text-2xl">{title}</h1>
                  {description && (
                    <p className="text-xs leading-5 text-slate-400">{description}</p>
                  )}
                </div>
              </div>
            </div>
            {actions && <div className="relative flex flex-wrap items-center gap-2 shrink-0">{actions}</div>}
          </div>
        </div>
      </MotionSection>

      <MotionSection delay={0.04}>
        <div className="space-y-6">{children}</div>
      </MotionSection>
    </div>
  );
}
