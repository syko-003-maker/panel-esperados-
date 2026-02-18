import React from "react";
import { cn } from "@/lib/utils";

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
    <div
      className={cn(
        "bg-slate-900/40 border border-slate-800 rounded-2xl shadow-lg backdrop-blur-sm",
        className
      )}
    >
      {(title || description || actions) && (
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            {Icon && (
              <div className="p-2 rounded-lg bg-primary/10">
                <Icon className="w-5 h-5 text-primary" />
              </div>
            )}
            <div className="space-y-1">
              {title && <h2 className="text-xl font-semibold text-foreground">{title}</h2>}
              {description && <p className="text-sm text-muted-foreground">{description}</p>}
            </div>
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}
