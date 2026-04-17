import React from "react";
import { Button } from "@/components/ui/button";
import { MotionSection, MotionButtonFrame } from "./motion";

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, description, actionLabel, onAction }: EmptyStateProps) {
  return (
    <MotionSection className="rounded-[24px] border border-white/8 bg-[linear-gradient(180deg,rgba(14,5,7,0.62),rgba(10,3,5,0.72))] px-6 py-16 text-center shadow-[0_30px_80px_-40px_rgba(2,0,1,0.70)] backdrop-blur-xl">
      {icon && (
        <div className="mb-4 text-6xl text-muted-foreground opacity-60">
          {icon}
        </div>
      )}
      <h3 className="mb-2 text-xl font-semibold text-slate-50">{title}</h3>
      {description && (
        <p className="mx-auto mb-6 max-w-md text-sm leading-6 text-slate-400">{description}</p>
      )}
      {actionLabel && onAction && (
        <MotionButtonFrame>
          <Button onClick={onAction} variant="outline">
            {actionLabel}
          </Button>
        </MotionButtonFrame>
      )}
    </MotionSection>
  );
}
