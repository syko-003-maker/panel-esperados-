import { ReactNode } from "react";
import { MotionSection } from "@/components/staff/ui";

type StaffPageProps = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function StaffPage({ title, subtitle, actions, children }: StaffPageProps) {
  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <MotionSection className="rounded-[28px] border border-white/10 bg-[linear-gradient(180deg,rgba(15,23,42,0.82),hsl(var(--sunset-surface3)/0.9))] px-6 py-6 shadow-[0_30px_80px_-38px_hsl(var(--sunset-surface3)/0.95)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Espace staff</div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50">{title}</h1>
            {subtitle ? <p className="mt-2 text-sm leading-6 text-slate-400">{subtitle}</p> : null}
          </div>
          {actions ? <div className="flex-shrink-0">{actions}</div> : null}
        </div>
      </MotionSection>
      <div className="space-y-6">
        {children}
      </div>
    </div>
  );
}
