"use client";

import { ReactNode } from "react";
import { MotionButtonFrame, MotionCard, MotionSection } from "@/components/staff/ui/motion";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <MotionSection className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex-1 min-w-0">
        <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">Vue staff</div>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-50 sm:text-4xl">{title}</h1>
        {description && (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-400">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </MotionSection>
  );
}

interface StatCardProps {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  trend?: { value: number; direction: "up" | "down" };
  className?: string;
}

export function StatCard({
  icon,
  label,
  value,
  trend,
  className = "",
}: StatCardProps) {
  return (
    <MotionCard className={`rounded-[22px] border border-white/8 bg-[linear-gradient(180deg,hsl(var(--sunset-surface)/0.72),hsl(var(--sunset-surface2)/0.82))] p-5 shadow-[0_22px_58px_-36px_hsl(var(--sunset-surface2)/0.80)] backdrop-blur-xl ${className}`}>
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">{label}</p>
        {icon && <div className="text-slate-400">{icon}</div>}
      </div>
      <div className="mt-3 flex items-baseline justify-between gap-4">
        <p className="text-3xl font-semibold text-slate-50">{value}</p>
        {trend && (
          <span
            className={`text-xs font-semibold ${
              trend.direction === "up"
                ? "text-emerald-300"
                : "text-red-300"
            }`}
          >
            {trend.direction === "up" ? "↑" : "↓"} {Math.abs(trend.value)}%
          </span>
        )}
      </div>
    </MotionCard>
  );
}

interface TableProps {
  headers: Array<{ label: string; className?: string }>;
  children: ReactNode;
  empty?: ReactNode;
}

export function DataTable({ headers, children, empty }: TableProps) {
  return (
    <MotionSection className="overflow-hidden rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,hsl(var(--sunset-surface)/0.68),hsl(var(--sunset-surface2)/0.78))] shadow-[0_24px_64px_-38px_hsl(var(--sunset-surface2)/0.75)] backdrop-blur-xl">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-white/8 bg-white/[0.03]">
              {headers.map((header, idx) => (
                <th
                  key={idx}
                  className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 ${
                    header.className || ""
                  }`}
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/8">
            {children}
          </tbody>
        </table>
        {empty && <div className="p-8 text-center text-slate-400">{empty}</div>}
      </div>
    </MotionSection>
  );
}

interface SectionProps {
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Section({ title, description, children, className = "" }: SectionProps) {
  return (
    <MotionSection className={`space-y-4 ${className}`}>
      <div>
        <h2 className="text-2xl font-semibold tracking-tight text-slate-50">{title}</h2>
        {description && (
          <p className="mt-1 text-sm leading-6 text-slate-400">{description}</p>
        )}
      </div>
      {children}
    </MotionSection>
  );
}
