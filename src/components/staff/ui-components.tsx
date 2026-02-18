"use client";

import { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
}

export function PageHeader({ title, description, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
      <div className="flex-1 min-w-0">
        <h1 className="text-4xl font-bold tracking-tight">{title}</h1>
        {description && (
          <p className="text-muted-foreground mt-2">{description}</p>
        )}
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
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
    <div
      className={`rounded-lg border border-border bg-card/50 p-6 space-y-2 ${className}`}
    >
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground font-medium">{label}</p>
        {icon && <div className="text-muted-foreground">{icon}</div>}
      </div>
      <div className="flex items-baseline justify-between">
        <p className="text-3xl font-bold">{value}</p>
        {trend && (
          <span
            className={`text-xs font-semibold ${
              trend.direction === "up"
                ? "text-green-600"
                : "text-red-600"
            }`}
          >
            {trend.direction === "up" ? "↑" : "↓"} {Math.abs(trend.value)}%
          </span>
        )}
      </div>
    </div>
  );
}

interface TableProps {
  headers: Array<{ label: string; className?: string }>;
  children: ReactNode;
  empty?: ReactNode;
}

export function DataTable({ headers, children, empty }: TableProps) {
  return (
    <div className="rounded-lg border border-border overflow-hidden bg-card/30">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-card/50">
              {headers.map((header, idx) => (
                <th
                  key={idx}
                  className={`px-4 py-3 text-left font-semibold text-foreground ${
                    header.className || ""
                  }`}
                >
                  {header.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {children}
          </tbody>
        </table>
        {empty && <div className="p-8 text-center text-muted-foreground">{empty}</div>}
      </div>
    </div>
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
    <div className={`space-y-4 ${className}`}>
      <div>
        <h2 className="text-2xl font-bold tracking-tight">{title}</h2>
        {description && (
          <p className="text-muted-foreground mt-1">{description}</p>
        )}
      </div>
      {children}
    </div>
  );
}
