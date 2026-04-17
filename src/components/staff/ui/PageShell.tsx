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
        <div className="relative overflow-hidden rounded-[28px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,5,7,0.78),rgba(10,3,5,0.86))] px-6 py-6 shadow-[0_30px_80px_-38px_rgba(2,0,1,0.90)] backdrop-blur-xl sm:px-8">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(122,31,43,0.22),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(245,158,11,0.07),transparent_32%)]" />
          <div className="relative flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-4">
              {Icon && (
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[#7a1f2b]/35 bg-[#7a1f2b]/20 shadow-[0_12px_30px_rgba(122,31,43,0.18)]">
                  <Icon className="h-7 w-7 text-amber-300" />
                </div>
              )}
              <div className="space-y-2">
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Espace staff</div>
                <h1 className="text-3xl font-semibold tracking-tight text-slate-50 sm:text-[2rem]">{title}</h1>
                {description && (
                  <p className="max-w-3xl text-sm leading-6 text-slate-300">{description}</p>
                )}
              </div>
            </div>
            {actions && <div className="relative flex flex-wrap items-center gap-2">{actions}</div>}
          </div>
        </div>
      </MotionSection>

      <MotionSection delay={0.04}>
        <div className="space-y-6">{children}</div>
      </MotionSection>
    </div>
  );
}
