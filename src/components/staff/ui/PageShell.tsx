import React from "react";

interface PageShellProps {
  title: string;
  description?: string;
  icon?: React.ComponentType<{ className?: string }>;
  actions?: React.ReactNode;
  children: React.ReactNode;
}

export function PageShell({ title, description, icon: Icon, actions, children }: PageShellProps) {
  return (
    <div className="min-h-screen bg-background">
      <div className="container max-w-7xl mx-auto px-4 py-8 space-y-8">
        {/* Header */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-4">
            {Icon && (
              <div className="p-3 rounded-xl bg-primary/10">
                <Icon className="w-8 h-8 text-primary" />
              </div>
            )}
            <div className="space-y-1">
              <h1 className="text-3xl font-bold text-foreground tracking-tight">{title}</h1>
              {description && (
                <p className="text-sm text-muted-foreground max-w-3xl">{description}</p>
              )}
            </div>
          </div>
          {actions && (
            <div className="flex items-center gap-2 flex-wrap">
              {actions}
            </div>
          )}
        </div>

        {/* Content */}
        {children}
      </div>
    </div>
  );
}
